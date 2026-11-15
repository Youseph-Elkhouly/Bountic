import { createHash, randomBytes } from "node:crypto";
import { bid, eligibility, fitScore } from "./policy.js";
import type { AgentConfig, BountyForAgent, RunStore } from "./types.js";

/**
 * Agents that run on the developer's own hardware. They hold a runner key and pull jobs
 * (no public URL needed). The same limits, fit scoring and one-claim-per-bounty rule apply.
 */
export const RUNNER_KEY_PREFIX = "bqa_";
export const newRunnerKey = () => `${RUNNER_KEY_PREFIX}${randomBytes(32).toString("base64url")}`;
export const hashRunnerKey = (key: string) => createHash("sha256").update(key).digest("hex");
export const looksLikeRunnerKey = (value: string) => /^bqa_[A-Za-z0-9_-]{40,64}$/.test(value);

export type LocalJob = {
  runId: string;
  bounty: Pick<BountyForAgent, "id" | "title" | "description" | "category" | "required_skills" | "deliverable_requirements" | "deadline">;
  bidBaseUnits: string;
  maxTokens: number;
  instructions: string;
};

const DAY_MS = 24 * 60 * 60 * 1000;

/** Claims the best eligible bounty for this agent, or explains why there is none. */
export async function nextLocalJob(store: RunStore, agentInput: AgentConfig, now: () => number = Date.now): Promise<{ job: LocalJob | null; reason: string | null }> {
  const agent = await store.getAgent(agentInput.id);
  if (!agent || !agent.available || !agent.autonomy_enabled) return { job: null, reason: "autopilot is off" };
  if (agent.runtime !== "local") return { job: null, reason: "this agent does not use a local runner" };
  if (agent.max_concurrent_jobs - await store.countOpenRuns(agent.id) <= 0) return { job: null, reason: "at its concurrent job limit" };
  if (agent.max_jobs_per_day - await store.countRunsSince(agent.id, new Date(now() - DAY_MS).toISOString()) <= 0) return { job: null, reason: "daily job limit reached" };

  const candidates = await store.listCandidateBounties(agent.id);
  const ranked = candidates
    .map((bounty) => ({ bounty, check: eligibility(agent, bounty, now()), score: fitScore(agent, bounty) }))
    .filter((item): item is { bounty: BountyForAgent; check: { ok: true }; score: number } => item.check.ok)
    .sort((a, b) => b.score - a.score);
  await store.logEvent({ agentId: agent.id, runId: null, kind: "scan", message: ranked.length ? `Local runner scanned ${candidates.length} open bounties; ${ranked.length} fit.` : `Local runner scanned ${candidates.length} open bounties; none fit.`, data: { candidates: candidates.length, eligible: ranked.length } });
  for (const { bounty, score } of ranked) {
    const proposed = bid(agent, bounty)!;
    const run = await store.claimRun({ agentId: agent.id, agentName: agent.name, bountyId: bounty.id, matchScore: score, bidBaseUnits: proposed });
    if (!run) continue;
    await store.acceptMatch({ agentId: agent.id, bountyId: bounty.id, score });
    await store.updateRun(run.id, { status: "working", executor: "local" });
    await store.logEvent({ agentId: agent.id, runId: run.id, kind: "claimed", message: `Local runner picked up "${bounty.title}" (${Math.round(score * 100)}% fit, bidding ${proposed} base units).`, data: { bountyId: bounty.id, score, bid: proposed } });
    await store.logEvent({ agentId: agent.id, runId: run.id, kind: "working", message: `Working on "${bounty.title}" on the developer's own machine…`, data: { bountyId: bounty.id, runtime: "local" } });
    const { id, title, description, category, required_skills, deliverable_requirements, deadline } = bounty;
    return { job: { runId: run.id, bounty: { id, title, description, category, required_skills, deliverable_requirements, deadline }, bidBaseUnits: proposed, maxTokens: agent.max_tokens_per_job, instructions: agent.instructions }, reason: null };
  }
  return { job: null, reason: ranked.length ? "another worker already took the matching bounties" : "no open bounty fits this agent" };
}

export type LocalSubmitResult = { ok: true; submissionId: string; held: boolean } | { ok: false; status: number; error: string };

export async function submitLocalRun(store: RunStore, agentInput: AgentConfig, runId: string, deliverable: string, now: () => number = Date.now): Promise<LocalSubmitResult> {
  const text = deliverable.trim();
  if (!text || text.length > 20000) return { ok: false, status: 400, error: "Deliverable must be 1-20,000 characters" };
  const agent = await store.getAgent(agentInput.id);
  const run = await store.getRun(runId);
  if (!agent || !run || run.agent_id !== agent.id) return { ok: false, status: 404, error: "Run not found" };
  if (run.status !== "working") return { ok: false, status: 409, error: `Run is already ${run.status}` };
  const bounty = await store.getBounty(run.bounty_id);
  if (!bounty || bounty.status !== "active" || new Date(bounty.deadline).getTime() <= now()) {
    await store.updateRun(run.id, { status: "skipped", error: "Bounty closed before submission", finished_at: new Date(now()).toISOString() });
    await store.logEvent({ agentId: agent.id, runId: run.id, kind: "skipped", message: "Bounty closed before the local runner could submit." });
    return { ok: false, status: 409, error: "Bounty is closed" };
  }
  await store.updateRun(run.id, { deliverable: text, finished_at: new Date(now()).toISOString() });
  if (!agent.auto_submit) {
    await store.updateRun(run.id, { status: "awaiting_review" });
    await store.logEvent({ agentId: agent.id, runId: run.id, kind: "paused", message: "Draft received from the local runner. Auto-submit is off, so it is waiting for your approval." });
    return { ok: true, submissionId: "", held: true };
  }
  const proposed = run.bid_base_units ?? bounty.max_budget_base_units;
  const submission = await store.createSubmission({ bountyId: bounty.id, agentId: agent.id, proposedAmountBaseUnits: proposed, deliverableType: "text", deliverableUrl: null, description: text.slice(0, 8000) });
  await store.updateRun(run.id, { status: "submitted", submission_id: submission.id });
  await store.logEvent({ agentId: agent.id, runId: run.id, kind: "submitted", message: `Local runner submitted to "${bounty.title}" for ${proposed} base units. Waiting on the requester.`, data: { bountyId: bounty.id, submissionId: submission.id } });
  return { ok: true, submissionId: submission.id, held: false };
}

/**
 * What Bountic keeps from a payout. Every payout pays the marketplace (service) fee, whoever runs the agent.
 * Agents that Bountic hosts also pay a hosting fee for the infrastructure. Integer math, rounded down.
 */
export function platformCut(runtime: AgentConfig["runtime"], grossBaseUnits: string, fees: { serviceBps: number; hostedBps: number }) {
  const gross = BigInt(grossBaseUnits);
  const serviceBps = fees.serviceBps;
  const hostingBps = runtime === "hosted" ? fees.hostedBps : 0;
  const service = (gross * BigInt(serviceBps)) / BigInt(10000);
  const hosting = (gross * BigInt(hostingBps)) / BigInt(10000);
  const fee = service + hosting;
  return { serviceBps, hostingBps, feeBps: serviceBps + hostingBps, gross: gross.toString(), serviceFee: service.toString(), hostingFee: hosting.toString(), fee: fee.toString(), net: (gross - fee).toString() };
}
