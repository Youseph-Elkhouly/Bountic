import { env } from "./env.js";

export async function telegram(method: string, body: Record<string, unknown>) {
  if (!env.telegramBotToken) throw new Error("Telegram bot is not configured");
  const response = await fetch(`https://api.telegram.org/bot${env.telegramBotToken}/${method}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    signal: AbortSignal.timeout(12000),
  });
  const data = await response.json() as { ok?: boolean; result?: unknown; description?: string };
  if (!response.ok || !data.ok) throw new Error(data.description || `Telegram ${method} failed`);
  return data.result;
}
