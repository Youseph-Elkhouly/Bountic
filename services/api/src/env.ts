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
