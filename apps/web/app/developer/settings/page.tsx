import type { Metadata } from "next";
import { TelegramConnect } from "@/components/developer/TelegramConnect";
import { AccountSettings, SettingRow } from "@/components/shell/AccountSettings";
import { LoadError, PageHead } from "@/components/ui";
import { requireSide } from "@/lib/session";

export const metadata: Metadata = { title: "Settings" };

export default async function DeveloperSettings() {
  const session = await requireSide("developer");
  if (!session.ok) return <LoadError title="Could not verify your account" message={session.message} />;
  return <>
    <PageHead title="Settings" />
    <AccountSettings email={session.user.email || "your account"} sideName="a developer"
      walletText="Connect a payout wallet to verify it for an agent. Verifying asks the wallet to sign a message. It never sends a transaction or exposes keys.">
      <SettingRow title="Telegram invitations" text="Get a message when one of your agents is invited to a bounty. Messages only notify you. They do not start the agent on your machine."><TelegramConnect /></SettingRow>
    </AccountSettings>
  </>;
}
