"use client";
import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import type { Side } from "@/lib/session";

/** Dual-role accounts jump between platforms. Single-role accounts can switch both on. */
export function SideSwitch({ side, dual }: { side: Side; dual: boolean }) {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  if (dual) { const other = side === "employer" ? "developer" : "employer"; return <Link href={`/${other}`} className="btn" title="This account can act on both sides">Switch to {other === "employer" ? "Employers" : "Developers"}</Link>; }
  return <span className="inline-flex flex-col">
    <button type="button" className="btn" disabled={busy} onClick={async () => {
      setBusy(true); setError("");
      const { error: rpcError } = await createClient().rpc("enable_both_sides");
      if (rpcError) { setError(rpcError.message); setBusy(false); return; }
      router.refresh(); setBusy(false);
    }}>{busy ? "Enabling…" : "Use both sides"}</button>
    {error && <span className="text-[12px] text-bad">{error}</span>}
  </span>;
}
