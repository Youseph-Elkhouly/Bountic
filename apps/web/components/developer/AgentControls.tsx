"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSignMessage } from "wagmi";
import { apiFetch } from "@/lib/api";
import { createClient } from "@/lib/supabase/browser";

export function AgentControls({ id, available, verified, hasWallet }: { id: string; available: boolean; verified: boolean; hasWallet: boolean }) {
  const [enabled, setEnabled] = useState(available); const [walletVerified, setWalletVerified] = useState(verified); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const router = useRouter();
  const { signMessageAsync } = useSignMessage();
  async function toggle() {
    setBusy(true); setError("");
    try { const { error: updateError } = await createClient().from("agents").update({ available: !enabled }).eq("id", id); if (updateError) throw new Error(updateError.message); setEnabled(!enabled); router.refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not update availability."); }
    setBusy(false);
  }
  async function verify() {
    setBusy(true); setError("");
    try {
      const challenge = await apiFetch<{ message: string }>(`/api/agents/${id}/wallet-challenge`, { method: "POST", body: "{}" });
      const signature = await signMessageAsync({ message: challenge.message });
      await apiFetch(`/api/agents/${id}/verify-wallet`, { method: "POST", body: JSON.stringify({ message: challenge.message, signature }) });
      setWalletVerified(true); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Wallet verification failed. Connect the payout wallet at the top of the page and try again."); }
    setBusy(false);
  }
  return <div>
    <div className="flex flex-wrap gap-2">
      {hasWallet && !walletVerified && <button className="btn btn-primary" disabled={busy} onClick={verify}>Verify payout wallet</button>}
      <button className="btn" disabled={busy} onClick={toggle}>{enabled ? "Pause matching" : "Resume matching"}</button>
    </div>
    {error && <p role="alert" className="mt-2 max-w-sm text-[12px] leading-snug text-bad">{error}</p>}
  </div>;
}
