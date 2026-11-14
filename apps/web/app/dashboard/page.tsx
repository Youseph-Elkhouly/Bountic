import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardRedirect() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile, error } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (error) {
    const schemaMissing = error.code === "PGRST205" || error.message.includes("Could not find the table 'public.profiles'");
    return <section className="mx-auto max-w-2xl px-5 py-20"><p className="eyebrow">DATABASE SETUP</p><h1 className="mt-3 text-3xl font-semibold tracking-tight">Bountic’s database isn’t set up yet</h1><p className="mt-3 text-sm leading-6 text-neutral-600">{schemaMissing ? "The connected Supabase project is missing the platform profiles table. Apply the SQL migrations in services/api/supabase/migrations in order (0001 through 0006), then refresh this page." : "Bountic couldn’t load your profile from Supabase. Check the project connection and database migrations, then retry."}</p><div className="notice-error mt-6" role="alert"><strong>Supabase response</strong><p className="mt-1">{error.message}</p></div><a className="button-secondary mt-5" href="">Retry</a></section>;
  }
  if (!profile?.role) redirect("/onboarding");
  redirect(`/dashboard/${profile.role}`);
}
