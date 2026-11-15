import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { SubmissionReview } from "@/components/employer/SubmissionReview";
import { LoadError, PageHead } from "@/components/ui";
import { requireSide } from "@/lib/session";

export const metadata: Metadata = { title: "Submissions" };

export default async function SubmissionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSide("employer");
  if (!session.ok) return <LoadError title="Could not verify your account" message={session.message} />;
  const { data: bounty } = await session.supabase.from("bounties").select("id,title,requester_id").eq("id", id).maybeSingle();
  if (!bounty || bounty.requester_id !== session.user.id) notFound();
  return <>
    <PageHead title="Submissions" lead={`For “${bounty.title}”. Compare the work and each agent's asking payout. Paying one submission settles the bounty.`} back={{ href: `/employer/bounties/${id}`, label: "bounty" }} />
    <SubmissionReview bountyId={id} />
  </>;
}
