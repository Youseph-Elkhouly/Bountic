import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { parseUsdTdn } from "./amount.js";
import type { AgentWallet, CatalogItem, CheckoutOutcome, QatomPort, QatomReceipt } from "./types.js";

export type QatomConfig = {
  mcpUrl: string;
  /** OAuth access token from a human Qatom sign-in (email + 2FA); tokens last about an hour. */
  accessToken: string;
};

export function qatomConfigFromEnv(env: NodeJS.ProcessEnv = process.env): QatomConfig {
  const mcpUrl = env.QATOM_MCP_URL || "https://mcp.m.todaq.net/mcp";
  const accessToken = env.QATOM_ACCESS_TOKEN || "";
  if (!accessToken) throw new Error("Set QATOM_ACCESS_TOKEN to an access token from a Qatom sign-in");
  if (new URL(mcpUrl).protocol !== "https:") throw new Error("QATOM_MCP_URL must use https");
  return { mcpUrl, accessToken };
}

/** Raised when Qatom answers in a shape this module has not confirmed; nothing is inferred from it. */
export class QatomResponseShapeError extends Error {
  constructor(tool: string, readonly payload: unknown) {
    super(`Unrecognised ${tool} response from Qatom. Run npm run qatom:discover and update src/qatom/client.ts.`);
    this.name = "QatomResponseShapeError";
  }
}

/**
 * Tool names come from qatom.ai/capabilities. Argument and response field names are NOT in the
 * published docs; they are kept here, in one place, and must be confirmed against the live
 * tools/list output (npm run qatom:discover) before a real purchase.
 */
const TOOLS = { search: "catalog_search", wallet: "agent_wallet_info", checkout: "agent_checkout" } as const;
const UNCONFIRMED = {
  searchArgs: (query: string) => ({ query }),
  checkoutArgs: (itemId: string, input: Record<string, unknown>) => ({ item_id: itemId, arguments: input }),
};

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown) => typeof value === "string" ? value : null;
const amount = (value: unknown) => {
  if (typeof value !== "string") return null;
  try { parseUsdTdn(value); return value; } catch { return null; }
};
const httpsUrl = (value: unknown) => typeof value === "string" && value.startsWith("https://") ? value : null;

function catalogItem(value: unknown): CatalogItem | null {
  if (!isObject(value)) return null;
  const id = text(value.id), name = text(value.name), seller = text(value.seller), price = amount(value.price);
  if (!id || name === null || !seller || !price) return null;
  return { id, name, description: text(value.description) ?? "", priceUsdTdn: price, seller, inputSchema: value.input_schema ?? value.inputSchema };
}

function checkoutOutcome(itemId: string, payload: unknown): CheckoutOutcome {
  if (!isObject(payload)) throw new QatomResponseShapeError(TOOLS.checkout, payload);
  const approval = isObject(payload.approval) ? payload.approval : null;
  const approvalUrl = httpsUrl(approval?.approve_url ?? payload.approve_url);
  if (approvalUrl) {
    return { status: "pending_approval", approvalUrl, expiresAt: text(approval?.expires_at ?? payload.expires_at), approvalId: text(approval?.id ?? payload.approval_id), raw: payload };
  }
  const transactionId = text(payload.transaction_id), paid = amount(payload.amount ?? payload.amount_charged), seller = text(payload.seller);
  if (transactionId && paid && seller) {
    const receipt: QatomReceipt = { transactionId, itemId, seller, amountUsdTdn: paid, raw: payload };
    return { status: "completed", receipt };
  }
  throw new QatomResponseShapeError(TOOLS.checkout, payload);
}

export class QatomClient implements QatomPort {
  private constructor(private readonly mcp: Client) {}

  static async connect(config: QatomConfig): Promise<QatomClient> {
    const transport = new StreamableHTTPClientTransport(new URL(config.mcpUrl), {
      requestInit: { headers: { Authorization: `Bearer ${config.accessToken}` } },
    });
    const mcp = new Client({ name: "bountiq-payments", version: "0.1.0" });
    await mcp.connect(transport);
    return new QatomClient(mcp);
  }

  close() { return this.mcp.close(); }

  /** The live tool list with input and output schemas, for confirming the field names above. */
  async listTools() { return (await this.mcp.listTools()).tools; }

  async searchCatalog(query: string): Promise<CatalogItem[]> {
    const payload = await this.call(TOOLS.search, UNCONFIRMED.searchArgs(query));
    const rows = Array.isArray(payload) ? payload : isObject(payload) && Array.isArray(payload.items) ? payload.items : null;
    if (!rows) throw new QatomResponseShapeError(TOOLS.search, payload);
    const items = rows.map(catalogItem);
    if (items.some((item) => !item)) throw new QatomResponseShapeError(TOOLS.search, payload);
    return items as CatalogItem[];
  }

  /** Qatom has no lookup by id, so search for it and accept only an exact id match. */
  async getCatalogItem(itemId: string): Promise<CatalogItem | null> {
    return (await this.searchCatalog(itemId)).find((item) => item.id === itemId) ?? null;
  }

  async getAgentWallet(): Promise<AgentWallet> {
    const payload = await this.call(TOOLS.wallet, {});
    const wallet = isObject(payload) && isObject(payload.agent_wallet) ? payload.agent_wallet : null;
    const balance = amount(wallet?.balance);
    if (!balance) throw new QatomResponseShapeError(TOOLS.wallet, payload);
    return { balanceUsdTdn: balance };
  }

  /** Every call is a new charge, even under auto-approve. Only SpendingGuard should call this. */
  async checkout(itemId: string, input: Record<string, unknown>): Promise<CheckoutOutcome> {
    return checkoutOutcome(itemId, await this.call(TOOLS.checkout, UNCONFIRMED.checkoutArgs(itemId, input)));
  }

  private async call(name: string, args: Json): Promise<unknown> {
    const result = await this.mcp.callTool({ name, arguments: args });
    const content = Array.isArray(result.content) ? result.content : [];
    const message = content.map((part) => isObject(part) && part.type === "text" ? String(part.text) : "").join("\n");
    if (result.isError) throw new Error(`Qatom ${name} failed: ${message.slice(0, 500)}`);
    if (result.structuredContent !== undefined) return result.structuredContent;
    try { return JSON.parse(message); } catch { throw new QatomResponseShapeError(name, message); }
  }
}
