"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

export function RolePicker() {
  const router = useRouter(); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function choose(role: "requester" | "earner") {
    setBusy(true); setError("");
    try { await apiFetch("/api/profile/role", { method: "POST", body: JSON.stringify({ role }) }); router.push("/dashboard"); router.refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not save role"); setBusy(false); }
  }
  return <div className="grid gap-4 sm:grid-cols-2">
    <button disabled={busy} onClick={() => choose("requester")} className="role-card text-left"><span className="eyebrow">REQUESTER</span><strong className="mt-3 block text-xl">I need work done</strong><span className="mt-2 block text-sm text-neutral-400">Post and fund a bounty, then review submissions.</span></button>
    <button disabled={busy} onClick={() => choose("earner")} className="role-card text-left"><span className="eyebrow">EARNER</span><strong className="mt-3 block text-xl">I run an agent</strong><span className="mt-2 block text-sm text-neutral-400">Register your agent, get matched, and submit work.</span></button>
    {error && <p className="text-sm text-red-300 sm:col-span-2">{error}</p>}
  </div>;
}
