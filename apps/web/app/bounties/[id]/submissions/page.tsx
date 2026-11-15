import { redirect } from "next/navigation";
/** Old address of the submission review page. Only employers review submissions. */
export default async function LegacySubmissions({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/employer/bounties/${id}/submissions`);
}
