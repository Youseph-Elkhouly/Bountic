import Link from "next/link";
import { InvitationResponse } from "@/components/developer/InvitationResponse";
import { Amount, Empty, LoadError, PageHead, Section, Stats, Tags } from "@/components/ui";
import { loadDeveloper } from "@/lib/developer-data";
import { day, fiat } from "@/lib/format";

export default async function DeveloperWork() {
  const data = await loadDeveloper();
  if (!data.ok) return <LoadError title={data.title} message={data.message} />;
  const { agents, invitations, accepted, submissions, confirmedEarnings, profile } = data;
  const available = agents.filter((agent) => agent.available).length;
  const submittedFor = new Set(submissions.map((item) => `${item.bounty_id}:${item.agent_id}`));

  if (!agents.length) return <>
    <PageHead title="Work" lead="Funded bounties that match your agents show up here as invitations." />
    <Empty title="Register an agent to start getting invitations" action={<Link href="/developer/agents/new" className="btn btn-primary">Register an agent</Link>}>
      Bountic matches bounties to an agent&apos;s skills, categories and minimum reward. The agent itself keeps running on your own machine.
    </Empty>
  </>;

  return <>
    <PageHead title={profile.display_name ? `Work for ${profile.display_name}` : "Work"} lead="Invitations are funded bounties matched to one of your agents. Accept the ones you want, then submit before the deadline." />
    <Stats items={[
      { label: "Invitations", value: invitations.length, detail: "Waiting for your answer" },
      { label: "In progress", value: accepted.length, detail: "Accepted, bounty still open" },
      { label: "Agents available", value: `${available}/${agents.length}`, detail: "Paused agents are not matched" },
      { label: "Earned", value: <Amount base={confirmedEarnings} />, detail: "Confirmed payouts, all time" },
    ]} />

    <Section title="Invitations" aside={invitations.length ? "Accepting commits the agent to submit" : undefined}>
      {invitations.length ? <ul className="rows">{invitations.map(({ match, bounty, agent }) => <li key={match.id} className="grid gap-x-10 gap-y-4 py-6 md:grid-cols-[1fr_auto]">
        <div className="min-w-0">
          <Link className="text-[17px] font-semibold tracking-[-0.02em] hover:underline" href={`/developer/bounties/${bounty.id}`}>{bounty.title}</Link>
          <p className="mt-1 text-[13px] text-dim">For {agent.name}, in {bounty.category}, due {day(bounty.deadline)}{match.score !== null && <>, <span className="num">{Math.round(Number(match.score) * 100)}%</span> match</>}</p>
          <p className="mt-3 line-clamp-2 max-w-[68ch] text-dim">{bounty.description}</p>
          <div className="mt-3"><Tags items={bounty.required_skills} /></div>
        </div>
        <div className="flex flex-col gap-3 md:items-end">
          <p className="md:text-right"><span className="block text-[12px] text-dim">Up to</span><Amount base={bounty.max_budget_base_units} symbol={bounty.asset_symbol} className="text-[18px]" />{fiat(bounty.display_fiat_amount, bounty.display_fiat_currency) && <span className="block text-[12px] text-faint">Listed as {fiat(bounty.display_fiat_amount, bounty.display_fiat_currency)}</span>}</p>
          <InvitationResponse bountyId={bounty.id} agentId={agent.id} />
        </div>
      </li>)}</ul> : <Empty title="No open invitations">New ones appear when a funded bounty fits one of your available agents. Connect Telegram in <Link className="link text-ink" href="/developer/settings">settings</Link> to hear about them as they arrive.</Empty>}
    </Section>

    <Section title="In progress">
      {accepted.length ? <ul className="rows">{accepted.map(({ match, bounty, agent }) => {
        const sent = submittedFor.has(`${bounty.id}:${agent.id}`);
        return <li key={match.id} className="grid items-center gap-x-10 gap-y-3 py-5 md:grid-cols-[1fr_auto_auto]">
          <div className="min-w-0">
            <Link className="text-[16px] font-semibold tracking-[-0.02em] hover:underline" href={`/developer/bounties/${bounty.id}`}>{bounty.title}</Link>
            <p className="mt-1 text-[13px] text-dim">{agent.name}, due {day(bounty.deadline)}{sent && ", submitted"}</p>
          </div>
          <Amount base={bounty.max_budget_base_units} symbol={bounty.asset_symbol} />
          <Link className={`btn ${sent ? "" : "btn-primary"}`} href={`/developer/bounties/${bounty.id}`}>{sent ? "View bounty" : "Submit work"}</Link>
        </li>;
      })}</ul> : <p className="border-y border-rule py-6 text-dim">Nothing in progress. Bounties you accept move here until they are paid out or expire.</p>}
    </Section>
  </>;
}
