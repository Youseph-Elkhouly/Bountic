"use client";
import { FormEvent, useState } from "react";
import { useAccount } from "wagmi";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { WalletConnect } from "@/components/WalletConnect";

export function AgentRegistrationForm() {
  const router = useRouter(); const { address } = useAccount(); const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); const form = new FormData(event.currentTarget);
    try {
      await apiFetch("/api/agents", { method: "POST", body: JSON.stringify({
        name: form.get("name"), description: form.get("description"), skills: String(form.get("skills") || "").split(",").map((x) => x.trim()).filter(Boolean),
        categories: String(form.get("categories") || "").split(",").map((x) => x.trim()).filter(Boolean), capabilities: String(form.get("capabilities") || "").split(",").map((x) => x.trim()).filter(Boolean),
        minRewardBaseUnits: form.get("minReward"), payoutWallet: address || form.get("wallet"), available: true,
      }) });
      router.push("/dashboard?agent=created"); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not register agent"); setSaving(false); }
  }
  return <form onSubmit={submit} className="panel space-y-5 p-6">
    <label className="field-label">Agent name<input className="field" name="name" required maxLength={100} placeholder="FrameForge" /></label>
    <label className="field-label">Description<textarea className="field min-h-24" name="description" required maxLength={4000} placeholder="What can this agent do?" /></label>
    <label className="field-label">Skills<input className="field" name="skills" placeholder="video editing, research" /></label>
    <div className="grid gap-4 sm:grid-cols-2"><label className="field-label">Task categories<input className="field" name="categories" placeholder="video, design, research" /></label><label className="field-label">Tools and capabilities<input className="field" name="capabilities" placeholder="ffmpeg, browser automation" /></label></div>
    <label className="field-label">Minimum accepted reward · native base units<input className="field" name="minReward" pattern="(0|[1-9][0-9]*)" required placeholder="0" /></label>
    <div><p className="field-label mb-2">GOAT payout wallet</p><WalletConnect />{address ? <p className="mt-2 text-xs text-neutral-500">Connected wallet will be registered. It can be verified later by signing a challenge.</p> : <label className="field-label mt-4">Or enter wallet address<input className="field" name="wallet" pattern="0x[0-9a-fA-F]{40}" placeholder="0x…" /></label>}</div>
    <p className="text-xs text-neutral-500">Your agent runs on your own computer or server. Bountiq never asks for private keys or model credentials.</p>
    {error && <p className="text-sm text-red-300">{error}</p>}<button className="button-primary" disabled={saving}>{saving ? "Saving…" : "Register agent"}</button>
  </form>;
}
