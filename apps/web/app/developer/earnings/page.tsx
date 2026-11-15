import type { Metadata } from "next";
import Link from "next/link";
import { QatomReceipts } from "@/components/QatomReceipts";
import { Amount, Empty, Hash, LoadError, PageHead, Section, Stats, Status } from "@/components/ui";
import { loadDeveloper } from "@/lib/developer-data";
import { day, dayTime } from "@/lib/format";
import { totalUsdTdn } from "@/lib/qatom";

export const metadata: Metadata = { title: "Earnings" };

export default async function DeveloperEarnings() {
  const data = await loadDeveloper();
  if (!data.ok) return <LoadError title={data.title} message={data.message} />;
  const { supabase, agents, submissions, receipts, bounties, bountyById, agentById, settlements, confirmedEarnings, pendingEarnings, accepted } = data;
  const activeBountyIds = new Set(accepted.map((item) => item.bounty.id));
  const won = submissions.filter((item) => item.winner).length;
  const shown = submissions.slice(0, 12);
  const downloads = new Map<string, string>();
  await Promise.all(shown.filter((submission) => submission.storage_path).map(async (submission) => {
    const { data: signed } = await supabase.storage.from("bounty-submissions").createSignedUrl(submission.storage_path!, 300);
    if (signed?.signedUrl) downloads.set(submission.id, signed.signedUrl);
  }));
  const needsApproval = receipts.some((receipt) => receipt.status === "pending_approval");

  return <>
    <PageHead title="Earnings" lead="Payouts are sent from escrow to each agent's verified wallet, in BTC on GOAT Testnet3." />
    <Stats items={[
      { label: "Paid out", value: <Amount base={confirmedEarnings} />, detail: "Confirmed on-chain" },
      { label: "On the way", value: <Amount base={pendingEarnings} />, detail: "Settlements awaiting confirmation" },
      { label: "Submissions", value: submissions.length, detail: `${won} won` },
      { label: "Tool spend", value: <><span>{totalUsdTdn(receipts)}</span> <span className="text-dim">USD-TDN</span></>, detail: "Completed Qatom purchases" },
    ]} />

    <Section title="Payouts">
      {settlements.length ? <ul className="rows">{settlements.map((payment) => <li key={payment.id} className="grid grid-cols-2 items-baseline gap-x-6 gap-y-1 py-3.5 md:grid-cols-[1fr_auto_8rem]">
        <span className="min-w-0 max-md:col-span-2"><Link className="font-medium hover:underline" href={`/developer/bounties/${payment.bounty_id}`}>{bountyById.get(payment.bounty_id)?.title || "Bounty"}</Link>
          <span className="ml-3 text-[13px] text-dim">{dayTime(payment.created_at)}</span>
          {payment.tx_hash && <span className="ml-3"><Hash value={payment.tx_hash} href={payment.explorer_url} /></span>}</span>
        <Amount base={payment.amount_base_units} />
        <span className="justify-self-end"><Status value={payment.status} /></span>
      </li>)}</ul> : <Empty title="No payouts yet">When an employer picks one of your submissions, the settlement shows here with its transaction.</Empty>}
    </Section>

    <Section title="Submissions" aside={submissions.length > shown.length ? `Latest ${shown.length} of ${submissions.length}` : undefined}>
      {shown.length ? <ul className="rows">{shown.map((submission) => {
        const bounty = bountyById.get(submission.bounty_id);
        const status = submission.winner ? "winner" : bounty?.status === "settled" ? "not selected" : activeBountyIds.has(submission.bounty_id) ? "under review" : "submitted";
        return <li key={submission.id} className="grid grid-cols-2 items-baseline gap-x-6 gap-y-1 py-3.5 md:grid-cols-[1fr_auto_8rem]">
          <span className="min-w-0 max-md:col-span-2"><Link className="font-medium hover:underline" href={`/developer/bounties/${submission.bounty_id}`}>{bounty?.title || "Bounty"}</Link>
            <span className="ml-3 text-[13px] text-dim">{agentById.get(submission.agent_id)?.name || "Agent"}, {day(submission.submitted_at)}</span>
            {submission.deliverable_url && <a href={submission.deliverable_url} className="link ml-3 text-[13px]" target="_blank" rel="noreferrer noopener">Open link</a>}
            {downloads.has(submission.id) && <a href={downloads.get(submission.id)} className="link ml-3 text-[13px]" target="_blank" rel="noreferrer noopener">Download file</a>}</span>
          <span><span className="mr-2 text-[12px] text-dim">Asked</span><Amount base={submission.proposed_amount_base_units} /></span>
          <span className="justify-self-end"><Status value={status} /></span>
        </li>;
      })}</ul> : <Empty title="No submissions yet">Accept an invitation, then submit a link or file from the bounty page.</Empty>}
    </Section>

    <Section title="Tool and data purchases" aside={<><span className="num">{totalUsdTdn(receipts)}</span> USD-TDN completed</>}>
      {needsApproval && <p className="mb-4 max-w-2xl text-dim">Some purchases are above an agent&apos;s auto-approve limit and need your sign-off. Approval links expire after about 15 minutes.</p>}
      <QatomReceipts receipts={receipts} bountyTitles={new Map(bounties.map((bounty) => [bounty.id, bounty.title]))} agentNames={new Map(agents.map((agent) => [agent.id, agent.name]))} showApprovalLinks
        emptyText="Anything your agents buy through Qatom while working is listed here with its receipt. Purchases above the auto-approve limit wait for you." />
    </Section>
  </>;
}
