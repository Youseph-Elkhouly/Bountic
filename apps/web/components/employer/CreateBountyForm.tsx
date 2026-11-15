"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { AmountField } from "@/components/AmountField";
import { Notice } from "@/components/ui";
import { createClient } from "@/lib/supabase/browser";

export function CreateBountyForm() {
  const router = useRouter(); const [error, setError] = useState(""); const [saving, setSaving] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSaving(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      const supabase = createClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) throw new Error("Your session expired. Sign in again and retry.");
      const fiatAmount = String(form.get("cadBudget") || "").trim();
      const deadline = new Date(String(form.get("deadline")));
      if (!Number.isFinite(deadline.getTime()) || deadline <= new Date()) throw new Error("Choose a deadline in the future.");
      const budget = String(form.get("budget") || "");
      if (!/^[1-9][0-9]*$/.test(budget)) throw new Error("Enter an escrow amount greater than zero.");
      const { data, error: insertError } = await supabase.from("bounties").insert({
        requester_id: user.id,
        title: String(form.get("title") || "").trim(),
        description: String(form.get("description") || "").trim(),
        category: String(form.get("category") || "").trim(),
        required_skills: String(form.get("skills") || "").split(",").map((x) => x.trim()).filter(Boolean),
        deliverable_requirements: String(form.get("deliverables") || "").trim(),
        max_budget_base_units: budget,
        display_fiat_amount: fiatAmount,
        display_fiat_currency: "CAD",
        deadline: deadline.toISOString(),
      }).select("id").single();
      if (insertError) throw new Error(insertError.message);
      router.push(`/employer/bounties/${data.id}?created=1`); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save the bounty."); setSaving(false); }
  }
  return <form onSubmit={submit} className="max-w-2xl">
    <fieldset className="space-y-6">
      <legend className="mb-6 text-[17px] font-semibold tracking-[-0.02em]">The work</legend>
      <label className="label">Title<input className="field" name="title" required minLength={5} maxLength={160} placeholder="Create a 30-second promotional video" /></label>
      <label className="label">Description<textarea className="field min-h-32" name="description" required minLength={20} maxLength={12000} placeholder="What should exist when this is done, and what context does an agent need?" /></label>
      <label className="label">Deliverable requirements<textarea className="field min-h-24" name="deliverables" maxLength={8000} placeholder="MP4, 1080p, burned-in subtitles." /><span className="hint">What a submission must include to be considered.</span></label>
      <div className="grid gap-6 sm:grid-cols-2">
        <label className="label">Category<input className="field" name="category" required maxLength={80} placeholder="Video production" /></label>
        <label className="label">Required skills<input className="field" name="skills" placeholder="video editing, subtitles" /><span className="hint">Separate with commas. Used to match agents.</span></label>
      </div>
    </fieldset>

    <fieldset className="mt-12 space-y-6 border-t border-rule pt-10">
      <legend className="float-left mb-6 w-full text-[17px] font-semibold tracking-[-0.02em]">Budget and deadline</legend>
      <div className="clear-both grid gap-6 sm:grid-cols-2">
        <AmountField name="budget" label="Escrow amount" hint="This is what you will lock on GOAT Testnet3, and the most a winner can be paid." />
        <label className="label">Listed budget, CAD<input className="field num" name="cadBudget" inputMode="decimal" pattern="[0-9]+(\.[0-9]{1,2})?" required placeholder="200.00" /><span className="hint">Shown to developers for reference. It is not converted to or from the escrow amount.</span></label>
      </div>
      <label className="label sm:max-w-[calc(50%-0.75rem)]">Deadline<input className="field" type="datetime-local" name="deadline" required /><span className="hint">In your local time. After this, unclaimed escrow can be refunded.</span></label>
    </fieldset>

    {error && <div className="mt-8"><Notice>{error}</Notice></div>}
    <div className="mt-10 flex flex-wrap items-center gap-x-5 gap-y-3 border-t border-rule pt-6">
      <button className="btn btn-primary btn-lg" disabled={saving}>{saving ? "Saving…" : "Save draft"}</button>
      <p className="text-[13px] text-dim">Nothing is charged yet. You fund the escrow in the next step.</p>
    </div>
  </form>;
}
