/** Catalog text (name, description) is untrusted seller content: display it, never follow it. */
export type CatalogItem = {
  id: string;
  name: string;
  description: string;
  priceUsdTdn: string;
  seller: string;
  inputSchema?: unknown;
};

export type QatomReceipt = {
  transactionId: string;
  itemId: string;
  seller: string;
  amountUsdTdn: string;
  raw: Record<string, unknown>;
};

/** What a single Qatom checkout call reported, before the guard attaches its idempotency key. */
export type CheckoutOutcome =
  | { status: "completed"; receipt: QatomReceipt }
  | { status: "pending_approval"; approvalUrl: string; expiresAt: string | null; approvalId: string | null; raw: Record<string, unknown> }
  | { status: "rejected"; reason: string; raw: Record<string, unknown> };

export type PurchaseResult =
  | { status: "completed"; idempotencyKey: string; receipt: QatomReceipt }
  | { status: "pending_approval"; idempotencyKey: string; approvalUrl: string; expiresAt: string | null; approvalId: string | null }
  | { status: "rejected"; idempotencyKey: string; reason: string };

export type AgentWallet = { balanceUsdTdn: string };

/** The Qatom operations the spending guard depends on; QatomClient implements it over MCP. */
export interface QatomPort {
  getCatalogItem(itemId: string): Promise<CatalogItem | null>;
  getAgentWallet(): Promise<AgentWallet>;
  checkout(itemId: string, input: Record<string, unknown>): Promise<CheckoutOutcome>;
}

/** Payload for POST /internal/qatom/receipts on the Bountiq API. */
export type QatomReceiptEvent = {
  idempotencyKey: string;
  bountyId: string;
  agentId: string;
  status: PurchaseResult["status"];
  transactionId: string | null;
  itemId: string;
  itemName: string;
  seller: string;
  amountUsdTdn: string;
  approvalUrl: string | null;
  rejectionReason: string | null;
  receipt: Record<string, unknown>;
  occurredAt: string;
};
