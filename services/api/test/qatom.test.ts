import { test } from "node:test";
import assert from "node:assert/strict";
import { planQatomReceiptWrite, usdTdnThousandths, type StoredQatomReceipt } from "../src/qatom.js";
import { qatomReceiptSchema } from "../src/schemas.js";

process.env.NODE_ENV = "test";
process.env.SUPABASE_URL = "https://bountiq-test.supabase.co";
process.env.SUPABASE_ANON_KEY = "test-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-key";
process.env.INTERNAL_WORKER_TOKEN = "test-worker-token";

const { default: app } = await import("../src/server.js");

const bountyId = "8ba6dc10-46fd-4fea-a466-d6cc31069f27";
const agentId = "7d6f1950-90c9-4fe3-9fb2-bb08d20f1cc8";
const completed = {
  idempotencyKey: `${bountyId}:${agentId}:item-1:step-1`, bountyId, agentId, status: "completed" as const,
  transactionId: "tx-1", itemId: "item-1", itemName: "Weather API call", seller: "seller-1", amountUsdTdn: "0.010",
  approvalUrl: null, rejectionReason: null, receipt: { id: "tx-1" }, occurredAt: "2026-11-14T10:00:00.000Z",
};
const parse = (value: object) => qatomReceiptSchema.parse(value);
const stored = (overrides: Partial<StoredQatomReceipt> = {}): StoredQatomReceipt => ({
  bounty_id: bountyId, agent_id: agentId, status: "completed", transaction_id: "tx-1", item_id: "item-1", seller: "seller-1", amount_usd_tdn: 0.01, ...overrides,
});

test("receipt contract requires decimal-string amounts and status-specific fields", () => {
  assert.equal(qatomReceiptSchema.safeParse(completed).success, true);
  assert.equal(qatomReceiptSchema.safeParse({ ...completed, amountUsdTdn: 0.01 }).success, false);
  assert.equal(qatomReceiptSchema.safeParse({ ...completed, amountUsdTdn: "0.0100" }).success, false);
  assert.equal(qatomReceiptSchema.safeParse({ ...completed, transactionId: null }).success, false);
  assert.equal(qatomReceiptSchema.safeParse({ ...completed, status: "pending_approval", transactionId: null }).success, false);
  assert.equal(qatomReceiptSchema.safeParse({ ...completed, status: "pending_approval", transactionId: null, approvalUrl: "http://qatom.example/approve" }).success, false);
  assert.equal(qatomReceiptSchema.safeParse({ ...completed, status: "pending_approval", transactionId: null, approvalUrl: "https://qatom.example/approve" }).success, true);
  assert.equal(qatomReceiptSchema.safeParse({ ...completed, status: "rejected", transactionId: null }).success, false);
  assert.equal(qatomReceiptSchema.safeParse({ ...completed, status: "rejected", transactionId: null, rejectionReason: "Over budget" }).success, true);
});

test("receipt idempotency key must name the same bounty, agent and item plus a step", () => {
  assert.equal(qatomReceiptSchema.safeParse({ ...completed, idempotencyKey: `${bountyId}:${agentId}:item-2:step-1` }).success, false);
  assert.equal(qatomReceiptSchema.safeParse({ ...completed, idempotencyKey: `${bountyId}:${agentId}:item-1:` }).success, false);
});

test("amounts compare as fixed-point thousandths", () => {
  assert.equal(usdTdnThousandths("0.010"), 10n);
  assert.equal(usdTdnThousandths(0.01), 10n);
  assert.equal(usdTdnThousandths("12.5"), 12_500n);
});

test("a completed purchase is recorded once and never overwritten", () => {
  assert.equal(planQatomReceiptWrite(null, parse(completed)), "insert");
  assert.equal(planQatomReceiptWrite(stored(), parse(completed)), "duplicate");
  assert.equal(planQatomReceiptWrite(stored(), parse({ ...completed, transactionId: "tx-2" })), "conflict");
  assert.equal(planQatomReceiptWrite(stored(), parse({ ...completed, status: "rejected", transactionId: null, rejectionReason: "no" })), "conflict");
});

test("a pending approval can settle but its purchase details cannot change", () => {
  const pending = stored({ status: "pending_approval", transaction_id: null });
  assert.equal(planQatomReceiptWrite(pending, parse(completed)), "update");
  assert.equal(planQatomReceiptWrite(pending, parse({ ...completed, status: "rejected", transactionId: null, rejectionReason: "Approval expired" })), "update");
  assert.equal(planQatomReceiptWrite(pending, parse({ ...completed, amountUsdTdn: "0.020" })), "conflict");
  assert.equal(planQatomReceiptWrite(pending, parse({ ...completed, seller: "seller-2" })), "conflict");
});

test("internal receipt endpoint requires the worker token and a valid payload", async () => {
  const post = (headers: Record<string, string>, body: unknown) => app.request("/internal/qatom/receipts", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  assert.equal((await post({}, completed)).status, 401);
  assert.equal((await post({ authorization: "Bearer wrong-token" }, completed)).status, 401);
  assert.equal((await post({ authorization: "Bearer test-worker-token" }, { ...completed, amountUsdTdn: 0.01 })).status, 400);
});
