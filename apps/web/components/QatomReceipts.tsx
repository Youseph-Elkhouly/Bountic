import { Empty, Hash, Status } from "@/components/ui";
import { dayTime } from "@/lib/format";
import { usdTdn, type QatomReceipt } from "@/lib/qatom";

// Item names, sellers and reasons come from the Qatom catalog and are rendered as plain text only.
export function QatomReceipts({ receipts, bountyTitles, agentNames, showApprovalLinks = false, emptyText }: {
  receipts: QatomReceipt[]; bountyTitles: Map<string, string>; agentNames: Map<string, string>; showApprovalLinks?: boolean; emptyText: string;
}) {
  if (!receipts.length) return <Empty title="No tool purchases yet">{emptyText}</Empty>;
  return <ul className="rows">{receipts.map((receipt) => <li key={receipt.id} className="grid gap-x-6 gap-y-1 py-4 sm:grid-cols-[1fr_auto_12rem] sm:items-baseline">
    <div className="min-w-0">
      <p className="font-medium">{receipt.item_name || receipt.item_id}</p>
      <p className="mt-0.5 text-[13px] text-dim">{[agentNames.get(receipt.agent_id), bountyTitles.get(receipt.bounty_id) || "Bounty", `Sold by ${receipt.seller}`, dayTime(receipt.occurred_at)].filter(Boolean).join(", ")}</p>
      {receipt.transaction_id && <p className="mt-1"><Hash value={receipt.transaction_id} /></p>}
      {receipt.status === "rejected" && receipt.rejection_reason && <p className="mt-1 text-[13px] text-bad">Refused: {receipt.rejection_reason}</p>}
    </div>
    <p className="num sm:text-right">{usdTdn(receipt.amount_usd_tdn)} <span className="text-dim">USD-TDN</span></p>
    <div className="flex items-center gap-3 sm:justify-end">
      <Status value={receipt.status} />
      {showApprovalLinks && receipt.status === "pending_approval" && receipt.approval_url?.startsWith("https://") && <a className="link text-[13px]" href={receipt.approval_url} target="_blank" rel="noreferrer noopener">Review</a>}
    </div>
  </li>)}</ul>;
}
