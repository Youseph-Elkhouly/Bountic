import type { PurchaseResult, QatomReceiptEvent } from "./types.js";

/**
 * `in_flight` and `unknown` mean money may have moved: the guard never buys again under
 * that key until a human or reconciler confirms the outcome from the last receipt and balance.
 */
export type LedgerEntry = {
  bountyId: string;
  amountThousandths: bigint;
  state: "in_flight" | "unknown" | "settled";
  result?: PurchaseResult;
  event?: QatomReceiptEvent;
  delivered: boolean;
};

export interface PurchaseLedger {
  get(key: string): Promise<LedgerEntry | undefined>;
  set(key: string, entry: LedgerEntry): Promise<void>;
  /**
   * Spending that counts against the bounty budget. Every entry that reached checkout counts at its
   * price (Qatom may charge for a call the seller rejects); guard refusals are recorded at zero.
   */
  committedThousandths(bountyId: string): Promise<bigint>;
}

/** Process-local ledger for tests and the demo. Production should back this with durable storage. */
export class InMemoryLedger implements PurchaseLedger {
  private readonly entries = new Map<string, LedgerEntry>();

  async get(key: string) { return this.entries.get(key); }
  async set(key: string, entry: LedgerEntry) { this.entries.set(key, entry); }
  async committedThousandths(bountyId: string) {
    let total = 0n;
    for (const entry of this.entries.values()) if (entry.bountyId === bountyId) total += entry.amountThousandths;
    return total;
  }
}
