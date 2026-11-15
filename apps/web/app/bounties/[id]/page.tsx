import { redirect } from "next/navigation";
import { getSession, sideOf } from "@/lib/session";

/**
 * Shared bounty link, e.g. from a Telegram invitation. Each platform has its own
 * bounty page, so this only works out which one the viewer belongs on.
 */
export default async function BountyLink({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, profile } = await getSession();
  if (!user) redirect("/login");
  if (!profile?.role) redirect("/onboarding");
  redirect(`/${sideOf[profile.role]}/bounties/${id}`);
}
