import Link from "next/link";
import { notFound } from "next/navigation";
import { CancelDraft } from "@/components/employer/CancelDraft";
import { FundEscrow } from "@/components/employer/FundEscrow";
import { RefundEscrow } from "@/components/employer/RefundEscrow";
import { Amount, Hash, LoadError, Notice, PageHead, Section, Status, Tags } from "@/components/ui";
import { dayTime, fiat, txUrl } from "@/lib/format";
import { requireSide } from "@/lib/session";

export default async function EmployerBountyPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const { id } = await params; const { created } = await searchParams;
  const session = await requireSide("employer");
  if (!session.ok) return <LoadError title="Could not verify your account" message={session.message} />;
  const { supabase, user } = session;
  const { data: bounty } = await supabase.from("bounties").select("*").eq("id", id).maybeSingle();
  if (!bounty || bounty.requester_id !== user.id) notFound();
  const [{ data: payments }, { count: submissionCount }] = await Promise.all([
    supabase.from("payments").select("kind,status,amount_base_units,tx_hash,explorer_url,created_at").eq("bounty_id", id).order("created_at", { ascending: false }),
    supabase.from("submissions").select("id", { count: "exact", head: true }).eq("bounty_id", id),
  ]);

  const unfunded = ["draft", "funding"].includes(bounty.status);
  const expired = bounty.status === "active" && new Date(bounty.deadline) < new Date();
  const listed = fiat(bounty.display_fiat_amount, bounty.display_fiat_currency);

  return <>
    <PageHead title={bounty.title} back={{ href: "/employer", label: "bounties" }}
      lead={<span className="flex flex-wrap items-center gap-x-5 gap-y-1"><Status value={bounty.status} /><span>{bounty.category}</span><span>Due {dayTime(bounty.deadline)}</span></span>} />

    {created && unfunded && <div className="mb-8"><Notice tone="ok" title="Draft saved">Fund the escrow to make this bounty live. Your wallet will ask you to confirm two transactions.</Notice></div>}

    <div className="grid gap-x-16 gap-y-12 border-t border-rule pt-10 lg:grid-cols-[1fr_20rem]">
      <article className="min-w-0">
        <h2 className="text-[13px] font-normal text-dim">Description</h2>
        <p className="mt-2 max-w-[68ch] whitespace-pre-wrap text-[15px] leading-relaxed">{bounty.description}</p>
        {bounty.deliverable_requirements && <>
          <h2 className="mt-9 text-[13px] font-normal text-dim">Deliverable requirements</h2>
          <p className="mt-2 max-w-[68ch] whitespace-pre-wrap text-[15px] leading-relaxed">{bounty.deliverable_requirements}</p>
        </>}
        <h2 className="mb-2.5 mt-9 text-[13px] font-normal text-dim">Required skills</h2>
        <Tags items={bounty.required_skills} empty="None listed" />
      </article>

      <aside className="lg:border-l lg:border-rule lg:pl-10">
        <p className="text-[13px] text-dim">{unfunded ? "Escrow to fund" : "Escrow"}</p>
        <p className="mt-1"><Amount base={bounty.max_budget_base_units} symbol={bounty.asset_symbol} className="text-[28px] leading-tight tracking-[-0.04em]" /></p>
        {listed && <p className="mt-1 text-[13px] text-dim">Listed to developers as {listed}</p>}
        <p className="mt-4 text-[13px]">{bounty.funding_tx_hash ? <>Funded in <Hash value={bounty.funding_tx_hash} href={txUrl(bounty.funding_tx_hash)} /></> : bounty.status === "draft" ? "Not funded. Only you can see this bounty." : unfunded ? "Waiting for the funding transaction to confirm." : null}</p>

        <div className="mt-6 flex flex-col items-start gap-3">
          {unfunded && <FundEscrow bountyId={bounty.id} primary />}
          {!unfunded && <Link href={`/employer/bounties/${bounty.id}/submissions`} className="btn btn-primary">{submissionCount ? `Review ${submissionCount} submission${submissionCount === 1 ? "" : "s"}` : "View submissions"}</Link>}
          {expired && <RefundEscrow bountyId={bounty.id} />}
          {bounty.status === "draft" && <CancelDraft bountyId={bounty.id} />}
        </div>
        {expired && <p className="mt-3 text-[13px] leading-snug text-dim">The deadline has passed. You can still pay a submission, or take the escrow back.</p>}
      </aside>
    </div>

    <Section title="Payment history">
      {payments?.length ? <ul className="rows">{payments.map((payment) => <li key={payment.tx_hash || payment.created_at} className="grid grid-cols-2 items-baseline gap-x-6 gap-y-1 py-3.5 sm:grid-cols-[8rem_1fr_auto_8rem]">
        <span className="font-medium first-letter:uppercase">{payment.kind}</span>
        <span className="text-[13px] text-dim max-sm:text-right">{dayTime(payment.created_at)}{payment.tx_hash && <span className="ml-3"><Hash value={payment.tx_hash} href={payment.explorer_url} /></span>}</span>
        <Amount base={payment.amount_base_units} symbol={bounty.asset_symbol} />
        <span className="max-sm:text-right sm:justify-self-end"><Status value={payment.status} /></span>
      </li>)}</ul> : <p className="border-y border-rule py-6 text-dim">No transactions yet. Funding, payouts and refunds for this bounty are listed here once they are sent.</p>}
    </Section>
  </>;
}
