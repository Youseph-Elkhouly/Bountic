import { cache } from "react";
import { qatomReceiptColumns, type QatomReceipt } from "@/lib/qatom";
import { requireSide } from "@/lib/session";

const none = Promise.resolve({ data: [], error: null });

export type Agent = {
  id: string; name: string; description: string; skills: string[]; categories: string[]; capabilities: string[];
  min_reward_base_units: string | number; payout_wallet: string | null; available: boolean; wallet_verified_at: string | null; created_at: string;
};
type Match = { id: string; bounty_id: string; agent_id: string; score: number | string | null; notification_status: string; created_at: string };
type Submission = { id: string; bounty_id: string; agent_id: string; proposed_amount_base_units: string | number; deliverable_type: string; deliverable_url: string | null; storage_path: string | null; description: string; winner: boolean | null; submitted_at: string };
type Bounty = { id: string; title: string; description: string; category: string; required_skills: string[] | null; deliverable_requirements: string | null; max_budget_base_units: string | number; asset_symbol: string; display_fiat_amount: string | number | null; display_fiat_currency: string | null; deadline: string; status: string };
type Payment = { id: string; bounty_id: string; kind: string; status: string; amount_base_units: string | number; tx_hash: string | null; explorer_url: string | null; created_at: string; submission_id: string | null };

/** Everything the developer platform lists, loaded once per request. */
export const loadDeveloper = cache(async () => {
  const session = await requireSide("developer");
  if (!session.ok) return { ok: false as const, title: "Could not verify your account", message: session.message };
  const { supabase, user, profile } = session;

  const { data: agentData, error: agentError } = await supabase.from("agents")
    .select("id,name,description,skills,categories,capabilities,min_reward_base_units,payout_wallet,available,wallet_verified_at,created_at")
    .eq("owner_id", user.id).order("created_at", { ascending: false });
  if (agentError) return { ok: false as const, title: "Could not load your agents", message: agentError.message };

  const agents = (agentData || []) as Agent[];
  const agentIds = agents.map((agent) => agent.id);
  const [matchResult, submissionResult, receiptResult] = await Promise.all([
    agentIds.length ? supabase.from("bounty_matches").select("id,bounty_id,agent_id,score,notification_status,created_at").in("agent_id", agentIds).order("created_at", { ascending: false }) : none,
    agentIds.length ? supabase.from("submissions").select("id,bounty_id,agent_id,proposed_amount_base_units,deliverable_type,deliverable_url,storage_path,description,winner,submitted_at").in("agent_id", agentIds).order("submitted_at", { ascending: false }) : none,
    agentIds.length ? supabase.from("qatom_receipts").select(qatomReceiptColumns).in("agent_id", agentIds).order("occurred_at", { ascending: false }).limit(20) : none,
  ]);
  const loadIssue = matchResult.error || submissionResult.error || receiptResult.error;
  if (loadIssue) return { ok: false as const, title: "Could not load your agents' work", message: loadIssue.message };
  const matches = (matchResult.data || []) as Match[];
  const submissions = (submissionResult.data || []) as Submission[];
  const receipts = (receiptResult.data || []) as QatomReceipt[];

  const bountyIds = [...new Set([...matches.map((item) => item.bounty_id), ...submissions.map((item) => item.bounty_id), ...receipts.map((item) => item.bounty_id)])];
  const [bountyResult, paymentResult] = await Promise.all([
    bountyIds.length ? supabase.from("bounties").select("id,title,description,category,required_skills,deliverable_requirements,max_budget_base_units,asset_symbol,display_fiat_amount,display_fiat_currency,deadline,status").in("id", bountyIds) : none,
    bountyIds.length ? supabase.from("payments").select("id,bounty_id,kind,status,amount_base_units,tx_hash,explorer_url,created_at,submission_id").in("bounty_id", bountyIds).order("created_at", { ascending: false }) : none,
  ]);
  const laterIssue = bountyResult.error || paymentResult.error;
  if (laterIssue) return { ok: false as const, title: "Could not load bounty and payment details", message: laterIssue.message };

  const bounties = (bountyResult.data || []) as Bounty[];
  const payments = (paymentResult.data || []) as Payment[];
  const bountyById = new Map(bounties.map((bounty) => [bounty.id, bounty]));
  const agentById = new Map(agents.map((agent) => [agent.id, agent]));

  const settlements = payments.filter((payment) => payment.kind === "settlement");
  const total = (status: string) => settlements.filter((payment) => payment.status === status).reduce((sum, payment) => sum + BigInt(payment.amount_base_units), BigInt(0));
  const opportunities = matches.filter((match) => match.notification_status === "sent" || match.notification_status === "accepted")
    .map((match) => ({ match, bounty: bountyById.get(match.bounty_id), agent: agentById.get(match.agent_id) }))
    .filter((item): item is { match: Match; bounty: Bounty; agent: Agent } => item.bounty?.status === "active" && Boolean(item.agent));

  return {
    ok: true as const, supabase, user, profile, agents, submissions, receipts, bounties, bountyById, agentById, settlements,
    confirmedEarnings: total("confirmed"), pendingEarnings: total("pending"),
    invitations: opportunities.filter((item) => item.match.notification_status === "sent"),
    accepted: opportunities.filter((item) => item.match.notification_status === "accepted"),
  };
});
