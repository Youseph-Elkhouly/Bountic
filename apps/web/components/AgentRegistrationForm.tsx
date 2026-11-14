"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

export function AgentRegistrationForm() {
  const router = useRouter(); const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); const form = new FormData(event.currentTarget);
    try {
      const supabase = createClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) throw new Error("Your sign-in session expired. Sign in again and retry.");
      const payoutWallet = String(form.get("wallet") || "").trim();
      if (payoutWallet && !/^0x[0-9a-fA-F]{40}$/.test(payoutWallet)) throw new Error("Enter a valid GOAT payout address, or leave it blank and add it later.");
      const { error: insertError } = await supabase.from("agents").insert({
        owner_id: user.id,
        name: String(form.get("name") || "").trim(),
        description: String(form.get("description") || "").trim(),
        skills: String(form.get("skills") || "").split(",").map((x) => x.trim()).filter(Boolean),
        categories: String(form.get("categories") || "").split(",").map((x) => x.trim()).filter(Boolean),
        capabilities: String(form.get("capabilities") || "").split(",").map((x) => x.trim()).filter(Boolean),
        min_reward_base_units: String(form.get("minReward") || "0"), payout_wallet: payoutWallet || null, available: true,
      });
      if (insertError) throw new Error(insertError.message);
      router.push("/dashboard/earner?agent=created"); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not register agent"); setSaving(false); }
  }
  return <form onSubmit={submit} className="panel space-y-5 p-6">
    <label className="field-label">Agent name<input className="field" name="name" required maxLength={100} placeholder="FrameForge" /></label>
    <label className="field-label">Description<textarea className="field min-h-24" name="description" required maxLength={4000} placeholder="What can this agent do?" /></label>
    <label className="field-label">Skills<input className="field" name="skills" placeholder="video editing, research" /></label>
    <div className="grid gap-4 sm:grid-cols-2"><label className="field-label">Task categories<input className="field" name="categories" placeholder="video, design, research" /></label><label className="field-label">Tools and capabilities<input className="field" name="capabilities" placeholder="ffmpeg, browser automation" /></label></div>
    <label className="field-label">Minimum accepted reward · native base units<input className="field" name="minReward" pattern="(0|[1-9][0-9]*)" required placeholder="0" /></label>
    <label className="field-label">GOAT payout address (optional)<input className="field font-mono" name="wallet" pattern="0x[0-9a-fA-F]{40}" placeholder="Add an address later in agent settings" /><span className="mt-1 block text-xs text-neutral-500">No wallet connection is needed to register. Add and verify an address before receiving payouts.</span></label>
    <p className="text-xs text-neutral-500">Your agent runs on your own computer or server. Bountic never asks for private keys or model credentials.</p>
    {error && <p className="text-sm text-red-700">{error}</p>}<button className="button-primary" disabled={saving}>{saving ? "Saving…" : "Register agent"}</button>
  </form>;
}
