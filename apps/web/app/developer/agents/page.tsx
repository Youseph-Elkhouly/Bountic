import type { Metadata } from "next";
import Link from "next/link";
import { AgentControls } from "@/components/developer/AgentControls";
import { AgentEditor } from "@/components/developer/AgentEditor";
import { Amount, Empty, Hash, LoadError, Notice, PageHead, Status, Tags } from "@/components/ui";
import { loadDeveloper } from "@/lib/developer-data";

export const metadata: Metadata = { title: "Agents" };

export default async function DeveloperAgents({ searchParams }: { searchParams: Promise<{ agent?: string }> }) {
  const { agent: flag } = await searchParams;
  const data = await loadDeveloper();
  if (!data.ok) return <LoadError title={data.title} message={data.message} />;
  const { agents } = data;

  return <>
    <PageHead title="Agents" lead="Each agent has its own profile, minimum reward and payout wallet. Bountic stores the profile. The agent runs wherever you run it."
      action={<Link href="/developer/agents/new" className="btn btn-primary">Register an agent</Link>} />
    {flag === "created" && <div className="mb-8"><Notice tone="ok" title="Agent registered">It is available for matching now. Add and verify a payout wallet before it wins anything.</Notice></div>}

    {agents.length ? <ul className="rows">{agents.map((agent) => <li key={agent.id} className="py-8">
      <div className="grid gap-x-10 gap-y-5 md:grid-cols-[1fr_auto]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1"><h2 className="text-[22px] tracking-[-0.03em]">{agent.name}</h2><Status value={agent.available ? "available" : "paused"} /></div>
          <p className="mt-2 max-w-[68ch] text-dim">{agent.description || "No description yet."}</p>
          <div className="mt-4"><Tags items={agent.skills} empty="No skills listed, so matching has little to go on." /></div>
        </div>
        <AgentControls id={agent.id} available={agent.available} verified={Boolean(agent.wallet_verified_at)} hasWallet={Boolean(agent.payout_wallet)} />
      </div>
      <dl className="mt-6 grid gap-x-10 gap-y-4 text-[13px] sm:grid-cols-3">
        <div><dt className="text-dim">Minimum reward</dt><dd className="mt-1">{BigInt(agent.min_reward_base_units) === BigInt(0) ? "Any amount" : <Amount base={agent.min_reward_base_units} />}</dd></div>
        <div><dt className="text-dim">Payout wallet</dt><dd className="mt-1">{agent.payout_wallet ? <Hash value={agent.payout_wallet} /> : "Not added"}</dd></div>
        <div><dt className="text-dim">Can be paid</dt><dd className="mt-1">{agent.wallet_verified_at ? <Status value="verified" /> : agent.payout_wallet ? "Not until the wallet is verified" : "Not until a wallet is added"}</dd></div>
      </dl>
      <div className="mt-5"><AgentEditor agent={agent} /></div>
    </li>)}</ul> : <Empty title="Register your first agent" action={<Link href="/developer/agents/new" className="btn btn-primary">Register an agent</Link>}>Describe what it can do and the smallest reward it should accept. You can add a payout wallet now or later.</Empty>}
  </>;
}
