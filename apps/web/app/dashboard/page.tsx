import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SignOut } from "@/components/SignOut";
import { WalletConnect } from "@/components/WalletConnect";
import { TelegramLink } from "@/components/TelegramLink";

function formatAmount(value: string | number) { return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ","); }
function Status({ value }: { value: string }) { const colors: Record<string, string> = { active: "text-emerald-300 border-emerald-900", settled: "text-sky-300 border-sky-900", draft: "text-neutral-300 border-neutral-700", funding: "text-amber-300 border-amber-900", review: "text-violet-300 border-violet-900", refunded: "text-neutral-400 border-neutral-700", expired: "text-neutral-500 border-neutral-800" }; return <span className={`rounded-full border px-2.5 py-1 text-[10px] uppercase tracking-wide ${colors[value] || "text-neutral-400 border-neutral-700"}`}>{value}</span>; }

export default async function DashboardPage() {
  const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role,display_name").eq("id", user.id).maybeSingle();
  if (!profile?.role) redirect("/onboarding");
  const requester = profile.role === "requester";
  const [bountyResult, agentResult] = await Promise.all([
    supabase.from("bounties").select("id,title,status,max_budget_base_units,asset_symbol,deadline,created_at").eq("requester_id", user.id).order("created_at", { ascending: false }).limit(25),
    supabase.from("agents").select("id,name,skills,available,payout_wallet,wallet_verified_at").eq("owner_id", user.id).order("created_at", { ascending: false }),
  ]);
  const bounties = bountyResult.data || []; const agents = agentResult.data || [];
  const bountyIds = bounties.map((bounty) => bounty.id);
  const { data: matches } = bountyIds.length ? await supabase.from("bounty_matches").select("bounty_id,notification_status").in("bounty_id", bountyIds) : { data: [] };
  const matchCounts = new Map<string, number>();
  for (const match of matches || []) matchCounts.set(match.bounty_id, (matchCounts.get(match.bounty_id) || 0) + 1);
  return <section className="mx-auto max-w-6xl px-5 py-12">
    <div className="flex flex-wrap items-end justify-between gap-5"><div><p className="eyebrow">{requester ? "REQUESTER WORKSPACE" : "EARNER WORKSPACE"}</p><h1 className="mt-2 text-4xl font-semibold tracking-tight">{profile.display_name ? `Welcome, ${profile.display_name}` : "Your workspace"}</h1><p className="mt-2 text-sm text-neutral-500">{requester ? "Manage funded opportunities and review completed work." : "Manage your agent profile and find work that fits."}</p></div><div className="flex flex-wrap items-center gap-3"><WalletConnect /><SignOut /></div></div>
    {requester ? <div className="mt-10 grid gap-5 lg:grid-cols-[1fr_300px]"><div className="space-y-4"><div className="flex items-center justify-between"><h2 className="text-lg font-medium">Your bounties</h2><Link href="/bounties/new" className="button-primary">New bounty</Link></div>
      {bounties.length ? bounties.map((bounty) => <article key={bounty.id} className="panel flex flex-wrap items-center justify-between gap-4 p-5"><div className="min-w-[220px] flex-1"><div className="flex items-center gap-3"><Link href={`/bounties/${bounty.id}`} className="font-medium hover:underline">{bounty.title}</Link><Status value={bounty.status} /></div><p className="mt-2 text-xs text-neutral-500">{formatAmount(bounty.max_budget_base_units)} native base units · {matchCounts.get(bounty.id) || 0} agents matched · due {new Date(bounty.deadline).toLocaleDateString()}</p></div><div className="flex gap-2">{["draft", "funding"].includes(bounty.status) && <FundingAction bountyId={bounty.id} />}<Link className="button-secondary" href={`/bounties/${bounty.id}/submissions`}>Review work</Link></div></article>) : <div className="panel p-8 text-sm text-neutral-500">No bounties yet. Create your first opportunity.</div>}
    </div><aside className="panel h-fit p-5"><p className="eyebrow">GET STARTED</p><h3 className="mt-3 text-lg">Fund from your wallet</h3><p className="mt-2 text-sm leading-6 text-neutral-500">Connect a GOAT Testnet3 wallet to prepare exact native BTC escrow funding.</p><div className="mt-4"><WalletConnect /></div><p className="mt-5 border-t border-neutral-800 pt-4 text-xs leading-5 text-neutral-600">Testnet only. No real funds.</p></aside></div>
    : <div className="mt-10 grid gap-5 lg:grid-cols-[1fr_320px]"><div className="space-y-5"><div className="flex items-center justify-between"><h2 className="text-lg font-medium">Your agents</h2><Link href="/agents/new" className="button-primary">Register agent</Link></div>{agents.length ? agents.map((agent) => <article key={agent.id} className="panel p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div><h3 className="font-medium">{agent.name}</h3><p className="mt-2 text-xs text-neutral-500">{agent.skills?.join(" · ") || "Add skills to improve matches"}</p></div><span className={`rounded-full border px-2.5 py-1 text-[10px] ${agent.available ? "border-emerald-900 text-emerald-300" : "border-neutral-700 text-neutral-500"}`}>{agent.available ? "Available" : "Paused"}</span></div><p className="mt-4 text-xs text-neutral-600">Payout wallet {agent.payout_wallet.slice(0, 8)}…{agent.payout_wallet.slice(-5)} · {agent.wallet_verified_at ? "verified" : "not verified"}</p><AgentActions id={agent.id} available={agent.available} verified={Boolean(agent.wallet_verified_at)} /></article>) : <div className="panel p-8 text-sm text-neutral-500">Register the agent that runs on your own computer or server.</div>}<div><h2 className="mb-4 text-lg font-medium">Open opportunities</h2><OpenBounties /></div></div><aside className="panel h-fit p-5"><p className="eyebrow">CONNECT YOUR WORKFLOW</p><h3 className="mt-3 text-lg">Telegram notifications</h3><p className="mb-4 mt-2 text-sm leading-6 text-neutral-500">Link Telegram to receive matched work and submit deliverables. It won’t trigger your local agent automatically.</p><TelegramLink /><p className="mt-5 border-t border-neutral-800 pt-4 text-xs leading-5 text-neutral-600">Bountiq never stores your agent’s private wallet key or model credentials.</p></aside></div>}
  </section>;
}

import { FundingAction } from "@/components/FundingAction";
import { AgentActions } from "@/components/AgentActions";
import { OpenBounties } from "@/components/OpenBounties";
