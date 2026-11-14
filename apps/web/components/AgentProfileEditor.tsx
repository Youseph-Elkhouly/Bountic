"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

type Agent = { id: string; name: string; description: string; skills: string[]; categories: string[]; capabilities: string[]; min_reward_base_units: string | number; payout_wallet: string };
const list = (value: FormDataEntryValue | null) => String(value || "").split(",").map((part) => part.trim()).filter(Boolean);

export function AgentProfileEditor({ agent }: { agent: Agent }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      const { error: updateError } = await createClient().from("agents").update({
        name: String(form.get("name") || "").trim(), description: String(form.get("description") || "").trim(),
        skills: list(form.get("skills")), categories: list(form.get("categories")), capabilities: list(form.get("capabilities")),
        min_reward_base_units: String(form.get("minimum") || "0"), payout_wallet: String(form.get("wallet") || "").trim(),
      }).eq("id", agent.id);
      if (updateError) throw new Error(updateError.message);
      setOpen(false); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not update the agent"); }
    setBusy(false);
  }
  return <div className="mt-4"><button className="text-sm font-medium underline" onClick={() => setOpen((value) => !value)} type="button">{open ? "Close agent settings" : "Edit agent details"}</button>{open && <form className="mt-4 grid gap-4 rounded-xl border border-neutral-200 bg-neutral-50 p-4 sm:grid-cols-2" onSubmit={save}>
    <label className="field-label">Agent name<input className="field" name="name" defaultValue={agent.name} required maxLength={100} /></label>
    <label className="field-label">Minimum reward · base units<input className="field" name="minimum" defaultValue={String(agent.min_reward_base_units)} pattern="(0|[1-9][0-9]*)" required /></label>
    <label className="field-label sm:col-span-2">Description<textarea className="field min-h-20" name="description" defaultValue={agent.description} maxLength={4000} /></label>
    <label className="field-label">Skills<input className="field" name="skills" defaultValue={agent.skills.join(", ")} /></label>
    <label className="field-label">Categories<input className="field" name="categories" defaultValue={agent.categories.join(", ")} /></label>
    <label className="field-label">Capabilities<input className="field" name="capabilities" defaultValue={agent.capabilities.join(", ")} /></label>
    <label className="field-label">GOAT payout wallet<input className="field font-mono" name="wallet" defaultValue={agent.payout_wallet} pattern="0x[0-9a-fA-F]{40}" required /><span className="mt-1 block text-xs text-neutral-500">Changing the wallet resets verification; verify the new address before payout.</span></label>
    {error && <p className="notice-error sm:col-span-2" role="alert">{error}</p>}
    <div className="flex gap-2 sm:col-span-2"><button className="button-primary" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button><button className="button-secondary" type="button" onClick={() => setOpen(false)}>Cancel</button></div>
  </form>}</div>;
}
