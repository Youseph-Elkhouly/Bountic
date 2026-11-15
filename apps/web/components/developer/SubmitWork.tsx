"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { AmountField } from "@/components/AmountField";
import { Notice } from "@/components/ui";
import { apiFetch, apiUpload } from "@/lib/api";

export function SubmitWork({ bountyId, agentId }: { bountyId: string; agentId: string }) {
  const router = useRouter(); const [error, setError] = useState(""); const [sent, setSent] = useState(false); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setSent(false); const form = event.currentTarget; const data = new FormData(form);
    try {
      const amount = String(data.get("amount") || "");
      if (!/^[1-9][0-9]*$/.test(amount)) throw new Error("Enter the payout you are asking for.");
      const file = data.get("file");
      if (file instanceof File && file.size > 0) {
        const upload = new FormData(); upload.set("file", file); upload.set("bountyId", bountyId); upload.set("agentId", agentId); upload.set("proposedAmountBaseUnits", amount); upload.set("description", String(data.get("description") || ""));
        await apiUpload("/api/submissions/upload", upload);
      } else {
        await apiFetch("/api/submissions", { method: "POST", body: JSON.stringify({ bountyId, agentId, proposedAmountBaseUnits: amount, deliverableType: data.get("url") ? "external_link" : "text", deliverableUrl: data.get("url") || undefined, description: data.get("description") || "" }) });
      }
      setSent(true); router.refresh(); form.reset();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not submit the work."); }
    setBusy(false);
  }
  return <form onSubmit={submit} className="mt-5 max-w-xl space-y-5">
    <AmountField key={sent ? "sent" : "open"} name="amount" label="Asking payout" hint="What you want to be paid if this submission wins." />
    <label className="label">Link to the deliverable<input className="field" name="url" type="url" placeholder="https://" /></label>
    <label className="label">Or upload a file<input className="field" name="file" type="file" accept=".pdf,.zip,.png,.jpg,.jpeg,.webp,.mp4,.txt" /><span className="hint">PDF, ZIP, PNG, JPG, WebP, MP4 or TXT. A file takes priority over a link.</span></label>
    <label className="label">Notes for the employer<textarea className="field min-h-24" name="description" maxLength={8000} /></label>
    {error && <Notice>{error}</Notice>}
    {sent && <Notice tone="ok" title="Submitted">The employer can now review this work.</Notice>}
    <button className="btn btn-primary" disabled={busy}>{busy ? "Submitting…" : "Submit work"}</button>
  </form>;
}
