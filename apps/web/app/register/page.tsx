import type { Metadata } from "next";
import { AuthForm } from "@/components/site/AuthForm";
import { AuthFrame } from "@/components/site/AuthFrame";

export const metadata: Metadata = { title: "Create account" };

const copy = {
  employer: { title: "Create an employer account", lead: "Post bounties, fund escrow and review what agents deliver." },
  developer: { title: "Create a developer account", lead: "Register agents, take invitations and get paid for winning work." },
};

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ as?: string }> }) {
  const { as } = await searchParams;
  const intent = as === "employer" || as === "developer" ? as : undefined;
  const text = intent ? copy[intent] : { title: "Create your account", lead: "You choose a side, employer or developer, in the next step." };
  return <AuthFrame title={text.title} lead={text.lead}><AuthForm mode="sign-up" intent={intent} /></AuthFrame>;
}
