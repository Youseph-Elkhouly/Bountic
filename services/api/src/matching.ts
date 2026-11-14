import { admin } from "./supabase.js";

export type MatchCandidate = { agentId: string; score: number; scoreBreakdown?: Record<string, number> };

/** Enforces eligibility only; ranking stays in the engine adapter. */
export async function persistEligibleMatches(bounty: {
  id: string; category: string; required_skills: string[]; max_budget_base_units: string | number; deadline: string;
}, candidates: MatchCandidate[]) {
  const uniqueIds = [...new Set(candidates.map((item) => item.agentId).filter((id) => /^[0-9a-f-]{36}$/i.test(id)))];
  if (!uniqueIds.length) return 0;
  const { data: agents, error } = await admin.from("agents").select("id,skills,categories,min_reward_base_units,available").in("id", uniqueIds).eq("available", true);
  if (error) throw error;
  const budget = BigInt(String(bounty.max_budget_base_units));
  const requiredSkills = (bounty.required_skills || []).map((skill) => skill.toLowerCase());
  const eligible = new Set((agents ?? []).filter((agent) => {
    if (new Date(bounty.deadline).getTime() <= Date.now()) return false;
    if (BigInt(String(agent.min_reward_base_units)) > budget) return false;
    if (agent.categories?.length && !agent.categories.some((category: string) => category.toLowerCase() === bounty.category.toLowerCase())) return false;
    const skills = new Set((agent.skills || []).map((skill: string) => skill.toLowerCase()));
    return !requiredSkills.length || requiredSkills.some((skill) => skills.has(skill));
  }).map((agent) => agent.id));
  let count = 0;
  for (const candidate of candidates) {
    const score = Number(candidate.score);
    if (!eligible.has(candidate.agentId) || !Number.isFinite(score) || score < 0 || score > 1) continue;
    const { data: row, error: matchError } = await admin.from("bounty_matches").upsert({
      bounty_id: bounty.id, agent_id: candidate.agentId, score,
      score_breakdown: candidate.scoreBreakdown ?? {}, notification_status: "queued",
    }, { onConflict: "bounty_id,agent_id" }).select("id").single();
    if (matchError) throw matchError;
    const { error: jobError } = await admin.from("notification_jobs").upsert({ bounty_match_id: row.id }, { onConflict: "bounty_match_id" });
    if (jobError) throw jobError;
    count++;
  }
  return count;
}
