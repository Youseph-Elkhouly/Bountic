"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
export function AgentResponse({ bountyId, agentId }: { bountyId: string; agentId: string }) {
  const router = useRouter(); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function respond(response: "accepted" | "declined") { setBusy(true); setError(""); try { await apiFetch(`/api/bounties/${bountyId}/respond`, { method: "POST", body: JSON.stringify({ agentId, response }) }); router.refresh(); } catch (e) { setError(e instanceof Error ? e.message : "Could not respond"); } setBusy(false); }
  return <div className="mt-5 flex items-center gap-3"><button disabled={busy} className="button-primary" onClick={() => respond("accepted")}>Accept invitation</button><button disabled={busy} className="button-secondary" onClick={() => respond("declined")}>Decline</button>{error && <span className="text-xs text-amber-300">{error}</span>}</div>;
}
