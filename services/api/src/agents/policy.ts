import type { AgentConfig, BountyForAgent } from "./types.js";

const lower = (values: string[] | null | undefined) => (values ?? []).map((value) => value.trim().toLowerCase()).filter(Boolean);

/**
 * Hard eligibility rules. These are limits, not ranking: the engine (or the
 * fallback fit score below) decides order, but nothing ineligible is ever claimed.
 */
export function eligibility(agent: AgentConfig, bounty: BountyForAgent, now = Date.now()): { ok: true } | { ok: false; reason: string } {
  if (bounty.status !== "active") return { ok: false, reason: "bounty is not open" };
  if (new Date(bounty.deadline).getTime() <= now + 60_000) return { ok: false, reason: "deadline has passed or is too close" };
  if (BigInt(bounty.max_budget_base_units) < BigInt(agent.min_reward_base_units || "0")) return { ok: false, reason: "budget is below the agent's minimum reward" };
  const categories = lower(agent.categories);
  if (categories.length && !categories.includes(bounty.category.trim().toLowerCase())) return { ok: false, reason: `category "${bounty.category}" is outside this agent's categories` };
  const required = lower(bounty.required_skills);
  const skills = new Set(lower(agent.skills));
  if (required.length && !required.some((skill) => skills.has(skill))) return { ok: false, reason: "none of the required skills match" };
  if (bid(agent, bounty) === null) return { ok: false, reason: "no bid fits between the minimum reward and the agent's bid cap" };
  return { ok: true };
}

/** Fallback fit score in [0,1] when the engine has not scored this pair: share of required skills covered. */
export function fitScore(agent: AgentConfig, bounty: BountyForAgent): number {
  if (typeof bounty.match_score === "number" && Number.isFinite(bounty.match_score)) return Math.min(1, Math.max(0, bounty.match_score));
  const required = lower(bounty.required_skills);
  if (!required.length) return 0.5;
  const skills = new Set(lower(agent.skills));
  return required.filter((skill) => skills.has(skill)).length / required.length;
}

/** Proposed payout: bid_percent of the escrowed budget, capped by the owner's max bid, never below the minimum reward. */
export function bid(agent: AgentConfig, bounty: BountyForAgent): string | null {
  const budget = BigInt(bounty.max_budget_base_units);
  let amount = (budget * BigInt(agent.bid_percent)) / 100n;
  if (agent.max_bid_base_units) {
    const cap = BigInt(agent.max_bid_base_units);
    if (amount > cap) amount = cap;
  }
  const minimum = BigInt(agent.min_reward_base_units || "0");
  if (amount < minimum) amount = minimum;
  if (amount <= 0n || amount > budget) return null;
  if (agent.max_bid_base_units && amount > BigInt(agent.max_bid_base_units)) return null;
  return amount.toString();
}
