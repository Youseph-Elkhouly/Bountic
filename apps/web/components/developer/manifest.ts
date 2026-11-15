/** Agent settings as the builder edits them, plus the portable bountic.agent.json format. */
export type AgentDraft = {
  name: string;
  description: string;
  skills: string[];
  categories: string[];
  capabilities: string[];
  runtime: "hosted" | "local" | "webhook";
  model: string;
  instructions: string;
  webhookUrl: string;
  minRewardBaseUnits: string;
  bidPercent: number;
  maxBidBaseUnits: string;
  maxConcurrentJobs: number;
  maxJobsPerDay: number;
  maxTokensPerJob: number;
  toolBudgetUsdTdn: string;
  autonomyEnabled: boolean;
  autoSubmit: boolean;
  memoryEnabled: boolean;
  webSearchEnabled: boolean;
  available: boolean;
  payoutWallet: string;
};

export const emptyDraft: AgentDraft = {
  name: "", description: "", skills: [], categories: [], capabilities: [],
  runtime: "hosted", model: "auto", instructions: "", webhookUrl: "",
  minRewardBaseUnits: "0", bidPercent: 90, maxBidBaseUnits: "", maxConcurrentJobs: 1, maxJobsPerDay: 5,
  maxTokensPerJob: 4000, toolBudgetUsdTdn: "0", autonomyEnabled: true, autoSubmit: true, memoryEnabled: true, webSearchEnabled: false, available: true, payoutWallet: "",
};

/** Shown until the API returns Backboard's live model catalog. Values are "provider/model". */
export const MODELS = [
  { value: "auto", label: "Backboard default" },
  { value: "anthropic/claude-sonnet-4-20250514", label: "Claude Sonnet 4 (Anthropic)" },
  { value: "openai/gpt-4o", label: "GPT-4o (OpenAI)" },
];
export const MODEL_PATTERN = /^[a-zA-Z0-9._:/-]{1,80}$/;

export type Template = { id: string; emoji: string; title: string; blurb: string; draft: Partial<AgentDraft> };

export const TEMPLATES: Template[] = [
  { id: "copywriter", emoji: "✍️", title: "Copywriter", blurb: "Landing pages, emails, ads", draft: {
    name: "Copybot", description: "Writes clear, conversion-focused marketing copy.", skills: ["copywriting", "seo", "editing"], categories: ["writing", "marketing"],
    instructions: "Lead with the customer's problem. Short sentences. Always include a headline, benefits and a call to action.", bidPercent: 85, maxJobsPerDay: 10, maxConcurrentJobs: 2,
  } },
  { id: "researcher", emoji: "🔎", title: "Researcher", blurb: "Market scans, competitor briefs", draft: {
    name: "Scout", description: "Produces structured research briefs with clear takeaways.", skills: ["research", "analysis", "summarization"], categories: ["research"],
    instructions: "Structure every brief as: summary, findings, comparison table, risks, recommendation. Flag anything you could not verify.", bidPercent: 90, maxTokensPerJob: 6000, webSearchEnabled: true,
  } },
  { id: "coder", emoji: "🧑‍💻", title: "Code reviewer", blurb: "Reviews, scripts, docs", draft: {
    name: "Reviewr", description: "Reviews code and writes small scripts and technical docs.", skills: ["typescript", "python", "code review", "documentation"], categories: ["engineering", "code"],
    instructions: "Never claim code was run. Give exact file and line references, and propose minimal diffs.", bidPercent: 95, maxConcurrentJobs: 1, maxTokensPerJob: 8000,
  } },
  { id: "local", emoji: "💻", title: "My own machine", blurb: "Runs on your hardware, no fee", draft: {
    name: "Homebot", description: "My own agent, running on my machine.", runtime: "local", instructions: "",
  } },
  { id: "byo", emoji: "🔌", title: "Webhook", blurb: "Your server, public HTTPS", draft: {
    name: "My agent", description: "My own agent, running on my infrastructure.", runtime: "webhook", webhookUrl: "https://", instructions: "",
  } },
];

const str = (value: unknown, max: number) => typeof value === "string" ? value.slice(0, max) : undefined;
const list = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim().slice(0, 80)).filter(Boolean).slice(0, 30) : undefined;
const int = (value: unknown, min: number, max: number) => typeof value === "number" && Number.isInteger(value) && value >= min && value <= max ? value : undefined;
const units = (value: unknown) => typeof value === "string" && /^(0|[1-9][0-9]{0,77})$/.test(value) ? value : undefined;

/**
 * Reads a dropped bountic.agent.json. Only known fields are taken, each validated.
 * A payout wallet in the file is deliberately ignored: owners type and verify their own.
 */
export function parseManifest(text: string): { draft: Partial<AgentDraft>; ignored: string[] } {
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { throw new Error("That file isn't valid JSON."); }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("Expected a JSON object describing one agent.");
  const input = raw as Record<string, unknown>;
  const limits = (input.limits && typeof input.limits === "object" ? input.limits : {}) as Record<string, unknown>;
  const autopilot = (input.autopilot && typeof input.autopilot === "object" ? input.autopilot : {}) as Record<string, unknown>;
  const draft: Partial<AgentDraft> = {
    name: str(input.name, 100), description: str(input.description, 4000),
    skills: list(input.skills), categories: list(input.categories), capabilities: list(input.capabilities),
    runtime: input.runtime === "webhook" || input.runtime === "hosted" || input.runtime === "local" ? input.runtime : undefined,
    model: typeof input.model === "string" && MODEL_PATTERN.test(input.model) ? input.model : undefined,
    instructions: str(input.instructions, 8000),
    webhookUrl: typeof input.webhookUrl === "string" && input.webhookUrl.startsWith("https://") ? input.webhookUrl.slice(0, 2000) : undefined,
    minRewardBaseUnits: units(limits.minRewardBaseUnits), maxBidBaseUnits: units(limits.maxBidBaseUnits),
    bidPercent: int(limits.bidPercent, 1, 100), maxConcurrentJobs: int(limits.maxConcurrentJobs, 1, 10),
    maxJobsPerDay: int(limits.maxJobsPerDay, 1, 200), maxTokensPerJob: int(limits.maxTokensPerJob, 256, 32000),
    toolBudgetUsdTdn: typeof limits.toolBudgetUsdTdn === "string" && /^(0|[1-9][0-9]{0,14})(\.[0-9]{1,3})?$/.test(limits.toolBudgetUsdTdn) ? limits.toolBudgetUsdTdn : undefined,
    autonomyEnabled: typeof autopilot.enabled === "boolean" ? autopilot.enabled : undefined,
    autoSubmit: typeof autopilot.autoSubmit === "boolean" ? autopilot.autoSubmit : undefined,
    memoryEnabled: typeof input.memory === "boolean" ? input.memory : undefined,
    webSearchEnabled: typeof input.webSearch === "boolean" ? input.webSearch : undefined,
  };
  for (const key of Object.keys(draft) as Array<keyof AgentDraft>) if (draft[key] === undefined) delete draft[key];
  const known = new Set(["name", "description", "skills", "categories", "capabilities", "runtime", "model", "instructions", "webhookUrl", "limits", "autopilot", "memory", "webSearch", "$schema", "version"]);
  const ignored = Object.keys(input).filter((key) => !known.has(key));
  if (!Object.keys(draft).length) throw new Error("No agent settings found in that file.");
  return { draft, ignored };
}

export function toManifest(draft: AgentDraft) {
  return {
    version: 1, name: draft.name, description: draft.description, skills: draft.skills, categories: draft.categories, capabilities: draft.capabilities,
    runtime: draft.runtime, model: draft.model, instructions: draft.instructions, memory: draft.memoryEnabled, webSearch: draft.webSearchEnabled, ...(draft.runtime === "webhook" ? { webhookUrl: draft.webhookUrl } : {}),
    limits: { minRewardBaseUnits: draft.minRewardBaseUnits, bidPercent: draft.bidPercent, ...(draft.maxBidBaseUnits ? { maxBidBaseUnits: draft.maxBidBaseUnits } : {}), maxConcurrentJobs: draft.maxConcurrentJobs, maxJobsPerDay: draft.maxJobsPerDay, maxTokensPerJob: draft.maxTokensPerJob, toolBudgetUsdTdn: draft.toolBudgetUsdTdn },
    autopilot: { enabled: draft.autonomyEnabled, autoSubmit: draft.autoSubmit },
  };
}

/** Body for POST/PATCH /api/agents. */
export function toApiBody(draft: AgentDraft) {
  return {
    name: draft.name.trim(), description: draft.description.trim(), skills: draft.skills, categories: draft.categories, capabilities: draft.capabilities,
    minRewardBaseUnits: draft.minRewardBaseUnits || "0", available: draft.available,
    ...(draft.payoutWallet.trim() ? { payoutWallet: draft.payoutWallet.trim() } : {}),
    autonomyEnabled: draft.autonomyEnabled, runtime: draft.runtime, model: draft.model, instructions: draft.instructions,
    webhookUrl: draft.runtime === "webhook" ? draft.webhookUrl.trim() : null,
    maxConcurrentJobs: draft.maxConcurrentJobs, maxJobsPerDay: draft.maxJobsPerDay, bidPercent: draft.bidPercent,
    maxBidBaseUnits: draft.maxBidBaseUnits.trim() || null, maxTokensPerJob: draft.maxTokensPerJob,
    toolBudgetUsdTdn: draft.toolBudgetUsdTdn || "0", autoSubmit: draft.autoSubmit,
    memoryEnabled: draft.memoryEnabled, webSearchEnabled: draft.webSearchEnabled,
  };
}

/** Database row (snake_case) to builder draft, for editing an existing agent. */
export function fromRow(row: Record<string, unknown>): AgentDraft {
  const s = (value: unknown, fallback = "") => value === null || value === undefined ? fallback : String(value);
  return {
    ...emptyDraft,
    name: s(row.name), description: s(row.description), skills: (row.skills as string[]) ?? [], categories: (row.categories as string[]) ?? [], capabilities: (row.capabilities as string[]) ?? [],
    runtime: row.runtime === "webhook" ? "webhook" : row.runtime === "local" ? "local" : "hosted", model: s(row.model, "auto"), instructions: s(row.instructions), webhookUrl: s(row.webhook_url),
    minRewardBaseUnits: s(row.min_reward_base_units, "0"), bidPercent: Number(row.bid_percent ?? 90), maxBidBaseUnits: s(row.max_bid_base_units),
    maxConcurrentJobs: Number(row.max_concurrent_jobs ?? 1), maxJobsPerDay: Number(row.max_jobs_per_day ?? 5), maxTokensPerJob: Number(row.max_tokens_per_job ?? 4000),
    toolBudgetUsdTdn: s(row.tool_budget_usd_tdn, "0"), autonomyEnabled: Boolean(row.autonomy_enabled), autoSubmit: row.auto_submit !== false, memoryEnabled: row.memory_enabled !== false, webSearchEnabled: row.web_search_enabled === true, available: row.available !== false,
    payoutWallet: s(row.payout_wallet),
  };
}
