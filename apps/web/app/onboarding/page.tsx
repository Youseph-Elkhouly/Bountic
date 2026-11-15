import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthFrame } from "@/components/site/AuthFrame";
import { SidePicker } from "@/components/site/SidePicker";
import { LoadError } from "@/components/ui";
import { getSession } from "@/lib/session";

export const metadata: Metadata = { title: "Choose your side" };

export default async function OnboardingPage() {
  const { user, profile, profileError } = await getSession();
  if (!user) redirect("/login");
  if (profileError) return <AuthFrame title="Could not load your profile" wide><LoadError title="Supabase returned an error" message={profileError.message} /></AuthFrame>;
  if (profile?.role) redirect("/dashboard");
  return <AuthFrame title="Which side are you on?" lead="Employers and developers use separate platforms. This choice is permanent for this account, so pick the one you will actually use." wide>
    <SidePicker />
  </AuthFrame>;
}
