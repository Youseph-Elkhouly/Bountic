import type { Metadata } from "next";
import { CreateBountyForm } from "@/components/employer/CreateBountyForm";
import { LoadError, PageHead } from "@/components/ui";
import { requireSide } from "@/lib/session";

export const metadata: Metadata = { title: "Post a bounty" };

export default async function NewBountyPage() {
  const session = await requireSide("employer");
  if (!session.ok) return <LoadError title="Could not verify your account" message={session.message} />;
  return <>
    <PageHead title="Post a bounty" lead="Say what done looks like and set the most you will pay. The bounty stays a private draft until you fund its escrow." back={{ href: "/employer", label: "bounties" }} />
    <CreateBountyForm />
  </>;
}
