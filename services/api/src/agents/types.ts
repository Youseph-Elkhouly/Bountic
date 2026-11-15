export type AgentConfig = {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  skills: string[];
  categories: string[];
  capabilities: string[];
  min_reward_base_units: string;
  available: boolean;
  autonomy_enabled: boolean;
  runtime: "hosted" | "local" | "webhook";
  model: string;
  instructions: string;
  webhook_url: string | null;
  max_concurrent_jobs: number;
  max_jobs_per_day: number;
  bid_percent: number;
  max_bid_base_units: string | null;
  max_tokens_per_job: number;
  auto_submit: boolean;
  backboard_assistant_id: string | null;
  memory_enabled: boolean;
  web_search_enabled: boolean;
};

export type BountyForAgent = {
  id: string;
  title: string;
  description: string;
  category: string;
  required_skills: string[];
  deliverable_requirements: string;
  max_budget_base_units: string;
  deadline: string;
  status: string;
  match_score?: number | null;
};

export type RunStatus = "claimed" | "working" | "awaiting_review" | "submitted" | "failed" | "skipped";
export type EventKind = "scan" | "claimed" | "working" | "drafted" | "submitted" | "skipped" | "failed" | "limit" | "paused";

export type RunPatch = Partial<{
  status: RunStatus; deliverable: string; submission_id: string; executor: string;
  tokens_used: number; error: string; finished_at: string; backboard_thread_id: string;
}>;

export type SubmissionInput = {
  bountyId: string; agentId: string; proposedAmountBaseUnits: string;
  deliverableType: "text" | "external_link"; deliverableUrl: string | null; description: string;
};

/** Everything the runner needs from storage. Supabase in production, in-memory in tests and the demo. */
export interface RunStore {
  listAutonomousAgents(): Promise<AgentConfig[]>;
  getAgent(agentId: string): Promise<AgentConfig | null>;
  countOpenRuns(agentId: string): Promise<number>;
  countRunsSince(agentId: string, sinceIso: string): Promise<number>;
  /** Active, unexpired bounties this agent has not already run, with any engine match score. */
  listCandidateBounties(agentId: string): Promise<BountyForAgent[]>;
  getBounty(bountyId: string): Promise<BountyForAgent | null>;
  /** Returns null when another worker already claimed this agent/bounty pair. */
  claimRun(input: { agentId: string; agentName: string; bountyId: string; matchScore: number; bidBaseUnits: string }): Promise<{ id: string } | null>;
  getRun(runId: string): Promise<{ id: string; agent_id: string; bounty_id: string; status: RunStatus; bid_base_units: string | null } | null>;
  updateRun(runId: string, patch: RunPatch): Promise<void>;
  /** Marks claimed/working runs older than the cutoff as failed so slots free up after a crash. */
  failStaleRuns(olderThanIso: string): Promise<number>;
  acceptMatch(input: { agentId: string; bountyId: string; score: number }): Promise<void>;
  createSubmission(input: SubmissionInput): Promise<{ id: string }>;
  /** Remembers the Backboard assistant created for this agent. */
  saveAssistantId(agentId: string, assistantId: string): Promise<void>;
  logEvent(input: { agentId: string; runId: string | null; kind: EventKind; message: string; data?: Record<string, unknown> }): Promise<void>;
}

export type ExecutionResult = { deliverable: string; deliverableUrl: string | null; tokensUsed: number; executor: string; threadId?: string; memoriesUsed?: number };

export interface Executor {
  execute(input: { agent: AgentConfig; bounty: BountyForAgent; maxTokens: number }): Promise<ExecutionResult>;
}
