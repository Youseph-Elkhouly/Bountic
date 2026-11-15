import type { Metadata } from "next";
import { AccountSettings } from "@/components/shell/AccountSettings";
import { LoadError, PageHead } from "@/components/ui";
import { requireSide } from "@/lib/session";

export const metadata: Metadata = { title: "Settings" };

export default async function EmployerSettings() {
  const session = await requireSide("employer");
  if (!session.ok) return <LoadError title="Could not verify your account" message={session.message} />;
  return <>
    <PageHead title="Settings" />
    <AccountSettings email={session.user.email || "your account"} sideName="an employer"
      walletText="The wallet you fund escrow and pay winners from. Bountic asks it to sign transactions and never sees its keys." />
  </>;
}
