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
  goatRpcUrl: process.env.GOAT_TESTNET_RPC_URL || "https://rpc.testnet3.goat.network",
  goatChainId: Number(process.env.GOAT_TESTNET_CHAIN_ID || 48816),
  goatExplorerUrl: process.env.GOAT_TESTNET_EXPLORER_URL || "https://explorer.testnet3.goat.network",
  goatEscrowAddress: process.env.BOUNTIQ_ESCROW_ADDRESS || "",
  internalWorkerToken: process.env.INTERNAL_WORKER_TOKEN || "",
  submissionsBucket: process.env.SUBMISSIONS_BUCKET || "bounty-submissions",
  agentWorkerPollMs: Number(process.env.AGENT_WORKER_POLL_MS || 5000),
  agentWorkerMaxConcurrent: Number(process.env.AGENT_WORKER_MAX_CONCURRENT || 2),
  modelProvider: process.env.AGENT_MODEL_PROVIDER || "openai-compatible",
  modelApiUrl: process.env.AGENT_MODEL_API_URL || "",
  modelApiKey: process.env.AGENT_MODEL_API_KEY || "",
  modelName: process.env.AGENT_MODEL_NAME || "",
  modelTimeoutMs: Number(process.env.AGENT_MODEL_TIMEOUT_MS || 90000),
  modelMaxOutputTokens: Number(process.env.AGENT_MODEL_MAX_OUTPUT_TOKENS || 3000),
};

export function assertServerConfig(): void {
  const missing = [
    ["SUPABASE_URL", env.supabaseUrl],
    ["SUPABASE_PUBLISHABLE_KEY", env.supabasePublishableKey],
    ["SUPABASE_SECRET_KEY", env.supabaseSecretKey],
  ].filter(([, value]) => !value).map(([name]) => name);
  if (missing.length) throw new Error(`Missing required API configuration: ${missing.join(", ")}`);
}
