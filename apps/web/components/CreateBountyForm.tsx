"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

export function CreateBountyForm() {
  const router = useRouter(); const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      const result = await apiFetch<{ bounty: { id: string } }>("/api/bounties", { method: "POST", body: JSON.stringify({
        title: form.get("title"), description: form.get("description"), category: form.get("category"),
        requiredSkills: String(form.get("skills") || "").split(",").map((x) => x.trim()).filter(Boolean),
        deliverableRequirements: form.get("deliverables"), maxBudgetBaseUnits: form.get("budget"),
        displayFiatAmount: form.get("fiatAmount") || undefined,
        displayFiatCurrency: form.get("fiatCurrency") || undefined,
        deadline: new Date(String(form.get("deadline"))).toISOString(),
      }) });
      router.push(`/dashboard?created=${result.bounty.id}`); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not create bounty"); setSaving(false); }
  }
  return <form onSubmit={submit} className="panel space-y-5 p-6">
    <label className="field-label">Title<input className="field" name="title" required minLength={5} maxLength={160} placeholder="Create a promotional video" /></label>
    <label className="field-label">Description<textarea className="field min-h-28" name="description" required minLength={20} maxLength={12000} placeholder="Describe the outcome and context…" /></label>
    <div className="grid gap-4 sm:grid-cols-2"><label className="field-label">Category<input className="field" name="category" required maxLength={80} placeholder="Video production" /></label><label className="field-label">Required skills<input className="field" name="skills" placeholder="video editing, subtitles" /><span className="mt-1 block text-[11px] text-neutral-600">Separate skills with commas.</span></label></div>
    <label className="field-label">Deliverable requirements<textarea className="field min-h-20" name="deliverables" maxLength={8000} placeholder="30-second video, subtitles, professional editing." /></label>
    <div className="grid gap-4 sm:grid-cols-2"><label className="field-label">Maximum budget · native base units<input className="field" name="budget" inputMode="numeric" pattern="[1-9][0-9]*" required placeholder="100000000000000" /><span className="mt-1 block text-[11px] text-neutral-600">Exact GOAT Testnet3 BTC base units. No fiat conversion is applied.</span></label><label className="field-label">Deadline<input className="field" type="datetime-local" name="deadline" required /></label></div>
    <div className="grid gap-4 sm:grid-cols-2"><label className="field-label">Optional fiat estimate<input className="field" name="fiatAmount" inputMode="decimal" placeholder="200.00" /></label><label className="field-label">Estimate currency<input className="field" name="fiatCurrency" maxLength={3} pattern="[A-Z]{3}" placeholder="USD" /></label></div>
    {error && <p className="text-sm text-red-300">{error}</p>}
    <div className="flex items-center justify-between border-t border-neutral-800 pt-4"><span className="text-xs text-neutral-500">Saved as a draft until escrow is confirmed.</span><button className="button-primary" disabled={saving}>{saving ? "Saving…" : "Create draft"}</button></div>
  </form>;
}
