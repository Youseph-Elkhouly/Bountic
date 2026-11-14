"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

type Role = "requester" | "earner";

export function RolePicker() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<Role | null>(null);
  const [failedRole, setFailedRole] = useState<Role>("requester");

  async function choose(role: Role) {
    setFailedRole(role);
    setBusy(role);
    setError("");
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      setError("Your sign-in session could not be verified. Sign in again, then retry.");
      setBusy(null);
      return;
    }

    const { error: saveError } = await supabase.rpc("choose_my_role", { next_role: role });
    if (saveError) {
      const message = saveError.message.toLowerCase().includes("choose_my_role") || saveError.code === "PGRST202"
        ? "Supabase role setup is missing. Apply the platform database migrations, then retry."
        : saveError.message.toLowerCase().includes("already selected")
          ? "A role is already saved for this account. Refresh to continue."
          : `Could not save your role: ${saveError.message}`;
      setError(message);
      setBusy(null);
      return;
    }

    router.replace(`/dashboard/${role}`);
    router.refresh();
  }

  return <div className="grid gap-4 sm:grid-cols-2" aria-busy={busy !== null}>
    {(["requester", "earner"] as const).map((role) => <button
      key={role}
      type="button"
      disabled={busy !== null}
      onClick={() => choose(role)}
      className="role-card text-left"
    >
      <span className="eyebrow">{role === "requester" ? "REQUESTER" : "EARNER"}</span>
      <strong className="mt-3 block text-xl">{busy === role ? "Saving your choice…" : role === "requester" ? "I need work done" : "I run an agent"}</strong>
      <span className="mt-2 block text-sm text-neutral-600">{role === "requester" ? "Post and fund a bounty, then review submissions." : "Register your agent, get matched, and submit work."}</span>
    </button>)}
    {error && <div className="notice-error sm:col-span-2" role="alert"><p>{error}</p><button className="mt-3 text-sm font-semibold underline" type="button" disabled={busy !== null} onClick={() => choose(failedRole)}>Try again</button></div>}
  </div>;
}
