"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { AmountField } from "@/components/AmountField";
import { Notice } from "@/components/ui";
import { createClient } from "@/lib/supabase/browser";

type Agent = { id: string; name: string; description: string; skills: string[]; categories: string[]; capabilities: string[]; min_reward_base_units: string | number; payout_wallet: string | null };
const list = (value: FormDataEntryValue | null) => String(value || "").split(",").map((part) => part.trim()).filter(Boolean);

export function AgentEditor({ agent }: { agent: Agent }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      const minimum = String(form.get("minimum") || "");
      if (!/^(0|[1-9][0-9]*)$/.test(minimum)) throw new Error("Enter a valid minimum reward. Use 0 to accept any amount.");
      const update: Record<string, unknown> = {
        name: String(form.get("name") || "").trim(), description: String(form.get("description") || "").trim(),
        skills: list(form.get("skills")), categories: list(form.get("categories")), capabilities: list(form.get("capabilities")),
        min_reward_base_units: minimum,
      };
      const wallet = String(form.get("wallet") || "").trim();
      if (wallet) update.payout_wallet = wallet;
      const { error: updateError } = await createClient().from("agents").update(update).eq("id", agent.id);
      if (updateError) throw new Error(updateError.message);
      setOpen(false); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save the agent."); }
    setBusy(false);
  }
  if (!open) return <button className="link text-[13px]" onClick={() => setOpen(true)} type="button">Edit details</button>;
  return <form className="mt-2 grid gap-5 border-t border-rule pt-6 sm:grid-cols-2" onSubmit={save}>
    <label className="label">Name<input className="field" name="name" defaultValue={agent.name} required maxLength={100} /></label>
    <AmountField name="minimum" label="Minimum reward" defaultBase={agent.min_reward_base_units} allowZero hint="Bounties below this are not matched." placeholder="0" />
    <label className="label sm:col-span-2">Description<textarea className="field min-h-24" name="description" defaultValue={agent.description} maxLength={4000} /></label>
    <label className="label">Skills<input className="field" name="skills" defaultValue={agent.skills.join(", ")} /></label>
    <label className="label">Categories<input className="field" name="categories" defaultValue={agent.categories.join(", ")} /></label>
    <label className="label">Tools and capabilities<input className="field" name="capabilities" defaultValue={agent.capabilities.join(", ")} /></label>
    <label className="label">Payout address<input className="field num text-[13px]" name="wallet" defaultValue={agent.payout_wallet || ""} pattern="0x[0-9a-fA-F]{40}" placeholder="0x" /><span className="hint">Changing it resets verification. Leave blank to keep the current address.</span></label>
    {error && <div className="sm:col-span-2"><Notice>{error}</Notice></div>}
    <div className="flex gap-2 sm:col-span-2"><button className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button><button className="btn" type="button" onClick={() => setOpen(false)}>Cancel</button></div>
  </form>;
}
