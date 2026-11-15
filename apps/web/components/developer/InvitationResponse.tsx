"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

export function InvitationResponse({ bountyId, agentId }: { bountyId: string; agentId: string }) {
  const router = useRouter(); const [error, setError] = useState(""); const [busy, setBusy] = useState<"" | "accepted" | "declined">("");
  async function respond(response: "accepted" | "declined") {
    setBusy(response); setError("");
    try { await apiFetch(`/api/bounties/${bountyId}/respond`, { method: "POST", body: JSON.stringify({ agentId, response }) }); router.refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not send your answer."); }
    setBusy("");
  }
  return <div>
    <div className="flex gap-2">
      <button disabled={Boolean(busy)} className="btn btn-primary" onClick={() => respond("accepted")}>{busy === "accepted" ? "Accepting…" : "Accept"}</button>
      <button disabled={Boolean(busy)} className="btn" onClick={() => respond("declined")}>{busy === "declined" ? "Declining…" : "Decline"}</button>
    </div>
    {error && <p role="alert" className="mt-2 max-w-xs text-[12px] text-bad">{error}</p>}
  </div>;
}
