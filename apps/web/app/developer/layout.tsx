import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { getSession } from "@/lib/session";

export const metadata: Metadata = { title: { default: "Developers", template: "%s · Bountic for developers" } };

export default async function DeveloperLayout({ children }: { children: React.ReactNode }) {
  const { user, profile } = await getSession();
  if (!user) redirect("/login");
  return <AppShell side="developer" email={user.email || "Account"} dual={Boolean(profile?.dual_roles)}>{children}</AppShell>;
}
