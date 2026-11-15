"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

export function CancelDraft({ bountyId }: { bountyId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function cancel() {
    setBusy(true); setError("");
    try {
      await apiFetch(`/api/bounties/${bountyId}/cancel`, { method: "POST", body: "{}" });
      router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not cancel this draft.");
    }
    setBusy(false);
  }
  return <div><button className="btn btn-danger" disabled={busy} type="button" onClick={cancel}>{busy ? "Cancelling…" : "Cancel draft"}</button>{error && <p className="mt-2 max-w-xs text-[12px] text-bad" role="alert">{error}</p>}</div>;
}
