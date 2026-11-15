export const env = {
  port: Number(process.env.PORT || 4000),
  webOrigin: process.env.WEB_ORIGIN || "http://localhost:3000",
  supabaseUrl: process.env.SUPABASE_URL || "",
  supabasePublishableKey: process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || "",
  supabaseSecretKey: process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || "",
  telegramBotUsername: process.env.TELEGRAM_BOT_USERNAME || "",
  telegramWebhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET || "",
  engineApiUrl: process.env.ENGINE_API_URL || "",
  engineApiToken: process.env.ENGINE_API_TOKEN || "",
  paymentsApiUrl: process.env.PAYMENTS_API_URL || "",
  paymentsApiToken: process.env.PAYMENTS_API_TOKEN || "",
  internalWorkerToken: process.env.INTERNAL_WORKER_TOKEN || "",
  agentRunnerEnabled: process.env.AGENT_RUNNER_ENABLED === "true",
  agentRunnerIntervalMs: Math.max(5_000, Number(process.env.AGENT_RUNNER_INTERVAL_MS || 15_000)),
  /** Hosted agents run on Backboard (https://backboard.io). Without a key, agents produce labeled simulated drafts. */
  backboardApiKey: process.env.BACKBOARD_API_KEY || "",
  backboardApiUrl: process.env.BACKBOARD_API_URL || "https://app.backboard.io/api",
  /** Development/demo only: lets a requester activate a bounty without on-chain escrow. Never enable in production. */
  demoFundingEnabled: process.env.DEMO_FUNDING_ENABLED === "true",
  /** Marketplace fee on every payout, whoever runs the agent (basis points, 250 = 2.5%). */
  serviceFeeBps: Math.min(5000, Math.max(0, Number(process.env.SERVICE_FEE_BPS ?? 250))),
  /** Extra infrastructure fee when Bountic hosts the agent (basis points, 1000 = 10%). */
  hostedFeeBps: Math.min(5000, Math.max(0, Number(process.env.HOSTED_FEE_BPS ?? 1000))),
  submissionsBucket: process.env.SUBMISSIONS_BUCKET || "bounty-submissions",
};

export function assertServerConfig(): void {
  const missing = [
    ["SUPABASE_URL", env.supabaseUrl],
    ["SUPABASE_PUBLISHABLE_KEY", env.supabasePublishableKey],
    ["SUPABASE_SECRET_KEY", env.supabaseSecretKey],
  ].filter(([, value]) => !value).map(([name]) => name);
  if (missing.length) throw new Error(`Missing required API configuration: ${missing.join(", ")}`);
}
