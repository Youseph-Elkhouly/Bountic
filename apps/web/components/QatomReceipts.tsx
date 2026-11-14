import { StatusPill } from "@/components/DashboardShell";

export type QatomReceipt = {
  id: string; bounty_id: string; agent_id: string; status: string; transaction_id: string | null;
  item_name: string; item_id: string; seller: string; amount_usd_tdn: string | number;
  approval_url: string | null; rejection_reason: string | null; occurred_at: string;
};
export const qatomReceiptColumns = "id,bounty_id,agent_id,status,transaction_id,item_name,item_id,seller,amount_usd_tdn,approval_url,rejection_reason,occurred_at";

// Sums in thousandths of a USD-TDN so totals never pass through floating point.
export function totalUsdTdn(receipts: QatomReceipt[]) {
  const thousandths = receipts.filter((receipt) => receipt.status === "completed").reduce((sum, receipt) => {
    const [whole, fraction = ""] = String(receipt.amount_usd_tdn).split(".");
    return sum + BigInt(whole) * BigInt(1000) + BigInt((fraction + "000").slice(0, 3));
  }, BigInt(0));
  return `${thousandths / BigInt(1000)}.${(thousandths % BigInt(1000)).toString().padStart(3, "0")}`;
}

const formatAmount = (value: string | number) => totalUsdTdn([{ amount_usd_tdn: value, status: "completed" } as QatomReceipt]);

// Item names, sellers and reasons come from the Qatom catalog and are rendered as plain text only.
export function QatomReceipts({ receipts, bountyTitles, agentNames, showApprovalLinks = false }: {
  receipts: QatomReceipt[]; bountyTitles: Map<string, string>; agentNames: Map<string, string>; showApprovalLinks?: boolean;
}) {
  if (!receipts.length) return <div className="empty-state compact"><h3>No tool purchases yet</h3><p>Purchases agents make through Qatom while working on a bounty appear here with their receipts. Purchases above the auto-approve limit wait for a human.</p></div>;
  return <div className="space-y-2">{receipts.map((receipt) => <article className="activity-row" key={receipt.id}>
    <span><strong>{receipt.item_name || receipt.item_id} · {formatAmount(receipt.amount_usd_tdn)} USD-TDN</strong>
      <small>{agentNames.get(receipt.agent_id) || "Agent"} · {bountyTitles.get(receipt.bounty_id) || "Bounty"} · seller {receipt.seller} · {new Date(receipt.occurred_at).toLocaleString()}</small>
      {receipt.transaction_id && <small className="font-mono" title={receipt.transaction_id}>tx {receipt.transaction_id.length > 24 ? `${receipt.transaction_id.slice(0, 12)}…${receipt.transaction_id.slice(-6)}` : receipt.transaction_id}</small>}
      {receipt.status === "rejected" && receipt.rejection_reason && <small>Refused: {receipt.rejection_reason}</small>}
    </span>
    <span className="flex items-center gap-2"><StatusPill value={receipt.status} />{showApprovalLinks && receipt.status === "pending_approval" && receipt.approval_url?.startsWith("https://") && <a className="text-xs underline" href={receipt.approval_url} target="_blank" rel="noreferrer noopener">Review purchase</a>}</span>
  </article>)}</div>;
}
