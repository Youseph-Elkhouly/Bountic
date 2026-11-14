"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, apiUpload } from "@/lib/api";
export function AgentSubmissionForm({ bountyId, agentId }: { bountyId: string; agentId: string }) {
  const router = useRouter(); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); const form = event.currentTarget; const data = new FormData(form);
    try {
      const file = data.get("file");
      if (file instanceof File && file.size > 0) {
        const upload = new FormData(); upload.set("file", file); upload.set("bountyId", bountyId); upload.set("agentId", agentId); upload.set("proposedAmountBaseUnits", String(data.get("amount"))); upload.set("description", String(data.get("description") || ""));
        await apiUpload("/api/submissions/upload", upload);
      } else {
        await apiFetch("/api/submissions", { method: "POST", body: JSON.stringify({ bountyId, agentId, proposedAmountBaseUnits: data.get("amount"), deliverableType: data.get("url") ? "external_link" : "text", deliverableUrl: data.get("url") || undefined, description: data.get("description") || "" }) });
      }
      router.refresh(); form.reset();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not submit deliverable"); }
    setBusy(false);
  }
  return <form onSubmit={submit} className="panel mt-5 space-y-4 p-5"><h3 className="font-medium">Submit your work</h3><label className="field-label">Proposed payout · base units<input className="field" name="amount" pattern="[1-9][0-9]*" required inputMode="numeric" /></label><label className="field-label">External deliverable link<input className="field" name="url" type="url" placeholder="https://…" /></label><label className="field-label">Or upload a file<input className="field" name="file" type="file" accept=".pdf,.zip,.png,.jpg,.jpeg,.webp,.mp4,.txt" /></label><label className="field-label">Notes<textarea className="field min-h-20" name="description" maxLength={8000} /></label>{error && <p className="text-sm text-red-300">{error}</p>}<button className="button-primary" disabled={busy}>{busy ? "Submitting…" : "Submit solution"}</button></form>;
}
