"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CancelDraft } from "@/components/employer/CancelDraft";
import { FundEscrow } from "@/components/employer/FundEscrow";
import { Amount, Empty, Hash, Status } from "@/components/ui";
import { day, fiat, txUrl } from "@/lib/format";

type Bounty = { id: string; title: string; status: string; max_budget_base_units: string | number; asset_symbol: string; display_fiat_amount: string | number | null; display_fiat_currency: string | null; deadline: string; created_at: string; funding_tx_hash: string | null };
const filters = [
  ["all", "All"], ["draft", "Draft"], ["funding", "Awaiting funding"], ["active", "Live"], ["review", "In review"], ["settled", "Paid out"], ["cancelled", "Cancelled"], ["refunded", "Refunded"], ["expired", "Expired"],
] as const;
const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

export function BountyList({ bounties, submissionCounts, matchCounts }: { bounties: Bounty[]; submissionCounts: Record<string, number>; matchCounts: Record<string, number> }) {
  const [filter, setFilter] = useState<string>("all");
  const visible = useMemo(() => filter === "all" ? bounties : bounties.filter((bounty) => bounty.status === filter), [bounties, filter]);
  const counts = useMemo(() => { const tally: Record<string, number> = {}; for (const bounty of bounties) tally[bounty.status] = (tally[bounty.status] || 0) + 1; return tally; }, [bounties]);
  // Only offer filters that would show something, so the row stays short.
  const offered = filters.filter(([value]) => value === "all" || counts[value] || value === filter);

  if (!bounties.length) return <Empty title="Post your first bounty" action={<Link href="/employer/bounties/new" className="btn btn-primary">Post a bounty</Link>}>Describe the work and set a maximum budget. Nothing is charged until you fund the escrow from your wallet.</Empty>;

  return <div>
    {offered.length > 2 && <div className="mb-1 flex flex-wrap gap-1.5" role="group" aria-label="Filter bounties by status">{offered.map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)}
      className={`h-7 rounded-full border px-3 text-[12px] transition-colors ${filter === value ? "border-ink bg-ink text-paper" : "border-rule text-dim hover:border-rule-strong hover:text-ink"}`}>{label}{value !== "all" && <span className="num ml-1.5 opacity-70">{counts[value] || 0}</span>}</button>)}</div>}

    <ul className="rows mt-4">{visible.map((bounty) => {
      const unfunded = ["draft", "funding"].includes(bounty.status);
      const submissions = submissionCounts[bounty.id] || 0;
      return <li key={bounty.id} className="grid gap-x-8 gap-y-3 py-5 md:grid-cols-[1fr_auto]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <Link href={`/employer/bounties/${bounty.id}`} className="text-[16px] font-semibold tracking-[-0.02em] hover:underline">{bounty.title}</Link>
            <Status value={bounty.status} />
          </div>
          <p className="mt-1.5 text-[13px] text-dim">{plural(matchCounts[bounty.id] || 0, "agent")} matched, {plural(submissions, "submission")}, due {day(bounty.deadline)}</p>
          {bounty.funding_tx_hash && <p className="mt-1.5 text-[13px] text-dim">Funded in <Hash value={bounty.funding_tx_hash} href={txUrl(bounty.funding_tx_hash)} /></p>}
        </div>
        <div className="flex flex-col gap-3 md:items-end">
          <p className="md:text-right"><Amount base={bounty.max_budget_base_units} symbol={bounty.asset_symbol} className="text-[16px]" />{fiat(bounty.display_fiat_amount, bounty.display_fiat_currency) && <span className="block text-[12px] text-faint">Listed as {fiat(bounty.display_fiat_amount, bounty.display_fiat_currency)}</span>}</p>
          <div className="flex flex-wrap items-start gap-2">
            {unfunded && <FundEscrow bountyId={bounty.id} />}
            {!unfunded && <Link className="btn" href={`/employer/bounties/${bounty.id}/submissions`}>{submissions ? "Review submissions" : "Submissions"}</Link>}
            {bounty.status === "draft" && <CancelDraft bountyId={bounty.id} />}
          </div>
        </div>
      </li>;
    })}</ul>
    {!visible.length && <p className="border-b border-rule py-8 text-dim">No bounties with this status.</p>}
  </div>;
}
