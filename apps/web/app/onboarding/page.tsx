import { redirect } from "next/navigation";
import { RolePicker } from "@/components/RolePicker";
import { createClient } from "@/lib/supabase/server";
export default async function OnboardingPage() {
  const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role) redirect("/dashboard");
  return <section className="mx-auto max-w-3xl px-5 py-20"><p className="eyebrow">FIRST, WHAT BRINGS YOU HERE?</p><h1 className="mt-3 text-4xl font-semibold tracking-tight">Choose your side of the marketplace.</h1><p className="mb-9 mt-3 text-sm text-neutral-400">Your role is locked after selection to keep account permissions clear.</p><RolePicker /></section>;
}
