import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SignOut } from "@/components/SignOut";
import { FundingAction } from "@/components/FundingAction";
import { AgentResponse } from "@/components/AgentResponse";
import { AgentSubmissionForm } from "@/components/AgentSubmissionForm";
import { RefundAction } from "@/components/RefundAction";
import { OnchainEscrowStatus } from "@/components/OnchainEscrowStatus";
export default async function BountyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser(); if (!user) redirect("/login");
  const { data: bounty } = await supabase.from("bounties").select("*").eq("id", id).maybeSingle(); if (!bounty) notFound();
  const owner = bounty.requester_id === user.id;
  const { data: myAgents } = !owner ? await supabase.from("agents").select("id,name").eq("owner_id", user.id) : { data: [] };
  const agentIds = (myAgents || []).map((agent: { id: string }) => agent.id);
  const { data: myMatches } = !owner && agentIds.length ? await supabase.from("bounty_matches").select("id,agent_id,notification_status").eq("bounty_id", id).in("agent_id", agentIds) : { data: [] };
  const matchByAgent = new Map((myMatches || []).map((match: { agent_id: string; notification_status: string }) => [match.agent_id, match.notification_status]));
  const { data: payments } = owner ? await supabase.from("payments").select("kind,status,amount_base_units,tx_hash,explorer_url,created_at").eq("bounty_id", id).order("created_at", { ascending: false }) : { data: [] };
  return <section className="mx-auto max-w-4xl px-5 py-12"><div className="flex items-center justify-between"><Link href="/dashboard" className="text-sm text-neutral-500 hover:text-neutral-950">← Dashboard</Link><SignOut /></div><div className="mt-10 flex flex-wrap items-start justify-between gap-5"><div><p className="eyebrow">{bounty.category}</p><h1 className="mt-3 text-4xl font-semibold tracking-tight">{bounty.title}</h1><p className="mt-3 text-sm text-neutral-500">Due {new Date(bounty.deadline).toLocaleString()}</p></div><span className="rounded-full border border-neutral-300 px-3 py-1.5 text-xs uppercase">{bounty.status}</span></div>
    <article className="panel mt-8 p-6"><h2 className="eyebrow">THE WORK</h2><p className="mt-4 whitespace-pre-wrap text-sm leading-7 text-neutral-600">{bounty.description}</p><h3 className="mt-7 text-sm font-medium">Deliverable requirements</h3><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-neutral-600">{bounty.deliverable_requirements}</p><div className="mt-7 flex flex-wrap gap-2">{bounty.required_skills.map((skill: string) => <span key={skill} className="rounded-full border border-neutral-200 px-3 py-1.5 text-xs text-neutral-600">{skill}</span>)}</div></article>
    <div className="mt-5 grid gap-4 sm:grid-cols-2"><div className="panel p-5"><p className="eyebrow">ESCROW MAXIMUM</p><p className="mt-3 text-2xl">{bounty.max_budget_base_units.toString()} <span className="text-sm text-neutral-500">native base units</span></p>{bounty.display_fiat_amount && <p className="mt-1 text-xs text-neutral-500">Separate estimate: {bounty.display_fiat_amount} {bounty.display_fiat_currency}</p>}</div><div className="panel p-5"><p className="eyebrow">FUNDING AND PAYMENTS</p><p className="mt-3 text-sm text-neutral-600">{bounty.funding_tx_hash ? "Funding confirmed" : bounty.status === "draft" ? "Draft · not funded" : "Awaiting confirmation"}</p>{bounty.funding_tx_hash && <a className="mt-2 block text-xs underline" href={`https://explorer.testnet3.goat.network/tx/${bounty.funding_tx_hash}`} target="_blank" rel="noreferrer">View funding transaction</a>}<OnchainEscrowStatus bountyId={bounty.id} /></div></div>
    {!owner && bounty.status === "active" && (myAgents || []).map((agent: { id: string; name: string }) => {
      const status = matchByAgent.get(agent.id);
      return <div key={agent.id} className="panel mt-5 p-5"><h2 className="font-medium">{agent.name}</h2><p className="mt-2 text-xs text-neutral-500">Invitation: {status || "not matched"}</p>{status === "sent" && <AgentResponse bountyId={id} agentId={agent.id} />}{status === "accepted" && <AgentSubmissionForm bountyId={id} agentId={agent.id} />}</div>;
    })}
    {owner && <div className="mt-6 flex flex-wrap items-center gap-3">{["draft", "funding"].includes(bounty.status) && <FundingAction bountyId={bounty.id} />}{bounty.status === "active" && new Date(bounty.deadline) < new Date() && <RefundAction bountyId={bounty.id} />}<Link href={`/bounties/${bounty.id}/submissions`} className="button-secondary">Review submissions</Link></div>}
    {owner && <div className="mt-8"><h2 className="mb-3 text-lg font-medium">Payment history</h2><div className="space-y-2">{(payments || []).map((p) => <div key={p.tx_hash || p.created_at} className="panel flex flex-wrap justify-between gap-3 p-4 text-sm"><span className="capitalize">{p.kind} · {p.status}</span><span>{p.amount_base_units.toString()} base units</span>{p.explorer_url && <a className="underline" href={p.explorer_url} target="_blank" rel="noreferrer">Transaction receipt</a>}</div>)}</div></div>}
  </section>;
}
