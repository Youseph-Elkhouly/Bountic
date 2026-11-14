"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { FundingAction } from "@/components/FundingAction";
import { StatusPill } from "@/components/DashboardShell";
import { CancelBountyAction } from "@/components/CancelBountyAction";

type Bounty = { id: string; title: string; status: string; max_budget_base_units: string | number; asset_symbol: string; display_fiat_amount: string | number | null; display_fiat_currency: string | null; deadline: string; created_at: string; funding_tx_hash: string | null };
const filters = [
  ["all", "All"], ["draft", "Draft"], ["funding", "Awaiting funding"], ["active", "Active"], ["review", "In review"], ["settled", "Completed"], ["cancelled", "Cancelled"], ["refunded", "Refunded"], ["expired", "Expired"],
] as const;

export function RequesterBounties({ bounties, submissionCounts, matchCounts }: { bounties: Bounty[]; submissionCounts: Record<string, number>; matchCounts: Record<string, number> }) {
  const [filter, setFilter] = useState<string>("all");
  const visible = useMemo(() => filter === "all" ? bounties : bounties.filter((bounty) => bounty.status === filter), [bounties, filter]);
  return <div>
    <div className="filter-row" role="tablist" aria-label="Filter bounties by status">{filters.map(([value, label]) => <button key={value} role="tab" aria-selected={filter === value} className={filter === value ? "filter-button filter-active" : "filter-button"} onClick={() => setFilter(value)}>{label}</button>)}</div>
    {visible.length ? <div className="space-y-3">{visible.map((bounty) => <article className="list-card" key={bounty.id}>
      <div className="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Link href={`/bounties/${bounty.id}`} className="font-semibold text-neutral-950 hover:underline">{bounty.title}</Link><StatusPill value={bounty.status} /></div>
          <p className="mt-2 text-sm text-neutral-600">{matchCounts[bounty.id] || 0} matched agents <span className="mx-1.5 text-neutral-600">·</span>{submissionCounts[bounty.id] || 0} submissions <span className="mx-1.5 text-neutral-600">·</span> due {new Date(bounty.deadline).toLocaleDateString()}</p>
          {bounty.funding_tx_hash && <a className="mt-2 inline-block text-xs text-neutral-600 underline" href={`https://explorer.testnet3.goat.network/tx/${bounty.funding_tx_hash}`} target="_blank" rel="noreferrer">Funding transaction</a>}
        </div>
        <div className="text-right">{bounty.display_fiat_amount && <p className="font-semibold tabular-nums">${bounty.display_fiat_amount} {bounty.display_fiat_currency}</p>}<p className="text-xs text-neutral-500">{BigInt(bounty.max_budget_base_units).toLocaleString()} {bounty.asset_symbol} base units</p></div>
      </div>
      <div className="flex flex-wrap items-center gap-2">{["draft", "funding"].includes(bounty.status) && <FundingAction bountyId={bounty.id} />}<Link className="button-secondary" href={`/bounties/${bounty.id}/submissions`}>Review work</Link>{bounty.status === "draft" && <CancelBountyAction bountyId={bounty.id} />}</div>
    </article>)}</div> : <div className="empty-state"><h3>{filter === "all" ? "No bounties yet" : `No ${filters.find(([value]) => value === filter)?.[1].toLowerCase()} bounties`}</h3><p>{filter === "all" ? "Post your first opportunity and fund it when you’re ready." : "Bounties will appear here when their status changes."}</p>{filter === "all" && <Link href="/bounties/new" className="button-primary mt-4">Create a bounty</Link>}</div>}
  </div>;
}
