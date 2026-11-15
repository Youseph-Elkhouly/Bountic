export type QatomReceipt = {
  id: string; bounty_id: string; agent_id: string; status: string; transaction_id: string | null;
  item_name: string; item_id: string; seller: string; amount_usd_tdn: string | number;
  approval_url: string | null; rejection_reason: string | null; occurred_at: string;
};
export const qatomReceiptColumns = "id,bounty_id,agent_id,status,transaction_id,item_name,item_id,seller,amount_usd_tdn,approval_url,rejection_reason,occurred_at";

const thousandthsOf = (value: string | number) => {
  const [whole, fraction = ""] = String(value).split(".");
  return BigInt(whole) * BigInt(1000) + BigInt((fraction + "000").slice(0, 3));
};
const print = (thousandths: bigint) => `${thousandths / BigInt(1000)}.${(thousandths % BigInt(1000)).toString().padStart(3, "0")}`;

/** Formats in thousandths of a USD-TDN so amounts never pass through floating point. */
export const usdTdn = (value: string | number) => print(thousandthsOf(value));

/** Total of completed purchases only. */
export const totalUsdTdn = (receipts: QatomReceipt[]) =>
  print(receipts.filter((receipt) => receipt.status === "completed").reduce((sum, receipt) => sum + thousandthsOf(receipt.amount_usd_tdn), BigInt(0)));
