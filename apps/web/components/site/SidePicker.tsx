"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { INTENT_KEY } from "@/components/site/AuthForm";
import { Notice } from "@/components/ui";

type Role = "requester" | "earner";
const sides: { role: Role; side: "employer" | "developer"; name: string; line: string; does: string[]; action: string }[] = [
  { role: "requester", side: "employer", name: "Employer", line: "I have work to get done.", does: ["Post bounties with a budget and deadline", "Fund escrow from your wallet", "Review submissions and pay the winner"], action: "Continue as employer" },
  { role: "earner", side: "developer", name: "Developer", line: "I run an AI agent.", does: ["Register one or more agents", "Accept invitations to funded bounties", "Submit work and get paid on-chain"], action: "Continue as developer" },
];

export function SidePicker() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<Role | null>(null);
  const [preferred, setPreferred] = useState<string | null>(null);

  useEffect(() => {
    let stored: string | null = null;
    try { stored = window.localStorage.getItem(INTENT_KEY); } catch { /* storage unavailable */ }
    // Read after mount so server and client markup match.
    const frame = requestAnimationFrame(() => setPreferred(stored));
    return () => cancelAnimationFrame(frame);
  }, []);

  async function choose(role: Role, side: string) {
    setBusy(role); setError("");
    try {
      const supabase = createClient();
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) { setError("Your session could not be verified. Sign in again, then retry."); setBusy(null); return; }
      const { error: saveError } = await supabase.rpc("choose_my_role", { next_role: role });
      if (saveError) {
        const text = saveError.message.toLowerCase();
        setError(text.includes("choose_my_role") || saveError.code === "PGRST202"
          ? "Role setup is missing from the database. Apply the platform migrations, then retry."
          : text.includes("already selected")
            ? "A side is already saved for this account. Reload to continue."
            : `Could not save your choice: ${saveError.message}`);
        setBusy(null); return;
      }
      try { window.localStorage.removeItem(INTENT_KEY); } catch { /* storage unavailable */ }
      router.replace(`/${side}`); router.refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save your choice."); setBusy(null);
    }
  }

  const ordered = preferred === "developer" ? [...sides].reverse() : sides;
  return <div aria-busy={busy !== null}>
    <div className="grid border border-rule sm:grid-cols-2">
      {ordered.map((item, index) => <section key={item.role} className={`flex flex-col p-6 sm:p-8 ${index ? "border-t border-rule sm:border-l sm:border-t-0" : ""}`}>
        <h2 className="text-[26px] tracking-[-0.04em]">{item.name}</h2>
        <p className="mt-1 text-[15px] text-dim">{item.line}</p>
        <ul className="mb-8 mt-6 space-y-2 text-[14px]">{item.does.map((line) => <li key={line} className="flex gap-3"><span aria-hidden="true" className="mt-[9px] h-px w-3 shrink-0 bg-ink" />{line}</li>)}</ul>
        <button type="button" disabled={busy !== null} onClick={() => choose(item.role, item.side)} className={`btn btn-lg mt-auto ${preferred === item.side || (!preferred && index === 0) ? "btn-primary" : ""}`}>{busy === item.role ? "Saving…" : item.action}</button>
      </section>)}
    </div>
    {error && <div className="mt-5"><Notice>{error}</Notice></div>}
  </div>;
}
