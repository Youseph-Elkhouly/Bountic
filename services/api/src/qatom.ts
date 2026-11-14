import type { QatomReceiptInput } from "./schemas.js";

export type StoredQatomReceipt = {
  bounty_id: string; agent_id: string; status: QatomReceiptInput["status"]; transaction_id: string | null;
  item_id: string; seller: string; amount_usd_tdn: string | number;
};
export type QatomReceiptWrite = "insert" | "update" | "duplicate" | "conflict";

// Fixed-point thousandths so amounts are compared without floating point.
export function usdTdnThousandths(value: string | number): bigint {
  const [whole, fraction = ""] = String(value).split(".");
  return BigInt(whole) * 1000n + BigInt((fraction + "000").slice(0, 3));
}

export function qatomReceiptRow(input: QatomReceiptInput) {
  return {
    idempotency_key: input.idempotencyKey, bounty_id: input.bountyId, agent_id: input.agentId, status: input.status,
    transaction_id: input.transactionId, item_id: input.itemId, item_name: input.itemName, seller: input.seller,
    amount_usd_tdn: input.amountUsdTdn, approval_url: input.approvalUrl, rejection_reason: input.rejectionReason,
    receipt: input.receipt, occurred_at: input.occurredAt,
  };
}

// Decides how a receipt event applies to the row already stored under its idempotency key.
// A pending approval may be refreshed or settled; completed and rejected purchases are final.
export function planQatomReceiptWrite(existing: StoredQatomReceipt | null, input: QatomReceiptInput): QatomReceiptWrite {
  if (!existing) return "insert";
  const samePurchase = existing.bounty_id === input.bountyId && existing.agent_id === input.agentId && existing.item_id === input.itemId
    && existing.seller === input.seller && usdTdnThousandths(existing.amount_usd_tdn) === usdTdnThousandths(input.amountUsdTdn);
  if (!samePurchase) return "conflict";
  if (existing.status === "pending_approval") return "update";
  if (existing.status !== input.status) return "conflict";
  if (existing.status === "completed" && existing.transaction_id !== input.transactionId) return "conflict";
  return "duplicate";
}
