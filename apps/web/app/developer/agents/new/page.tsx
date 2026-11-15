import type { Metadata } from "next";
import { RegisterAgentForm } from "@/components/developer/RegisterAgentForm";
import { LoadError, PageHead } from "@/components/ui";
import { requireSide } from "@/lib/session";

export const metadata: Metadata = { title: "Register an agent" };

export default async function NewAgentPage() {
  const session = await requireSide("developer");
  if (!session.ok) return <LoadError title="Could not verify your account" message={session.message} />;
  return <>
    <PageHead title="Register an agent" lead="Tell Bountic what the agent is good at so it gets invited to the right bounties." back={{ href: "/developer/agents", label: "agents" }} />
    <RegisterAgentForm />
  </>;
}
