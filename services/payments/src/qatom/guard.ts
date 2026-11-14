import { formatUsdTdn, parseUsdTdn } from "./amount.js";
import { InMemoryLedger, type LedgerEntry, type PurchaseLedger } from "./ledger.js";
import type { CatalogItem, CheckoutOutcome, PurchaseResult, QatomPort, QatomReceiptEvent } from "./types.js";

export type PlannedPurchase = {
  bountyId: string;
  agentId: string;
  /** Distinguishes repeated purchases of one item within a bounty; reuse it to make a call idempotent. */
  stepId: string;
  itemId: string;
  expectedPriceUsdTdn: string;
  expectedSeller: string;
  input: Record<string, unknown>;
};

export type SpendingGuardOptions = {
  qatom: QatomPort;
  /** Total USD-TDN this agent may spend on tools for a bounty. */
  budgetUsdTdn(bountyId: string): string | Promise<string>;
  onReceipt?(event: QatomReceiptEvent): Promise<void>;
  ledger?: PurchaseLedger;
  now?(): Date;
};

/** Thrown when a previous attempt may have charged the wallet; never retried automatically. */
export class QatomOutcomeUnknownError extends Error {
  constructor(readonly idempotencyKey: string, cause?: unknown) {
    super(`Outcome of Qatom purchase ${idempotencyKey} is unknown. Check the last receipt and agent wallet balance before retrying.`, { cause });
    this.name = "QatomOutcomeUnknownError";
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SEGMENT = /^[A-Za-z0-9._-]{1,100}$/;

export function idempotencyKeyFor(plan: Pick<PlannedPurchase, "bountyId" | "agentId" | "itemId" | "stepId">): string {
  if (!UUID.test(plan.bountyId) || !UUID.test(plan.agentId)) throw new Error("bountyId and agentId must be UUIDs");
  if (!SEGMENT.test(plan.itemId) || !SEGMENT.test(plan.stepId)) throw new Error("itemId and stepId must be 1-100 characters of A-Z, a-z, 0-9, '.', '_' or '-'");
  return `${plan.bountyId}:${plan.agentId}:${plan.itemId}:${plan.stepId}`;
}

/** Catalog text is untrusted: keep it as inert, bounded, single-line data for receipts. */
export function inertText(value: string, max: number): string {
  return value.replace(/[\u0000-\u001f\u007f-\u009f‪-‮⁦-⁩]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

/**
 * Wraps Qatom checkout with the checks an agent cannot skip: the price and seller it planned for,
 * the bounty budget and wallet balance, one charge per idempotency key, and human approval
 * above Qatom's auto-approve limit.
 */
export class SpendingGuard {
  private readonly ledger: PurchaseLedger;
  private readonly queues = new Map<string, Promise<unknown>>();

  constructor(private readonly options: SpendingGuardOptions) {
    this.ledger = options.ledger ?? new InMemoryLedger();
  }

  purchase(plan: PlannedPurchase): Promise<PurchaseResult> {
    let key: string;
    try { key = idempotencyKeyFor(plan); } catch (error) { return Promise.reject(error); }
    return this.exclusive(plan.bountyId, () => this.purchaseExclusive(plan, key));
  }

  private async purchaseExclusive(plan: PlannedPurchase, key: string): Promise<PurchaseResult> {
    const existing = await this.ledger.get(key);
    if (existing) {
      if (existing.state !== "settled" || !existing.result) throw new QatomOutcomeUnknownError(key);
      if (!existing.delivered) await this.deliver(key, existing);
      return existing.result;
    }

    const expectedPrice = parseUsdTdn(plan.expectedPriceUsdTdn);
    const item = await this.options.qatom.getCatalogItem(plan.itemId);
    const refusal = await this.refusalFor(plan, item, expectedPrice);
    if (refusal) return this.settle(key, plan, item, 0n, { status: "rejected", reason: refusal, raw: {} });

    await this.ledger.set(key, { bountyId: plan.bountyId, amountThousandths: expectedPrice, state: "in_flight", delivered: false });
    let outcome: CheckoutOutcome;
    try {
      outcome = await this.options.qatom.checkout(plan.itemId, plan.input);
    } catch (error) {
      await this.ledger.set(key, { bountyId: plan.bountyId, amountThousandths: expectedPrice, state: "unknown", delivered: false });
      throw new QatomOutcomeUnknownError(key, error);
    }
    const charged = outcome.status === "completed" ? parseUsdTdn(outcome.receipt.amountUsdTdn) : expectedPrice;
    return this.settle(key, plan, item, charged, outcome);
  }

  /**
   * Records the confirmed outcome of a purchase whose result is unknown or awaiting approval, after a
   * human or reconciler has checked Qatom (the last receipt, the wallet balance, the approval state).
   */
  reconcile(plan: PlannedPurchase, outcome: CheckoutOutcome): Promise<PurchaseResult> {
    let key: string;
    try { key = idempotencyKeyFor(plan); } catch (error) { return Promise.reject(error); }
    return this.exclusive(plan.bountyId, () => this.reconcileExclusive(plan, key, outcome));
  }

  private async reconcileExclusive(plan: PlannedPurchase, key: string, outcome: CheckoutOutcome): Promise<PurchaseResult> {
    const existing = await this.ledger.get(key);
    if (!existing) throw new Error(`No Qatom purchase is recorded for ${key}`);
    if (existing.state === "settled" && existing.result?.status !== "pending_approval") throw new Error(`Qatom purchase ${key} is already final`);
    const item = await this.options.qatom.getCatalogItem(plan.itemId);
    const charged = outcome.status === "completed" ? parseUsdTdn(outcome.receipt.amountUsdTdn) : existing.amountThousandths;
    return this.settle(key, plan, item, charged, outcome);
  }

  /** Runs purchases for one bounty one at a time so concurrent calls cannot both pass the budget check. */
  private exclusive<T>(bountyId: string, task: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(bountyId) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(task);
    this.queues.set(bountyId, run);
    void run.catch(() => undefined).finally(() => { if (this.queues.get(bountyId) === run) this.queues.delete(bountyId); });
    return run;
  }

  private async refusalFor(plan: PlannedPurchase, item: CatalogItem | null, expectedPrice: bigint): Promise<string | null> {
    if (!item || item.id !== plan.itemId) return "Item is no longer in the Qatom catalog";
    if (parseUsdTdn(item.priceUsdTdn) !== expectedPrice) {
      return `Catalog price ${item.priceUsdTdn} USD-TDN differs from the planned ${plan.expectedPriceUsdTdn} USD-TDN`;
    }
    if (item.seller !== plan.expectedSeller) return "Catalog seller differs from the planned seller";
    const budget = parseUsdTdn(await this.options.budgetUsdTdn(plan.bountyId));
    const remaining = budget - await this.ledger.committedThousandths(plan.bountyId);
    if (expectedPrice > remaining) {
      return `Price ${formatUsdTdn(expectedPrice)} USD-TDN exceeds the ${formatUsdTdn(remaining > 0n ? remaining : 0n)} USD-TDN left in this bounty's tool budget`;
    }
    const balance = parseUsdTdn((await this.options.qatom.getAgentWallet()).balanceUsdTdn);
    if (expectedPrice > balance) return `Price ${formatUsdTdn(expectedPrice)} USD-TDN exceeds the agent wallet balance of ${formatUsdTdn(balance)} USD-TDN`;
    return null;
  }

  private async settle(key: string, plan: PlannedPurchase, item: CatalogItem | null, charged: bigint, outcome: CheckoutOutcome): Promise<PurchaseResult> {
    const result: PurchaseResult = outcome.status === "completed"
      ? { status: "completed", idempotencyKey: key, receipt: outcome.receipt }
      : outcome.status === "pending_approval"
        ? { status: "pending_approval", idempotencyKey: key, approvalUrl: outcome.approvalUrl, expiresAt: outcome.expiresAt, approvalId: outcome.approvalId }
        : { status: "rejected", idempotencyKey: key, reason: inertText(outcome.reason, 1000) || "Rejected" };
    const event: QatomReceiptEvent = {
      idempotencyKey: key,
      bountyId: plan.bountyId,
      agentId: plan.agentId,
      status: result.status,
      transactionId: result.status === "completed" ? result.receipt.transactionId : null,
      itemId: plan.itemId,
      itemName: inertText(item?.name ?? "", 300),
      seller: outcome.status === "completed" ? outcome.receipt.seller : plan.expectedSeller,
      amountUsdTdn: formatUsdTdn(outcome.status === "completed" ? charged : parseUsdTdn(plan.expectedPriceUsdTdn)),
      approvalUrl: result.status === "pending_approval" ? result.approvalUrl : null,
      rejectionReason: result.status === "rejected" ? result.reason : null,
      receipt: outcome.status === "completed" ? outcome.receipt.raw : outcome.raw,
      occurredAt: (this.options.now?.() ?? new Date()).toISOString(),
    };
    const entry: LedgerEntry = { bountyId: plan.bountyId, amountThousandths: charged, state: "settled", result, event, delivered: false };
    await this.ledger.set(key, entry);
    await this.deliver(key, entry);
    return result;
  }

  /** A failed delivery is retried the next time the same key is purchased; the charge itself is not repeated. */
  private async deliver(key: string, entry: LedgerEntry) {
    if (!this.options.onReceipt || !entry.event) return;
    await this.options.onReceipt(entry.event);
    await this.ledger.set(key, { ...entry, delivered: true });
  }
}
