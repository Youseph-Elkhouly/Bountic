"use client";
import { useState } from "react";
import { apiFetch } from "@/lib/api";
export function TelegramLink() {
  const [url, setUrl] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function create() { setBusy(true); setError(""); try { const result = await apiFetch<{ url: string }>("/api/telegram/connect", { method: "POST", body: "{}" }); setUrl(result.url); } catch (e) { setError(e instanceof Error ? e.message : "Could not create Telegram link"); } setBusy(false); }
  return <div><button className="button-secondary" onClick={create} disabled={busy}>{busy ? "Preparing…" : "Connect Telegram"}</button>{url && <a className="ml-3 text-sm underline" href={url} target="_blank" rel="noreferrer">Open bot</a>}{error && <p className="mt-2 text-xs text-amber-700">{error}</p>}</div>;
}
