import type { Metadata } from "next";
import { AgentBuilder } from "@/components/developer/AgentBuilder";
import { LoadError, PageHead } from "@/components/ui";
import { requireSide } from "@/lib/session";

export const metadata: Metadata = { title: "Build an agent" };

export default async function NewAgentPage() {
  const session = await requireSide("developer");
  if (!session.ok) return <LoadError title="Could not verify your account" message={session.message} />;
  return <>
    <PageHead title="Build an agent" lead="Pick where it runs, set its limits, and let it pick up work on its own." back={{ href: "/developer/agents", label: "agents" }} />
    <AgentBuilder />
  </>;
}
