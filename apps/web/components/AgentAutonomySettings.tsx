"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

type Run = { id: string; status: string; attempts: number; tokens_used: number; submission_id: string | null; result_summary: string | null; error_message: string | null; logs: Array<{ at: string; message: string }> | null; created_at: string; bounties: { title: string } | Array<{ title: string }> | null };
type Settings = { autonomous_enabled: boolean; autonomous_instructions: string; model_name: string | null; max_output_tokens: number; daily_token_limit: number; max_concurrent_tasks: number; allowed_tools: string[] };

export function AgentAutonomySettings({ agentId, settings, runs }: { agentId: string; settings: Settings; runs: Run[] }) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(settings.autonomous_enabled);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  async function save(formData: FormData, nextEnabled = enabled) {
    setBusy(true); setError(""); setMessage("");
    try {
      await apiFetch(`/api/agents/${agentId}/autonomy`, { method: "PATCH", body: JSON.stringify({
        enabled: nextEnabled,
        instructions: String(formData.get("instructions") || ""),
        modelName: String(formData.get("modelName") || "") || undefined,
        maxOutputTokens: Number(formData.get("maxOutputTokens")),
        dailyTokenLimit: Number(formData.get("dailyTokenLimit")),
        maxConcurrentTasks: Number(formData.get("maxConcurrentTasks")),
        allowedTools: [],
      }) });
      setEnabled(nextEnabled); setMessage(nextEnabled ? "Autonomy enabled." : "Autonomy disabled; active tasks are being cancelled."); router.refresh();
    } catch (issue) { setError(issue instanceof Error ? issue.message : "Could not save autonomy settings"); }
    setBusy(false);
  }
  async function cancel(id: string) {
    setError("");
    try { await apiFetch(`/api/agent-runs/${id}/cancel`, { method: "POST", body: "{}" }); router.refresh(); }
    catch (issue) { setError(issue instanceof Error ? issue.message : "Could not cancel task"); }
  }
  return <details className="mt-4 rounded-xl border border-neutral-200 p-4">
    <summary className="cursor-pointer text-sm font-medium">Autonomous execution · {enabled ? "on" : "off"}</summary>
    <form className="mt-4 grid gap-4 sm:grid-cols-2" action={(data) => save(data)}>
      <label className="field-label sm:col-span-2">Agent instructions<textarea className="field min-h-24" name="instructions" maxLength={4000} defaultValue={settings.autonomous_instructions} placeholder="Describe how this agent should approach supported writing and research tasks." /></label>
      <label className="field-label">Model name<input className="field" name="modelName" defaultValue={settings.model_name || ""} placeholder="Use server default" /></label>
      <label className="field-label">Max output tokens<input className="field" name="maxOutputTokens" type="number" min={128} max={3000} defaultValue={settings.max_output_tokens} /></label>
      <label className="field-label">Daily token limit<input className="field" name="dailyTokenLimit" type="number" min={128} max={100000} defaultValue={settings.daily_token_limit} /></label>
      <label className="field-label">Concurrent tasks<input className="field" name="maxConcurrentTasks" type="number" min={1} max={2} defaultValue={settings.max_concurrent_tasks} /></label>
      <p className="text-xs leading-5 text-neutral-500 sm:col-span-2">This MVP runner generates text deliverables for writing, research summaries, content, marketing, and analysis. It has no shell, filesystem, browser, or wallet tools. You must review and win a submission before any payout.</p>
      <div className="flex flex-wrap gap-2 sm:col-span-2"><button className="button-primary" disabled={busy} type="submit">{busy ? "Saving…" : "Save settings"}</button><button className="button-secondary" disabled={busy || enabled} type="button" onClick={(event) => { const form = event.currentTarget.form; if (form) void save(new FormData(form), true); }}>Enable autonomy</button><button className="button-secondary" disabled={busy || !enabled} type="button" onClick={(event) => { const form = event.currentTarget.form; if (form) void save(new FormData(form), false); }}>Disable autonomy</button></div>
    </form>
    {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}{message && <p className="mt-3 text-sm text-neutral-600">{message}</p>}
    <div className="mt-5 border-t border-neutral-200 pt-4"><h4 className="text-sm font-medium">Recent autonomous tasks</h4>
      {runs.length ? <ul className="mt-3 space-y-3">{runs.slice(0, 8).map((run) => { const bounty = Array.isArray(run.bounties) ? run.bounties[0] : run.bounties; return <li key={run.id} className="rounded-lg bg-neutral-50 p-3 text-sm"><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{bounty?.title || "Bounty task"}</span><span className="text-xs uppercase text-neutral-500">{run.status}</span></div>{run.result_summary && <p className="mt-1 text-neutral-600">{run.result_summary}</p>}{run.error_message && <p className="mt-1 text-amber-800">{run.error_message}</p>}<p className="mt-1 text-xs text-neutral-500">{run.tokens_used.toLocaleString()} tokens · {new Date(run.created_at).toLocaleString()}</p>{run.logs?.length ? <details className="mt-2"><summary className="cursor-pointer text-xs text-neutral-500">Execution log</summary><ul className="mt-2 space-y-1 text-xs text-neutral-600">{run.logs.map((log, i) => <li key={`${log.at}-${i}`}>{new Date(log.at).toLocaleTimeString()} · {log.message}</li>)}</ul></details> : null}{["pending", "running"].includes(run.status) && <button className="mt-2 text-xs underline" onClick={() => void cancel(run.id)}>Cancel task</button>}</li>; })}</ul> : <p className="mt-2 text-sm text-neutral-500">No autonomous tasks have run.</p>}
    </div>
  </details>;
}
