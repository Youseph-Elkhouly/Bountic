/**
 * End-to-end Qatom demo through the spending guard. It spends real USD-TDN from the agent
 * wallet, so it only runs with QATOM_DEMO_CONFIRM_SPEND=yes after a human has funded the wallet.
 */
import { randomUUID } from "node:crypto";
import {
  QatomClient, QatomOutcomeUnknownError, SpendingGuard, createReceiptReporter, formatUsdTdn, parseUsdTdn, qatomConfigFromEnv,
  type PlannedPurchase, type PurchaseResult, type QatomReceiptEvent,
} from "../src/qatom/index.js";

const env = process.env;
if (env.QATOM_DEMO_CONFIRM_SPEND !== "yes") {
  console.error("Refusing to run: this demo makes real Qatom purchases. Fund the agent wallet with a few USD-TDN, then set QATOM_DEMO_CONFIRM_SPEND=yes.");
  process.exit(1);
}
const query = env.QATOM_DEMO_QUERY || "";
const cheapId = env.QATOM_DEMO_CHEAP_ITEM || "";
const approvalId = env.QATOM_DEMO_APPROVAL_ITEM || "";
if (!query || !cheapId || !approvalId) {
  console.error("Set QATOM_DEMO_QUERY, QATOM_DEMO_CHEAP_ITEM (under the auto-approve limit) and QATOM_DEMO_APPROVAL_ITEM (above it).");
  process.exit(1);
}
const maxBudget = parseUsdTdn(env.QATOM_DEMO_MAX_BUDGET || "5.000");
const bountyId = env.QATOM_DEMO_BOUNTY_ID || randomUUID();
const agentId = env.QATOM_DEMO_AGENT_ID || randomUUID();
const runId = env.QATOM_DEMO_RUN_ID || Date.now().toString(36);

const report = env.BOUNTIQ_API_URL && env.INTERNAL_WORKER_TOKEN
  ? createReceiptReporter({ apiUrl: env.BOUNTIQ_API_URL, internalWorkerToken: env.INTERNAL_WORKER_TOKEN })
  : null;
const show = (label: string, result: PurchaseResult) => console.log(`${label}:`, JSON.stringify(result, null, 2));

const qatom = await QatomClient.connect(qatomConfigFromEnv());
try {
  console.log("1. Agent wallet balance:", (await qatom.getAgentWallet()).balanceUsdTdn, "USD-TDN");

  const items = await qatom.searchCatalog(query);
  console.log(`2. Catalog search "${query}": ${items.length} items`);
  for (const item of items.slice(0, 10)) console.log(`   - ${item.id} · ${item.priceUsdTdn} USD-TDN · seller ${item.seller}`);
  const cheap = items.find((item) => item.id === cheapId) ?? await qatom.getCatalogItem(cheapId);
  const approval = items.find((item) => item.id === approvalId) ?? await qatom.getCatalogItem(approvalId);
  if (!cheap || !approval) throw new Error("Demo items were not found in the catalog");

  // Exactly enough for one cheap purchase and one approval, so a second approval-sized purchase is over budget.
  const budget = parseUsdTdn(cheap.priceUsdTdn) + parseUsdTdn(approval.priceUsdTdn);
  if (budget > maxBudget) throw new Error(`Demo budget ${formatUsdTdn(budget)} USD-TDN exceeds QATOM_DEMO_MAX_BUDGET`);
  console.log(`   Tool budget for bounty ${bountyId}: ${formatUsdTdn(budget)} USD-TDN`);

  const guard = new SpendingGuard({
    qatom,
    budgetUsdTdn: () => formatUsdTdn(budget),
    onReceipt: async (event: QatomReceiptEvent) => { if (report) await report(event); },
  });
  const planFor = (item: typeof cheap, stepId: string, input: Record<string, unknown> = {}): PlannedPurchase => ({
    bountyId, agentId, stepId: `${runId}-${stepId}`, itemId: item.id, expectedPriceUsdTdn: item.priceUsdTdn, expectedSeller: item.seller, input,
  });
  const cheapInput = env.QATOM_DEMO_CHEAP_INPUT ? JSON.parse(env.QATOM_DEMO_CHEAP_INPUT) as Record<string, unknown> : {};

  const bought = await guard.purchase(planFor(cheap, "cheap", cheapInput));
  show("3. Purchase under the auto-approve limit", bought);
  if (bought.status === "completed") console.log("   Transaction ID:", bought.receipt.transactionId);

  show("4. Purchase above the auto-approve limit", await guard.purchase(planFor(approval, "approval")));
  show("5. Purchase over the bounty budget", await guard.purchase(planFor(approval, "over-budget")));

  const before = (await qatom.getAgentWallet()).balanceUsdTdn;
  const repeat = await guard.purchase(planFor(cheap, "cheap", cheapInput));
  const after = (await qatom.getAgentWallet()).balanceUsdTdn;
  show("6. Same purchase again (same idempotency key)", repeat);
  console.log(`   Wallet before ${before}, after ${after} USD-TDN: ${before === after ? "no second charge" : "BALANCE CHANGED, investigate"}`);
  if (!report) console.log("\nReceipts were not sent to Bountiq (set BOUNTIQ_API_URL and INTERNAL_WORKER_TOKEN with real bounty and agent IDs).");
} catch (error) {
  if (error instanceof QatomOutcomeUnknownError) console.error(`${error.message}\nDo not rerun until the last receipt and balance are checked.`);
  throw error;
} finally {
  await qatom.close();
}
