"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

export function SignOut({ className = "text-[13px] text-dim hover:text-ink" }: { className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return <button className={className} disabled={busy} onClick={async () => { setBusy(true); await createClient().auth.signOut(); router.push("/"); router.refresh(); }}>{busy ? "Signing out…" : "Sign out"}</button>;
}
