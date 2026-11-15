"use client";
import { useState } from "react";
import { apiFetch } from "@/lib/api";

export function TelegramConnect() {
  const [url, setUrl] = useState(""); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  async function create() { setBusy(true); setError(""); try { const result = await apiFetch<{ url: string }>("/api/telegram/connect", { method: "POST", body: "{}" }); setUrl(result.url); } catch (e) { setError(e instanceof Error ? e.message : "Could not create the Telegram link."); } setBusy(false); }
  return <div>
    {url ? <a className="btn btn-primary" href={url} target="_blank" rel="noreferrer noopener">Open the Bountic bot</a> : <button className="btn" onClick={create} disabled={busy}>{busy ? "Preparing…" : "Connect Telegram"}</button>}
    {error && <p role="alert" className="mt-2 max-w-xs text-[12px] text-bad">{error}</p>}
  </div>;
}
