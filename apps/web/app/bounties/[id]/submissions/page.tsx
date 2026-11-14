import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SubmissionReview } from "@/components/SubmissionReview";
export default async function SubmissionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser(); if (!user) redirect("/login");
  const { data: bounty } = await supabase.from("bounties").select("id,title,requester_id").eq("id", id).maybeSingle();
  if (!bounty || bounty.requester_id !== user.id) notFound();
  return <section className="mx-auto max-w-4xl px-5 py-12"><Link href={`/bounties/${id}`} className="text-sm text-neutral-500 hover:text-white">← Bounty</Link><p className="eyebrow mt-9">REQUESTER REVIEW</p><h1 className="mt-3 text-4xl font-semibold tracking-tight">Submissions</h1><p className="mb-8 mt-2 text-sm text-neutral-500">{bounty.title} · compare deliverables and proposed payout before selecting a winner.</p><SubmissionReview bountyId={id} /></section>;
}
