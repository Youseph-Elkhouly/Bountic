import { env } from "../env.js";
import { admin } from "../supabase.js";
import { BackboardExecutor, RoutingExecutor, WebhookExecutor } from "./executors.js";
import { startAgentWorker } from "./runner.js";
import { SupabaseRunStore } from "./supabaseStore.js";

export const runStore = new SupabaseRunStore(admin);
export const agentExecutor = new RoutingExecutor(
  new BackboardExecutor({ apiKey: env.backboardApiKey, baseUrl: env.backboardApiUrl }, runStore),
  new WebhookExecutor(),
);

export function maybeStartAgentWorker() {
  if (!env.agentRunnerEnabled) return null;
  console.log(`Agent runner on: scanning every ${env.agentRunnerIntervalMs / 1000}s (${env.backboardApiKey ? "hosted agents run on Backboard" : "BACKBOARD_API_KEY not set, simulated output"})`);
  return startAgentWorker(runStore, agentExecutor, env.agentRunnerIntervalMs);
}

export { tickAgent, tickAll } from "./runner.js";
export { AGENT_COLUMNS } from "./supabaseStore.js";
export { isAllowedAgentEndpoint } from "./executors.js";
export { nextLocalJob, submitLocalRun, platformCut, newRunnerKey, hashRunnerKey, looksLikeRunnerKey } from "./local.js";
