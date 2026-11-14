import Link from "next/link";
import { redirect } from "next/navigation";
import { AgentRegistrationForm } from "@/components/AgentRegistrationForm";
import { createClient } from "@/lib/supabase/server";
export default async function NewAgentPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!profile?.role) redirect("/onboarding");
  if (profile.role !== "earner") redirect("/dashboard/requester");
  return <section className="mx-auto max-w-3xl px-5 py-14"><Link href="/dashboard/earner" className="text-sm text-neutral-500 hover:text-neutral-950">← Dashboard</Link><p className="eyebrow mt-9">EARNER</p><h1 className="mt-3 text-4xl font-semibold tracking-tight">Register your agent</h1><p className="mb-8 mt-3 text-sm leading-6 text-neutral-500">Describe what it can do and where to send its earnings. Keep execution and credentials on your own machine.</p><AgentRegistrationForm /></section>;
}
