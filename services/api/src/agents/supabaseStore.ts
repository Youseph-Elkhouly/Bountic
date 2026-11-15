import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentConfig, BountyForAgent, RunStore } from "./types.js";

export const AGENT_COLUMNS = "id,owner_id,name,description,skills,categories,capabilities,min_reward_base_units,available,autonomy_enabled,runtime,model,instructions,webhook_url,max_concurrent_jobs,max_jobs_per_day,bid_percent,max_bid_base_units,max_tokens_per_job,auto_submit,backboard_assistant_id,memory_enabled,web_search_enabled";
const BOUNTY_COLUMNS = "id,title,description,category,required_skills,deliverable_requirements,max_budget_base_units,deadline,status";

const asAgent = (row: Record<string, unknown>): AgentConfig => ({
  ...(row as unknown as AgentConfig),
  min_reward_base_units: String(row.min_reward_base_units ?? "0"),
  max_bid_base_units: row.max_bid_base_units === null || row.max_bid_base_units === undefined ? null : String(row.max_bid_base_units),
});
const asBounty = (row: Record<string, unknown>, score?: number | null): BountyForAgent => ({
  ...(row as unknown as BountyForAgent),
  max_budget_base_units: String(row.max_budget_base_units),
  required_skills: (row.required_skills as string[]) ?? [],
  match_score: score ?? null,
});

function must<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

export class SupabaseRunStore implements RunStore {
  constructor(private readonly db: SupabaseClient) {}

  async listAutonomousAgents() {
    const rows = must(await this.db.from("agents").select(AGENT_COLUMNS).eq("autonomy_enabled", true).eq("available", true).neq("runtime", "local").limit(500));
    return (rows ?? []).map((row) => asAgent(row as Record<string, unknown>));
  }

  async getAgent(agentId: string) {
    const row = must(await this.db.from("agents").select(AGENT_COLUMNS).eq("id", agentId).maybeSingle());
    return row ? asAgent(row as Record<string, unknown>) : null;
  }

  async countOpenRuns(agentId: string) {
    const { count, error } = await this.db.from("agent_runs").select("id", { count: "exact", head: true }).eq("agent_id", agentId).in("status", ["claimed", "working"]);
    if (error) throw new Error(error.message);
    return count ?? 0;
  }

  async countRunsSince(agentId: string, sinceIso: string) {
    const { count, error } = await this.db.from("agent_runs").select("id", { count: "exact", head: true }).eq("agent_id", agentId).gte("started_at", sinceIso).neq("status", "skipped");
    if (error) throw new Error(error.message);
    return count ?? 0;
  }

  async listCandidateBounties(agentId: string) {
    const [bounties, runs, matches] = await Promise.all([
      this.db.from("bounties").select(BOUNTY_COLUMNS).eq("status", "active").gt("deadline", new Date().toISOString()).order("created_at", { ascending: false }).limit(100),
      this.db.from("agent_runs").select("bounty_id").eq("agent_id", agentId),
      this.db.from("bounty_matches").select("bounty_id,score,notification_status").eq("agent_id", agentId),
    ]);
    const taken = new Set((must(runs) ?? []).map((row) => row.bounty_id as string));
    const matchRows = must(matches) ?? [];
    const declined = new Set(matchRows.filter((row) => row.notification_status === "declined").map((row) => row.bounty_id as string));
    const scores = new Map(matchRows.map((row) => [row.bounty_id as string, Number(row.score)]));
    return (must(bounties) ?? [])
      .filter((row) => !taken.has(row.id as string) && !declined.has(row.id as string))
      .map((row) => asBounty(row as Record<string, unknown>, scores.get(row.id as string)));
  }

  async getBounty(bountyId: string) {
    const row = must(await this.db.from("bounties").select(BOUNTY_COLUMNS).eq("id", bountyId).maybeSingle());
    return row ? asBounty(row as Record<string, unknown>) : null;
  }

  async claimRun(input: { agentId: string; agentName: string; bountyId: string; matchScore: number; bidBaseUnits: string }) {
    const { data, error } = await this.db.from("agent_runs").insert({
      agent_id: input.agentId, agent_name: input.agentName.slice(0, 100), bounty_id: input.bountyId, match_score: input.matchScore, bid_base_units: input.bidBaseUnits, status: "claimed",
    }).select("id").single();
    if (error?.code === "23505") return null;
    if (error) throw new Error(error.message);
    return { id: data.id as string };
  }

  async getRun(runId: string) {
    const row = must(await this.db.from("agent_runs").select("id,agent_id,bounty_id,status,bid_base_units").eq("id", runId).maybeSingle());
    return row ? { ...(row as unknown as { id: string; agent_id: string; bounty_id: string; status: never }), bid_base_units: row.bid_base_units === null ? null : String(row.bid_base_units) } : null;
  }

  async updateRun(runId: string, patch: Record<string, unknown>) {
    must(await this.db.from("agent_runs").update(patch).eq("id", runId));
  }

  async failStaleRuns(olderThanIso: string) {
    const rows = must(await this.db.from("agent_runs").update({ status: "failed", error: "Run timed out", finished_at: new Date().toISOString() })
      .in("status", ["claimed", "working"]).lt("started_at", olderThanIso).select("id"));
    return rows?.length ?? 0;
  }

  async acceptMatch(input: { agentId: string; bountyId: string; score: number }) {
    must(await this.db.from("bounty_matches").upsert({
      bounty_id: input.bountyId, agent_id: input.agentId, score: Math.min(1, Math.max(0, input.score)),
      notification_status: "accepted", response_at: new Date().toISOString(),
    }, { onConflict: "bounty_id,agent_id" }));
  }

  async createSubmission(input: { bountyId: string; agentId: string; proposedAmountBaseUnits: string; deliverableType: "text" | "external_link"; deliverableUrl: string | null; description: string }) {
    const data = must(await this.db.from("submissions").insert({
      bounty_id: input.bountyId, agent_id: input.agentId, proposed_amount_base_units: input.proposedAmountBaseUnits,
      deliverable_type: input.deliverableType, deliverable_url: input.deliverableUrl, storage_path: null, description: input.description,
    }).select("id").single()) as { id: string };
    await this.db.from("audit_logs").insert({ actor_id: null, action: "agent_autosubmitted", entity_type: "submission", entity_id: data.id, details: { agentId: input.agentId, bountyId: input.bountyId } });
    return { id: data.id as string };
  }

  async saveAssistantId(agentId: string, assistantId: string) {
    must(await this.db.from("agents").update({ backboard_assistant_id: assistantId }).eq("id", agentId));
  }

  async logEvent(input: { agentId: string; runId: string | null; kind: string; message: string; data?: Record<string, unknown> }) {
    const { error } = await this.db.from("agent_run_events").insert({ agent_id: input.agentId, run_id: input.runId, kind: input.kind, message: input.message.slice(0, 1000), data: input.data ?? {} });
    if (error) console.error("agent event insert failed", error.message);
  }
}
