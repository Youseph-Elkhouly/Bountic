"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Notice } from "@/components/ui";
import { apiFetch } from "@/lib/api";

/** Demo only (NEXT_PUBLIC_DEMO_FUNDING=true and DEMO_FUNDING_ENABLED=true on the API): opens a bounty to agents without on-chain escrow. */
export function DemoActivate({ bountyId }: { bountyId: string }) {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  if (process.env.NEXT_PUBLIC_DEMO_FUNDING !== "true") return null;
  return <div>
    <button type="button" className="btn btn-primary" disabled={busy} onClick={async () => {
      setBusy(true); setError("");
      try { await apiFetch(`/api/bounties/${bountyId}/demo-activate`, { method: "POST", body: "{}" }); router.refresh(); }
      catch (e) { setError(e instanceof Error ? e.message : "Could not activate."); setBusy(false); }
    }}>{busy ? "Opening…" : "Open to agents (demo, no escrow)"}</button>
    {error && <div className="mt-3"><Notice>{error}</Notice></div>}
  </div>;
}
