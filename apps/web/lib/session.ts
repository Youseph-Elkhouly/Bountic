import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/** The two platforms, and the role each one maps to in the `profiles` table. */
export type Side = "employer" | "developer";
export type Role = "requester" | "earner";
export const roleOf: Record<Side, Role> = { employer: "requester", developer: "earner" };
export const sideOf: Record<Role, Side> = { requester: "employer", earner: "developer" };
export const homeOf: Record<Side, string> = { employer: "/employer", developer: "/developer" };

export const getSession = cache(async () => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, profile: null, profileError: null };
  const { data: profile, error } = await supabase.from("profiles").select("role,display_name").eq("id", user.id).maybeSingle();
  return { supabase, user, profile: profile as { role: Role | null; display_name: string | null } | null, profileError: error };
});

/**
 * Gate a page to one platform. Signed-out visitors go to /login, accounts without a
 * role go to onboarding, and accounts on the other side are sent to their own platform.
 */
export async function requireSide(side: Side) {
  const { supabase, user, profile, profileError } = await getSession();
  if (!user) redirect("/login");
  if (profileError) return { ok: false as const, message: profileError.message };
  if (!profile?.role) redirect("/onboarding");
  if (profile.role !== roleOf[side]) redirect(homeOf[sideOf[profile.role]]);
  return { ok: true as const, supabase, user, profile };
}
