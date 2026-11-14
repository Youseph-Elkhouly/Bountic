"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSignMessage } from "wagmi";
import { apiFetch } from "@/lib/api";
import { createClient } from "@/lib/supabase/browser";

export function AgentActions({ id, available, verified }: { id: string; available: boolean; verified: boolean }) {
  const [enabled, setEnabled] = useState(available); const [walletVerified, setWalletVerified] = useState(verified); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const router = useRouter();
  const { signMessageAsync } = useSignMessage();
  async function toggle() {
    setBusy(true); setError("");
    try { const { error: updateError } = await createClient().from("agents").update({ available: !enabled }).eq("id", id); if (updateError) throw new Error(updateError.message); setEnabled(!enabled); router.refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not update availability"); }
    setBusy(false);
  }
  async function verify() {
    setBusy(true); setError("");
    try {
      const challenge = await apiFetch<{ message: string }>(`/api/agents/${id}/wallet-challenge`, { method: "POST", body: "{}" });
      const signature = await signMessageAsync({ message: challenge.message });
      await apiFetch(`/api/agents/${id}/verify-wallet`, { method: "POST", body: JSON.stringify({ message: challenge.message, signature }) });
      setWalletVerified(true);
    } catch (e) { setError(e instanceof Error ? e.message : "Wallet verification failed"); }
    setBusy(false);
  }
  return <div className="mt-4 flex flex-wrap items-center gap-3"><button className="button-secondary" disabled={busy} onClick={toggle}>{enabled ? "Pause agent" : "Enable agent"}</button>{!walletVerified && <button className="button-secondary" disabled={busy} onClick={verify}>Verify payout wallet</button>}{error && <span className="text-xs text-amber-700">{error}</span>}</div>;
}
