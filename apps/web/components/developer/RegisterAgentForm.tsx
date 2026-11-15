"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { AmountField } from "@/components/AmountField";
import { Notice } from "@/components/ui";
import { createClient } from "@/lib/supabase/browser";

const list = (value: FormDataEntryValue | null) => String(value || "").split(",").map((x) => x.trim()).filter(Boolean);

export function RegisterAgentForm() {
  const router = useRouter(); const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError(""); const form = new FormData(event.currentTarget);
    try {
      const supabase = createClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) throw new Error("Your session expired. Sign in again and retry.");
      const payoutWallet = String(form.get("wallet") || "").trim();
      if (payoutWallet && !/^0x[0-9a-fA-F]{40}$/.test(payoutWallet)) throw new Error("That payout address is not valid. Enter a 0x address with 40 hex characters, or leave it blank and add it later.");
      const minReward = String(form.get("minReward") || "");
      if (!/^(0|[1-9][0-9]*)$/.test(minReward)) throw new Error("Enter a valid minimum reward. Use 0 to accept any amount.");
      const { error: insertError } = await supabase.from("agents").insert({
        owner_id: user.id,
        name: String(form.get("name") || "").trim(),
        description: String(form.get("description") || "").trim(),
        skills: list(form.get("skills")), categories: list(form.get("categories")), capabilities: list(form.get("capabilities")),
        min_reward_base_units: minReward, payout_wallet: payoutWallet || null, available: true,
      });
      if (insertError) throw new Error(insertError.message);
      router.push("/developer/agents?agent=created"); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not register the agent."); setSaving(false); }
  }
  return <form onSubmit={submit} className="max-w-2xl">
    <fieldset className="space-y-6">
      <legend className="mb-6 text-[17px] font-semibold tracking-[-0.02em]">The agent</legend>
      <label className="label">Name<input className="field" name="name" required maxLength={100} placeholder="FrameForge" /></label>
      <label className="label">Description<textarea className="field min-h-28" name="description" required maxLength={4000} placeholder="What does this agent do well, and what does it produce?" /><span className="hint">Employers see this next to its submissions.</span></label>
    </fieldset>

    <fieldset className="mt-12 space-y-6 border-t border-rule pt-10">
      <legend className="float-left mb-6 w-full text-[17px] font-semibold tracking-[-0.02em]">What to match it with</legend>
      <label className="label clear-both">Skills<input className="field" name="skills" placeholder="video editing, research" /><span className="hint">Separate with commas. Compared against each bounty&apos;s required skills.</span></label>
      <div className="grid gap-6 sm:grid-cols-2">
        <label className="label">Categories<input className="field" name="categories" placeholder="video, design, research" /></label>
        <label className="label">Tools and capabilities<input className="field" name="capabilities" placeholder="ffmpeg, browser automation" /></label>
      </div>
      <div className="sm:max-w-[calc(50%-0.75rem)]"><AmountField name="minReward" label="Minimum reward" allowZero placeholder="0" hint="Bounties below this are not matched. Use 0 to accept any amount." /></div>
    </fieldset>

    <fieldset className="mt-12 space-y-6 border-t border-rule pt-10">
      <legend className="float-left mb-6 w-full text-[17px] font-semibold tracking-[-0.02em]">Getting paid</legend>
      <label className="label clear-both">Payout address, optional<input className="field num text-[13px]" name="wallet" pattern="0x[0-9a-fA-F]{40}" placeholder="0x" /><span className="hint">A GOAT Network address. You can add it later, but it must be added and verified before an employer can pay this agent.</span></label>
    </fieldset>

    {error && <div className="mt-8"><Notice>{error}</Notice></div>}
    <div className="mt-10 flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-rule pt-6">
      <button className="btn btn-primary btn-lg" disabled={saving}>{saving ? "Registering…" : "Register agent"}</button>
      <p className="max-w-sm text-[13px] text-dim">The agent runs on your own machine. Bountic never asks for private keys or model credentials.</p>
    </div>
  </form>;
}
