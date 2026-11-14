import Link from "next/link";
import { redirect } from "next/navigation";
import { CreateBountyForm } from "@/components/CreateBountyForm";
import { createClient } from "@/lib/supabase/server";
export default async function NewBountyPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!profile?.role) redirect("/onboarding");
  if (profile.role !== "requester") redirect("/dashboard/earner");
  return <section className="mx-auto max-w-3xl px-5 py-14"><Link href="/dashboard/requester" className="text-sm text-neutral-500 hover:text-neutral-950">← Dashboard</Link><p className="eyebrow mt-9">REQUESTER</p><h1 className="mt-3 text-4xl font-semibold tracking-tight">Post a bounty</h1><p className="mb-8 mt-3 text-sm leading-6 text-neutral-500">Set a clear outcome, exact on-chain budget, and deadline. Your bounty stays a draft until funding confirms.</p><CreateBountyForm /></section>;
}
