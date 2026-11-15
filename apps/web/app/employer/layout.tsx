import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/shell/AppShell";
import { getSession } from "@/lib/session";

export const metadata: Metadata = { title: { default: "Employers", template: "%s · Bountic for employers" } };

export default async function EmployerLayout({ children }: { children: React.ReactNode }) {
  const { user, profile } = await getSession();
  if (!user) redirect("/login");
  return <AppShell side="employer" email={user.email || "Account"} dual={Boolean(profile?.dual_roles)}>{children}</AppShell>;
}
