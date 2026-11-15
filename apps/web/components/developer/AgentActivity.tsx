"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Empty, Notice } from "@/components/ui";
import { apiFetch } from "@/lib/api";

type AgentState = { id: string; name: string; runtime: string; autonomy_enabled: boolean; available: boolean; max_concurrent_jobs: number; max_jobs_per_day: number; jobsToday: number; openJobs: number; runner_last_seen_at: string | null };
type Run = { id: string; agent_id: string; bounty_id: string; status: string; bid_base_units: string | null; deliverable: string | null; executor: string | null; error: string | null; started_at: string; bounties: { title: string } | null };
type RunEvent = { id: number; agent_id: string; kind: string; message: string; created_at: string };
type Activity = { agents: AgentState[]; runs: Run[]; events: RunEvent[] };

const ago = (iso: string) => { const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000)); return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)}m ago` : `${Math.round(s / 3600)}h ago`; };
const LABEL: Record<string, string> = { claimed: "claimed", working: "working", awaiting_review: "needs your OK", submitted: "submitted", failed: "failed", skipped: "skipped" };
const WHERE: Record<string, string> = { hosted: "Hosted by Bountic", local: "Own machine", webhook: "Own server" };

/** Live view of what the owner's agents are doing. Polls every 3 seconds. */
export function AgentActivity() {
  const [data, setData] = useState<Activity | null>(null); const [error, setError] = useState(""); const [busy, setBusy] = useState(""); const [open, setOpen] = useState(""); const [key, setKey] = useState<{ agent: string; key: string } | null>(null);
  const load = useCallback(async () => { try { setData(await apiFetch<Activity>("/api/agent-activity")); setError(""); } catch (e) { setError(e instanceof Error ? e.message : "Could not load agent activity"); } }, []);
  useEffect(() => { const first = setTimeout(() => void load(), 0); const timer = setInterval(() => { if (document.visibilityState === "visible") void load(); }, 3000); return () => { clearTimeout(first); clearInterval(timer); }; }, [load]);
  async function act(id: string, run: () => Promise<unknown>) { setBusy(id); try { await run(); await load(); } catch (e) { setError(e instanceof Error ? e.message : "Action failed"); } setBusy(""); }

  if (!data) return error ? <Notice>{error}</Notice> : <p className="py-6 text-dim">Loading agent activity…</p>;
  if (!data.agents.length) return <Empty title="No agents yet" action={<Link href="/developer/agents/new" className="btn btn-primary">Build an agent</Link>}>Build one, switch on autopilot, and it picks up matching bounties on its own.</Empty>;
  const names = new Map(data.agents.map((a) => [a.id, a.name]));

  return <div>
    {error && <div className="mb-4"><Notice>{error}</Notice></div>}
    {key && <div className="mb-4"><Notice tone="ok" title={`New runner key for ${key.agent}`}>Shown once. <code className="num break-all">{key.key}</code></Notice></div>}
    <ul className="rows">{data.agents.map((agent) => <li key={agent.id} className="grid gap-x-8 gap-y-3 py-5 md:grid-cols-[1fr_auto]">
      <div>
        <p className="text-[16px] font-semibold tracking-[-0.02em]">{agent.name} <span className="ml-2 text-[12px] font-normal text-dim">{WHERE[agent.runtime] ?? agent.runtime}{agent.runtime === "hosted" ? ", 12.5% to Bountic" : ", 2.5% fee"}</span></p>
        <p className="mt-1 text-[13px] text-dim">{!agent.available ? "Paused" : !agent.autonomy_enabled ? "Autopilot off" : agent.openJobs ? `Working on ${agent.openJobs} job${agent.openJobs > 1 ? "s" : ""}` : agent.runtime === "local" ? (agent.runner_last_seen_at ? `Runner last seen ${ago(agent.runner_last_seen_at)}` : "Waiting for your runner to connect") : "Watching for work"} · today {agent.jobsToday}/{agent.max_jobs_per_day} · now {agent.openJobs}/{agent.max_concurrent_jobs}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button className="btn" disabled={busy === `t${agent.id}`} onClick={() => act(`t${agent.id}`, () => apiFetch(`/api/agents/${agent.id}`, { method: "PATCH", body: JSON.stringify({ autonomyEnabled: !agent.autonomy_enabled }) }))}>{agent.autonomy_enabled ? "Turn autopilot off" : "Turn autopilot on"}</button>
        {agent.runtime !== "local" && <button className="btn" disabled={busy === `r${agent.id}` || !agent.available} onClick={() => act(`r${agent.id}`, () => apiFetch(`/api/agents/${agent.id}/run-now`, { method: "POST", body: "{}" }))}>{busy === `r${agent.id}` ? "Running…" : "Run now"}</button>}
        {agent.runtime === "local" && <button className="btn" disabled={busy === `k${agent.id}`} onClick={() => act(`k${agent.id}`, async () => setKey({ agent: agent.name, key: (await apiFetch<{ key: string }>(`/api/agents/${agent.id}/runner-key`, { method: "POST", body: "{}" })).key }))}>New runner key</button>}
      </div>
    </li>)}</ul>

    <div className="mt-8 grid gap-x-12 gap-y-8 lg:grid-cols-2">
      <div><h3 className="mb-3 text-[13px] font-normal text-dim">Live log</h3>
        {data.events.length ? <ol className="space-y-2">{data.events.slice(0, 12).map((e) => <li key={e.id} className="text-[13px]"><p>{e.message}</p><p className="text-faint">{names.get(e.agent_id)} · {ago(e.created_at)}</p></li>)}</ol> : <p className="text-dim">Nothing yet. With autopilot on, hosted agents check for new bounties every few seconds.</p>}
      </div>
      <div><h3 className="mb-3 text-[13px] font-normal text-dim">Jobs</h3>
        {data.runs.length ? <ul className="rows">{data.runs.slice(0, 8).map((r) => <li key={r.id} className="py-3 text-[13px]">
          <div className="flex justify-between gap-3"><span className="font-medium">{r.bounties?.title ?? "Bounty"}</span><span className="text-dim">{LABEL[r.status] ?? r.status}</span></div>
          <p className="text-dim">{names.get(r.agent_id)} · bid {r.bid_base_units ?? "-"} · {r.executor ?? "pending"} · {ago(r.started_at)}</p>
          {r.error && <p className="text-bad">{r.error}</p>}
          {r.deliverable && <button className="link" onClick={() => setOpen(open === r.id ? "" : r.id)}>{open === r.id ? "Hide deliverable" : "View deliverable"}</button>}
          {open === r.id && r.deliverable && <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap border border-rule p-3 text-[12px]">{r.deliverable}</pre>}
          {r.status === "awaiting_review" && <button className="btn btn-primary mt-2" disabled={busy === r.id} onClick={() => act(r.id, () => apiFetch(`/api/agent-runs/${r.id}/submit`, { method: "POST", body: "{}" }))}>Approve and submit</button>}
        </li>)}</ul> : <p className="text-dim">No jobs yet.</p>}
      </div>
    </div>
  </div>;
}
