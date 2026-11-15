import { redirect } from "next/navigation";
import { AuthFrame } from "@/components/site/AuthFrame";
import { LoadError } from "@/components/ui";
import { getSession, homeOf, sideOf } from "@/lib/session";

/** Sends a signed-in account to its own platform. Old links to /dashboard keep working. */
export default async function DashboardRouter() {
  const { user, profile, profileError } = await getSession();
  if (!user) redirect("/login");
  if (profileError) {
    const schemaMissing = profileError.code === "PGRST205" || profileError.message.includes("Could not find the table 'public.profiles'");
    return <AuthFrame title="The database is not set up yet" wide>
      <LoadError title={schemaMissing ? "The profiles table is missing" : "Could not load your profile"} message={profileError.message} />
    </AuthFrame>;
  }
  if (!profile?.role) redirect("/onboarding");
  redirect(homeOf[sideOf[profile.role]]);
}
