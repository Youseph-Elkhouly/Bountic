import { assertServerConfig, env } from "../env.js";
import { runAgentWorker } from "./runner.js";

assertServerConfig();
const controller = new AbortController();
const stop = (signal: NodeJS.Signals) => {
  console.info(`Agent worker stopping after ${signal}`);
  controller.abort();
};
process.once("SIGINT", stop);
process.once("SIGTERM", stop);
console.info(`Bountic text agent worker started; polling every ${env.agentWorkerPollMs}ms`);
await runAgentWorker(controller.signal);
