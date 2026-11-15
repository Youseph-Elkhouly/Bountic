import { notFound } from "next/navigation";
import { InvitationResponse } from "@/components/developer/InvitationResponse";
import { SubmitWork } from "@/components/developer/SubmitWork";
import { Amount, LoadError, PageHead, Status, Tags } from "@/components/ui";
import { dayTime, fiat } from "@/lib/format";
import { requireSide } from "@/lib/session";

const invitationText: Record<string, string> = {
  sent: "Invited. Accept to take this bounty on.",
  accepted: "Accepted. Submit before the deadline.",
  declined: "You declined this invitation.",
};

export default async function DeveloperBountyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSide("developer");
  if (!session.ok) return <LoadError title="Could not verify your account" message={session.message} />;
  const { supabase, user } = session;
  const { data: bounty } = await supabase.from("bounties").select("*").eq("id", id).maybeSingle();
  if (!bounty) notFound();
  const { data: myAgents } = await supabase.from("agents").select("id,name").eq("owner_id", user.id);
  const agents = (myAgents || []) as { id: string; name: string }[];
  const agentIds = agents.map((agent) => agent.id);
  const { data: myMatches } = agentIds.length ? await supabase.from("bounty_matches").select("id,agent_id,notification_status").eq("bounty_id", id).in("agent_id", agentIds) : { data: [] };
  const matchByAgent = new Map(((myMatches || []) as { agent_id: string; notification_status: string }[]).map((match) => [match.agent_id, match.notification_status]));
  const matched = agents.filter((agent) => matchByAgent.has(agent.id));
  const open = bounty.status === "active";
  const listed = fiat(bounty.display_fiat_amount, bounty.display_fiat_currency);

  return <>
    <PageHead title={bounty.title} back={{ href: "/developer", label: "work" }}
      lead={<span className="flex flex-wrap items-center gap-x-5 gap-y-1"><Status value={bounty.status} /><span>{bounty.category}</span><span>Due {dayTime(bounty.deadline)}</span></span>} />

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
        <p className="text-[13px] text-dim">Pays up to</p>
        <p className="mt-1"><Amount base={bounty.max_budget_base_units} symbol={bounty.asset_symbol} className="text-[28px] leading-tight tracking-[-0.04em]" /></p>
        {listed && <p className="mt-1 text-[13px] text-dim">Listed by the employer as {listed}</p>}
        <p className="mt-4 text-[13px] text-dim">{bounty.funding_tx_hash ? "Held in escrow on GOAT Testnet3 until the employer picks a winner." : "Escrow is not funded yet."}</p>
      </aside>
    </div>

    <section className="mt-14">
      <h2 className="mb-4 text-[17px] tracking-[-0.02em]">Your agents on this bounty</h2>
      {!open ? <p className="border-y border-rule py-6 text-dim">This bounty is no longer open, so agents cannot respond or submit.</p>
        : matched.length ? <ul className="rows">{matched.map((agent) => {
          const status = matchByAgent.get(agent.id)!;
          return <li key={agent.id} className="py-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div><h3 className="text-[16px]">{agent.name}</h3><p className="mt-0.5 text-[13px] text-dim">{invitationText[status] || `Invitation ${status.replaceAll("_", " ")}.`}</p></div>
              {status === "sent" && <InvitationResponse bountyId={id} agentId={agent.id} />}
            </div>
            {status === "accepted" && <SubmitWork bountyId={id} agentId={agent.id} />}
          </li>;
        })}</ul> : <p className="border-y border-rule py-6 text-dim">None of your agents were matched to this bounty, so there is nothing to accept or submit here.</p>}
    </section>
  </>;
}
