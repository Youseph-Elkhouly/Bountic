import { env } from "./env.js";

async function postIntegration(baseUrl: string, token: string, path: string, body: unknown) {
  if (!baseUrl) throw new Error("Integration is not configured");
  const response = await fetch(new URL(path, baseUrl), {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`Integration returned ${response.status}`);
  return payload;
}

export const payments = {
  prepareCreate: (body: unknown) => postIntegration(env.paymentsApiUrl, env.paymentsApiToken, "/api/payments/prepare-create", body),
  confirmCreate: (body: unknown) => postIntegration(env.paymentsApiUrl, env.paymentsApiToken, "/api/payments/confirm-create", body),
  prepareFund: (body: unknown) => postIntegration(env.paymentsApiUrl, env.paymentsApiToken, "/api/payments/prepare-fund", body),
  confirmFunding: (body: unknown) => postIntegration(env.paymentsApiUrl, env.paymentsApiToken, "/api/payments/confirm", body),
  approveSettlement: (body: unknown) => postIntegration(env.paymentsApiUrl, env.paymentsApiToken, "/api/payments/approve", body),
  prepareSettlementExecution: (body: unknown) => postIntegration(env.paymentsApiUrl, env.paymentsApiToken, "/api/payments/settle", body),
  prepareRefund: (body: unknown) => postIntegration(env.paymentsApiUrl, env.paymentsApiToken, "/api/payments/refund", body),
  confirm: (body: unknown) => postIntegration(env.paymentsApiUrl, env.paymentsApiToken, "/api/payments/confirm", body),
  status: (bountyId: string) => postIntegration(env.paymentsApiUrl, env.paymentsApiToken, "/api/payments/status", { bountyId }),
};

export async function requestMatches(body: unknown): Promise<{ matches: Array<{ agentId: string; score: number; scoreBreakdown?: Record<string, number> }>; source: "engine" | "development" }> {
  if (env.engineApiUrl) {
    const response = await fetch(new URL("/api/matches", env.engineApiUrl), {
      method: "POST", headers: { "content-type": "application/json", ...(env.engineApiToken ? { authorization: `Bearer ${env.engineApiToken}` } : {}) },
      body: JSON.stringify(body), signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) throw new Error(`Engine returned ${response.status}`);
    const data = await response.json() as { matches?: unknown };
    if (!Array.isArray(data.matches)) throw new Error("Engine returned an invalid match response");
    return { matches: data.matches as Array<{ agentId: string; score: number; scoreBreakdown?: Record<string, number> }>, source: "engine" };
  }
  // Development-only deterministic fixture. It does not calculate or rank agents.
  const { admin } = await import("./supabase.js");
  const { data, error } = await admin.from("agents").select("id").eq("available", true).order("created_at", { ascending: true }).limit(3);
  if (error) throw error;
  return { matches: (data ?? []).map((agent, index) => ({ agentId: agent.id, score: [0.75, 0.6, 0.45][index] ?? 0.4 })), source: "development" };
}
