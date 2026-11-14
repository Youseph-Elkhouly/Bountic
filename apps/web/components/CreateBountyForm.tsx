"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

export function CreateBountyForm() {
  const router = useRouter(); const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      const supabase = createClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) throw new Error("Your sign-in session expired. Sign in again and retry.");
      const fiatAmount = String(form.get("cadBudget") || "").trim();
      const deadline = new Date(String(form.get("deadline")));
      if (!Number.isFinite(deadline.getTime()) || deadline <= new Date()) throw new Error("Choose a deadline in the future.");
      const { data, error: insertError } = await supabase.from("bounties").insert({
        requester_id: user.id,
        title: String(form.get("title") || "").trim(),
        description: String(form.get("description") || "").trim(),
        category: String(form.get("category") || "").trim(),
        required_skills: String(form.get("skills") || "").split(",").map((x) => x.trim()).filter(Boolean),
        deliverable_requirements: String(form.get("deliverables") || "").trim(),
        max_budget_base_units: String(form.get("budget") || ""),
        display_fiat_amount: fiatAmount,
        display_fiat_currency: "CAD",
        deadline: deadline.toISOString(),
      }).select("id").single();
      if (insertError) throw new Error(insertError.message);
      router.push(`/dashboard/requester?created=${data.id}`); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not create bounty"); setSaving(false); }
  }
  return <form onSubmit={submit} className="panel space-y-5 p-6">
    <label className="field-label">Title<input className="field" name="title" required minLength={5} maxLength={160} placeholder="Create a promotional video" /></label>
    <label className="field-label">Description<textarea className="field min-h-28" name="description" required minLength={20} maxLength={12000} placeholder="Describe the outcome and context…" /></label>
    <div className="grid gap-4 sm:grid-cols-2"><label className="field-label">Category<input className="field" name="category" required maxLength={80} placeholder="Video production" /></label><label className="field-label">Required skills<input className="field" name="skills" placeholder="video editing, subtitles" /><span className="mt-1 block text-[11px] text-neutral-600">Separate skills with commas.</span></label></div>
    <label className="field-label">Deliverable requirements<textarea className="field min-h-20" name="deliverables" maxLength={8000} placeholder="30-second video, subtitles, professional editing." /></label>
    <div className="grid gap-4 sm:grid-cols-2"><label className="field-label">Maximum budget · CAD<input className="field" name="cadBudget" inputMode="decimal" pattern="[0-9]+(\.[0-9]{1,2})?" required placeholder="200.00" /><span className="mt-1 block text-[11px] text-neutral-600">Shown as your requested cash budget to earners.</span></label><label className="field-label">Deadline<input className="field" type="datetime-local" name="deadline" required /></label></div>
    <label className="field-label">Exact escrow amount · GOAT base units<input className="field" name="budget" inputMode="numeric" pattern="[1-9][0-9]*" required placeholder="100000000000000" /><span className="mt-1 block text-[11px] text-neutral-600">The CAD budget is not automatically converted. Enter the exact amount to lock on GOAT Testnet3.</span></label>
    {error && <p className="text-sm text-red-700">{error}</p>}
    <div className="flex items-center justify-between border-t border-neutral-200 pt-4"><span className="text-xs text-neutral-500">Saved as a draft until escrow is confirmed.</span><button className="button-primary" disabled={saving}>{saving ? "Saving…" : "Create draft"}</button></div>
  </form>;
}
