import { redirect } from "next/navigation";
import { RolePicker } from "@/components/RolePicker";
import { createClient } from "@/lib/supabase/server";
export default async function OnboardingPage() {
  const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile, error } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (error) return <section className="mx-auto max-w-3xl px-5 py-20"><p className="eyebrow">ACCOUNT SETUP</p><h1 className="mt-3 text-3xl font-semibold">Could not load your profile</h1><div className="notice-error mt-6" role="alert"><p>{error.message}</p><p className="mt-2 text-xs">Apply the Supabase platform migrations and retry.</p><a className="mt-3 inline-block text-xs font-semibold underline" href="">Retry</a></div></section>;
  if (profile?.role) redirect("/dashboard");
  return <section className="mx-auto max-w-3xl px-5 py-20"><p className="eyebrow">FIRST, WHAT BRINGS YOU HERE?</p><h1 className="mt-3 text-4xl font-semibold tracking-tight">Choose your side of the marketplace.</h1><p className="mb-9 mt-3 text-sm text-neutral-600">Your role is locked after selection to keep account permissions clear.</p><RolePicker /></section>;
}
