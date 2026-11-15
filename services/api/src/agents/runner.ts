import { bid, eligibility, fitScore } from "./policy.js";
import type { AgentConfig, BountyForAgent, Executor, RunStore } from "./types.js";

export const STALE_RUN_MS = 15 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type AgentTickResult = { agentId: string; claimed: number; submitted: number; failed: number; skipped: string | null };

/**
 * One scheduling pass for one agent: check the owner's limits, pick the best
 * eligible open bounties, claim them, do the work, and submit (or hold for review).
 * Safe to run from several workers at once: the (agent, bounty) claim is unique.
 */
export async function tickAgent(store: RunStore, executor: Executor, agentInput: AgentConfig, options: { now?: () => number; force?: boolean } = {}): Promise<AgentTickResult> {
  const now = options.now ?? Date.now;
  const result: AgentTickResult = { agentId: agentInput.id, claimed: 0, submitted: 0, failed: 0, skipped: null };
  const agent = await store.getAgent(agentInput.id);
  if (!agent || !agent.available || (!agent.autonomy_enabled && !options.force)) {
    result.skipped = "autopilot is off";
    return result;
  }
  if (agent.runtime === "local") { result.skipped = "runs on the developer's own machine (pulls jobs itself)"; return result; }

  const open = await store.countOpenRuns(agent.id);
  const slots = agent.max_concurrent_jobs - open;
  if (slots <= 0) { result.skipped = "at its concurrent job limit"; return result; }
  const today = await store.countRunsSince(agent.id, new Date(now() - DAY_MS).toISOString());
  const dailyLeft = agent.max_jobs_per_day - today;
  if (dailyLeft <= 0) {
    result.skipped = "daily job limit reached";
    await store.logEvent({ agentId: agent.id, runId: null, kind: "limit", message: `Daily limit of ${agent.max_jobs_per_day} jobs reached; waiting until it resets.` });
    return result;
  }

  const candidates = await store.listCandidateBounties(agent.id);
  const ranked = candidates
    .map((bounty) => ({ bounty, check: eligibility(agent, bounty, now()), score: fitScore(agent, bounty) }))
    .filter((item): item is { bounty: BountyForAgent; check: { ok: true }; score: number } => item.check.ok)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const budgetA = BigInt(a.bounty.max_budget_base_units), budgetB = BigInt(b.bounty.max_budget_base_units);
      return budgetB > budgetA ? 1 : budgetB < budgetA ? -1 : 0;
    });

  if (options.force || ranked.length) {
    await store.logEvent({ agentId: agent.id, runId: null, kind: "scan", message: ranked.length ? `Scanned ${candidates.length} open bounties; ${ranked.length} fit this agent.` : `Scanned ${candidates.length} open bounties; none fit this agent's skills, categories and limits.`, data: { candidates: candidates.length, eligible: ranked.length } });
  }

  const picks = ranked.slice(0, Math.min(slots, dailyLeft));
  const runs = await Promise.allSettled(picks.map(async ({ bounty, score }) => {
    const proposed = bid(agent, bounty)!;
    const run = await store.claimRun({ agentId: agent.id, agentName: agent.name, bountyId: bounty.id, matchScore: score, bidBaseUnits: proposed });
    if (!run) return "lost";
    result.claimed++;
    await store.acceptMatch({ agentId: agent.id, bountyId: bounty.id, score });
    await store.logEvent({ agentId: agent.id, runId: run.id, kind: "claimed", message: `Picked up "${bounty.title}" (${Math.round(score * 100)}% fit, bidding ${proposed} base units).`, data: { bountyId: bounty.id, score, bid: proposed } });
    try {
      await store.updateRun(run.id, { status: "working" });
      await store.logEvent({ agentId: agent.id, runId: run.id, kind: "working", message: `Working on "${bounty.title}"…`, data: { bountyId: bounty.id, runtime: agent.runtime } });
      const output = await executor.execute({ agent, bounty, maxTokens: agent.max_tokens_per_job });
      await store.updateRun(run.id, { deliverable: output.deliverable, executor: output.executor, tokens_used: output.tokensUsed, ...(output.threadId ? { backboard_thread_id: output.threadId } : {}) });
      await store.logEvent({ agentId: agent.id, runId: run.id, kind: "drafted", message: `Drafted a ${output.deliverable.length.toLocaleString()}-character deliverable${output.tokensUsed ? ` using ${output.tokensUsed.toLocaleString()} tokens` : ""} (${output.executor})${output.memoriesUsed ? `, drawing on ${output.memoriesUsed} memor${output.memoriesUsed === 1 ? "y" : "ies"} from past jobs` : ""}.`, data: { bountyId: bounty.id, executor: output.executor, tokensUsed: output.tokensUsed, threadId: output.threadId ?? null } });

      // Re-check the kill switch and the bounty right before anything leaves the platform.
      const [latestAgent, latestBounty] = await Promise.all([store.getAgent(agent.id), store.getBounty(bounty.id)]);
      if (!latestAgent?.available || (!latestAgent.autonomy_enabled && !options.force)) {
        await store.updateRun(run.id, { status: "awaiting_review", finished_at: new Date(now()).toISOString() });
        await store.logEvent({ agentId: agent.id, runId: run.id, kind: "paused", message: "Autopilot was switched off mid-task, so the draft is held for your review." });
        return "held";
      }
      if (!latestBounty || latestBounty.status !== "active" || new Date(latestBounty.deadline).getTime() <= now()) {
        await store.updateRun(run.id, { status: "skipped", error: "Bounty closed before submission", finished_at: new Date(now()).toISOString() });
        await store.logEvent({ agentId: agent.id, runId: run.id, kind: "skipped", message: `"${bounty.title}" closed before the agent could submit.` });
        return "closed";
      }
      if (output.tokensUsed > agent.max_tokens_per_job) {
        await store.updateRun(run.id, { status: "awaiting_review", finished_at: new Date(now()).toISOString() });
        await store.logEvent({ agentId: agent.id, runId: run.id, kind: "limit", message: `Used ${output.tokensUsed.toLocaleString("en-US")} tokens, over the ${agent.max_tokens_per_job.toLocaleString("en-US")}-token limit, so the draft is held for your review.`, data: { tokensUsed: output.tokensUsed } });
        return "held";
      }
      if (!agent.auto_submit) {
        await store.updateRun(run.id, { status: "awaiting_review", finished_at: new Date(now()).toISOString() });
        await store.logEvent({ agentId: agent.id, runId: run.id, kind: "paused", message: "Draft ready. Auto-submit is off, so it is waiting for your approval." });
        return "held";
      }
      const submission = await store.createSubmission({
        bountyId: bounty.id, agentId: agent.id, proposedAmountBaseUnits: proposed,
        deliverableType: output.deliverableUrl ? "external_link" : "text", deliverableUrl: output.deliverableUrl,
        description: output.deliverable.slice(0, 8000),
      });
      await store.updateRun(run.id, { status: "submitted", submission_id: submission.id, finished_at: new Date(now()).toISOString() });
      await store.logEvent({ agentId: agent.id, runId: run.id, kind: "submitted", message: `Submitted to "${bounty.title}" for ${proposed} base units. Waiting on the requester.`, data: { bountyId: bounty.id, submissionId: submission.id } });
      result.submitted++;
      return "submitted";
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      result.failed++;
      await store.updateRun(run.id, { status: "failed", error: message.slice(0, 1000), finished_at: new Date(now()).toISOString() });
      await store.logEvent({ agentId: agent.id, runId: run.id, kind: "failed", message: `Failed on "${bounty.title}": ${message}`.slice(0, 1000), data: { bountyId: bounty.id } });
      return "failed";
    }
  }));
  for (const run of runs) if (run.status === "rejected") console.error("agent run crashed", run.reason);
  return result;
}

/** One pass over every agent with autopilot on. */
export async function tickAll(store: RunStore, executor: Executor, options: { now?: () => number } = {}) {
  const now = options.now ?? Date.now;
  await store.failStaleRuns(new Date(now() - STALE_RUN_MS).toISOString());
  const agents = await store.listAutonomousAgents();
  const results = await Promise.allSettled(agents.map((agent) => tickAgent(store, executor, agent, options)));
  return results.map((item, index) => item.status === "fulfilled" ? item.value : { agentId: agents[index].id, claimed: 0, submitted: 0, failed: 1, skipped: "crashed" });
}

/** Background loop inside the API process. Never overlaps itself. */
export function startAgentWorker(store: RunStore, executor: Executor, intervalMs: number) {
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try { await tickAll(store, executor); } catch (error) { console.error("agent worker tick failed", error instanceof Error ? error.message : error); }
    finally { running = false; }
  }, intervalMs);
  timer.unref?.();
  return () => clearInterval(timer);
}
