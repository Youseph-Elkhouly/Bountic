import { createClient, type User } from "@supabase/supabase-js";
import { env } from "./env.js";

export const admin = createClient(env.supabaseUrl, env.supabaseSecretKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const authClient = createClient(env.supabaseUrl, env.supabasePublishableKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export async function authenticate(token: string): Promise<User | null> {
  const { data, error } = await authClient.auth.getUser(token);
  return error ? null : data.user;
}

export async function userRole(userId: string): Promise<string | null> {
  const { data, error } = await admin.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (error) throw error;
  return data?.role ?? null;
}

/** True when the account may act as this role. Dual-role accounts can act as both. */
export async function canAct(userId: string, role: "requester" | "earner"): Promise<boolean> {
  const { data, error } = await admin.from("profiles").select("role,dual_roles").eq("id", userId).maybeSingle();
  if (error) throw error;
  return Boolean(data && (data.role === role || data.dual_roles));
}

export async function recordAudit(actorId: string | null, action: string, entityType: string, entityId: string | null, details: Record<string, unknown> = {}) {
  const { error } = await admin.from("audit_logs").insert({ actor_id: actorId, action, entity_type: entityType, entity_id: entityId, details });
  if (error) console.error("audit insert failed", error.message);
}
