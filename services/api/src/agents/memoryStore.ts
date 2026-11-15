import { randomUUID } from "node:crypto";
import type { AgentConfig, BountyForAgent, EventKind, RunPatch, RunStatus, RunStore, SubmissionInput } from "./types.js";

export type MemoryRun = { id: string; agent_id: string; bounty_id: string; status: RunStatus; match_score: number; bid_base_units: string; started_at: string } & RunPatch;
export type MemoryEvent = { agentId: string; runId: string | null; kind: EventKind; message: string; data?: Record<string, unknown>; at: string };

/** In-process store for tests and the CLI demo. Mirrors the database's unique (agent, bounty) claim. */
export class MemoryRunStore implements RunStore {
  agents = new Map<string, AgentConfig>();
  bounties = new Map<string, BountyForAgent>();
  runs: MemoryRun[] = [];
  submissions: Array<SubmissionInput & { id: string }> = [];
  matches = new Map<string, { score: number; status: string }>();
  events: MemoryEvent[] = [];
  onEvent?: (event: MemoryEvent) => void;

  constructor(private readonly clock: () => number = Date.now) {}

  async listAutonomousAgents() { return [...this.agents.values()].filter((agent) => agent.autonomy_enabled && agent.available && agent.runtime !== "local"); }
  async getAgent(id: string) { const agent = this.agents.get(id); return agent ? { ...agent } : null; }
  async countOpenRuns(agentId: string) { return this.runs.filter((run) => run.agent_id === agentId && (run.status === "claimed" || run.status === "working")).length; }
  async countRunsSince(agentId: string, since: string) { return this.runs.filter((run) => run.agent_id === agentId && run.started_at >= since && run.status !== "skipped").length; }
  async listCandidateBounties(agentId: string) {
    const taken = new Set(this.runs.filter((run) => run.agent_id === agentId).map((run) => run.bounty_id));
    return [...this.bounties.values()]
      .filter((bounty) => bounty.status === "active" && !taken.has(bounty.id) && this.matches.get(`${bounty.id}:${agentId}`)?.status !== "declined")
      .map((bounty) => ({ ...bounty, match_score: this.matches.get(`${bounty.id}:${agentId}`)?.score ?? bounty.match_score ?? null }));
  }
  async getBounty(id: string) { const bounty = this.bounties.get(id); return bounty ? { ...bounty } : null; }
  async claimRun(input: { agentId: string; agentName: string; bountyId: string; matchScore: number; bidBaseUnits: string }) {
    if (this.runs.some((run) => run.agent_id === input.agentId && run.bounty_id === input.bountyId)) return null;
    const run: MemoryRun = { id: randomUUID(), agent_id: input.agentId, bounty_id: input.bountyId, status: "claimed", match_score: input.matchScore, bid_base_units: input.bidBaseUnits, started_at: new Date(this.clock()).toISOString() };
    this.runs.push(run);
    return { id: run.id };
  }
  async getRun(id: string) { const run = this.runs.find((item) => item.id === id); return run ? { id: run.id, agent_id: run.agent_id, bounty_id: run.bounty_id, status: run.status, bid_base_units: (run as { bid_base_units?: string | null }).bid_base_units ?? null } : null; }
  async updateRun(id: string, patch: RunPatch) { const run = this.runs.find((item) => item.id === id); if (run) Object.assign(run, patch); }
  async failStaleRuns(olderThan: string) {
    let count = 0;
    for (const run of this.runs) if ((run.status === "claimed" || run.status === "working") && run.started_at < olderThan) { run.status = "failed"; run.error = "Run timed out"; count++; }
    return count;
  }
  async acceptMatch(input: { agentId: string; bountyId: string; score: number }) { this.matches.set(`${input.bountyId}:${input.agentId}`, { score: input.score, status: "accepted" }); }
  async createSubmission(input: SubmissionInput) { const id = randomUUID(); this.submissions.push({ ...input, id }); return { id }; }
  async saveAssistantId(agentId: string, assistantId: string) { const agent = this.agents.get(agentId); if (agent) agent.backboard_assistant_id = assistantId; }
  async logEvent(input: { agentId: string; runId: string | null; kind: EventKind; message: string; data?: Record<string, unknown> }) {
    const event = { ...input, at: new Date(this.clock()).toISOString() };
    this.events.push(event);
    this.onEvent?.(event);
  }
}

export function agentFixture(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    id: randomUUID(), owner_id: randomUUID(), name: "Agent", description: "", skills: [], categories: [], capabilities: [],
    min_reward_base_units: "0", available: true, autonomy_enabled: true, runtime: "hosted", model: "auto", instructions: "",
    webhook_url: null, max_concurrent_jobs: 1, max_jobs_per_day: 5, bid_percent: 90, max_bid_base_units: null,
    max_tokens_per_job: 4000, auto_submit: true, backboard_assistant_id: null, memory_enabled: true, web_search_enabled: false, ...overrides,
  };
}

export function bountyFixture(overrides: Partial<BountyForAgent> = {}): BountyForAgent {
  return {
    id: randomUUID(), title: "A bounty", description: "Do a thing that is well described.", category: "writing", required_skills: [],
    deliverable_requirements: "", max_budget_base_units: "1000", deadline: new Date(Date.now() + 86_400_000).toISOString(), status: "active", match_score: null, ...overrides,
  };
}
