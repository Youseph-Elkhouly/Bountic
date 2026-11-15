"use client";
import { DragEvent, FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Notice } from "@/components/ui";
import { apiFetch } from "@/lib/api";
import { AgentDraft, MODELS, TEMPLATES, emptyDraft, toApiBody, toManifest } from "./manifest";
import { importAgentFiles, readDropped } from "./importers";

const csv = (value: string) => value.split(",").map((item) => item.trim()).filter(Boolean);
const SERVICE_PERCENT = 2.5; const HOSTING_PERCENT = 10;
const RUNTIMES: Array<{ id: AgentDraft["runtime"]; title: string; blurb: string }> = [
  { id: "local", title: "On my own machine", blurb: `Primary option. Your hardware, your model, your keys. A small runner script pulls jobs, so no public URL is needed. ${SERVICE_PERCENT}% marketplace fee on payouts.` },
  { id: "hosted", title: `Hosted by Bountic (${SERVICE_PERCENT + HOSTING_PERCENT}% total)`, blurb: `We run it for you on Backboard. Nothing to set up. ${SERVICE_PERCENT}% marketplace fee plus ${HOSTING_PERCENT}% to cover the infrastructure.` },
  { id: "webhook", title: "My server (webhook)", blurb: `Bountic POSTs each job to your public HTTPS endpoint. ${SERVICE_PERCENT}% marketplace fee on payouts.` },
];

export function AgentBuilder() {
  const router = useRouter();
  const [draft, setDraft] = useState<AgentDraft>({ ...emptyDraft, runtime: "local" });
  const [models, setModels] = useState(MODELS);
  const [error, setError] = useState(""); const [note, setNote] = useState(""); const [saving, setSaving] = useState(false); const [over, setOver] = useState(false);
  const [created, setCreated] = useState<{ id: string; key: string } | null>(null);
  const set = <K extends keyof AgentDraft>(key: K, value: AgentDraft[K]) => setDraft((current) => ({ ...current, [key]: value }));

  useEffect(() => { apiFetch<{ models: typeof MODELS }>("/api/agent-models").then((r) => r.models?.length && setModels(r.models)).catch(() => undefined); }, []);

  function pick(template: (typeof TEMPLATES)[number]) { setDraft((current) => ({ ...emptyDraft, runtime: current.runtime, ...template.draft })); setNote(`Loaded the ${template.title} template. Adjust anything below.`); setError(""); }
  async function drop(event: DragEvent<HTMLElement>) {
    event.preventDefault(); setOver(false);
    await load(await readDropped(event.dataTransfer.items, event.dataTransfer.files));
  }
  async function load(files: Awaited<ReturnType<typeof readDropped>>) {
    try {
      if (!files.length) throw new Error("No readable files. Use .md, .txt or .json.");
      const { draft: next, notes } = importAgentFiles(files);
      setDraft((current) => ({ ...emptyDraft, runtime: current.runtime, ...next })); setNote(`${notes.join(" ")} Wallets are never imported.`); setError("");
    } catch (e) { setError(e instanceof Error ? e.message : "Could not read those files."); }
  }
  function exportJson() { const url = URL.createObjectURL(new Blob([JSON.stringify(toManifest(draft), null, 2)], { type: "application/json" })); const a = document.createElement("a"); a.href = url; a.download = "bountic.agent.json"; a.click(); URL.revokeObjectURL(url); }

  const summary = useMemo(() => {
    const where = draft.runtime === "hosted" ? `runs on Bountic's servers (${SERVICE_PERCENT + HOSTING_PERCENT}% of wins to Bountic)` : draft.runtime === "local" ? `runs on your own machine (${SERVICE_PERCENT}% marketplace fee on wins)` : `calls your server (${SERVICE_PERCENT}% marketplace fee on wins)`;
    return `${draft.name || "This agent"} ${where}. It takes up to ${draft.maxConcurrentJobs} job${draft.maxConcurrentJobs > 1 ? "s" : ""} at once and ${draft.maxJobsPerDay} a day, bids ${draft.bidPercent}% of the budget${draft.maxBidBaseUnits ? ` (never above ${draft.maxBidBaseUnits})` : ""}, skips anything paying under ${draft.minRewardBaseUnits || "0"}, and ${draft.autoSubmit ? "submits automatically" : "waits for your OK before submitting"}.`;
  }, [draft]);

  async function submit(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError("");
    try {
      const { agent } = await apiFetch<{ agent: { id: string } }>("/api/agents", { method: "POST", body: JSON.stringify(toApiBody(draft)) });
      if (draft.runtime === "local") { const { key } = await apiFetch<{ key: string }>(`/api/agents/${agent.id}/runner-key`, { method: "POST", body: "{}" }); setCreated({ id: agent.id, key }); setSaving(false); return; }
      router.push("/developer?agent=" + agent.id); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not create the agent."); setSaving(false); }
  }

  if (created) return <div className="max-w-2xl space-y-6">
    <Notice tone="ok" title="Agent created">Copy the key now. It is shown once and only a hash is stored.</Notice>
    <div><p className="label">Runner key</p><code className="num mt-2 block break-all border border-rule p-3 text-[13px]">{created.key}</code></div>
    <div><p className="label">Run it on your machine (Node 20+)</p>
      <pre className="num mt-2 overflow-x-auto border border-rule p-3 text-[12px]">{`export BOUNTIC_API_URL=${process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000"}\nexport BOUNTIC_RUNNER_KEY=${created.key}\n# optional: any OpenAI-compatible model, e.g. Ollama\nexport LLM_URL=http://localhost:11434/v1 LLM_MODEL=llama3.1\nnode services/api/scripts/local-runner.mjs`}</pre>
      <p className="hint">Without LLM_URL the runner writes a clearly labelled stub, handy for trying the flow.</p></div>
    <button className="btn btn-primary" onClick={() => { router.push("/developer?agent=" + created.id); router.refresh(); }}>Go to my agents</button>
  </div>;

  return <form onSubmit={submit} className="max-w-3xl" onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={drop}>
    <section className={`border border-dashed p-5 ${over ? "border-ink bg-paper-2" : "border-rule-strong"}`}>
      <p className="text-[15px] font-semibold">Upload your real agent</p>
      <p className="hint">Drop a <code>SKILL.md</code>, several skills, a whole skill folder, an agent <code>.md</code> file, <code>AGENTS.md</code>, or a <code>bountic.agent.json</code> anywhere on this page. Name, description, skills and instructions are filled in for you.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <label className="btn cursor-pointer">Choose files<input type="file" multiple accept=".md,.markdown,.txt,.json" className="sr-only" onChange={async (e) => { await load(await readDropped(null, e.target.files)); e.target.value = ""; }} /></label>
        <label className="btn cursor-pointer">Choose a folder<input type="file" className="sr-only" {...({ webkitdirectory: "", directory: "" } as Record<string, string>)} onChange={async (e) => { await load(await readDropped(null, e.target.files)); e.target.value = ""; }} /></label>
      </div>
      <p className="mt-4 text-[13px] text-dim">Or start from a template:</p>
      <div className="mt-4 flex flex-wrap gap-2">{TEMPLATES.map((t) => <button type="button" key={t.id} className="btn" onClick={() => pick(t)}>{t.emoji} {t.title}<span className="ml-2 text-dim">{t.blurb}</span></button>)}</div>
    </section>
    {note && <div className="mt-4"><Notice tone="plain">{note}</Notice></div>}

    <fieldset className="mt-10 space-y-6"><legend className="mb-4 text-[17px] font-semibold tracking-[-0.02em]">Where it runs</legend>
      <div className="grid gap-3">{RUNTIMES.map((r) => <label key={r.id} className={`flex cursor-pointer gap-3 border p-4 ${draft.runtime === r.id ? "border-ink" : "border-rule"}`}>
        <input type="radio" name="runtime" checked={draft.runtime === r.id} onChange={() => set("runtime", r.id)} /><span><span className="block text-[14px] font-medium">{r.title}</span><span className="hint">{r.blurb}</span></span></label>)}</div>
      {draft.runtime === "webhook" && <label className="label">Endpoint (public HTTPS)<input className="field" value={draft.webhookUrl} onChange={(e) => set("webhookUrl", e.target.value)} placeholder="https://my-agent.example.com/job" /></label>}
      {draft.runtime === "hosted" && <label className="label">Model<select className="field" value={draft.model} onChange={(e) => set("model", e.target.value)}>{models.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select></label>}
    </fieldset>

    <fieldset className="mt-10 space-y-6 border-t border-rule pt-8"><legend className="float-left mb-4 w-full text-[17px] font-semibold tracking-[-0.02em]">The agent</legend>
      <label className="label clear-both">Name<input className="field" required maxLength={100} value={draft.name} onChange={(e) => set("name", e.target.value)} /></label>
      <label className="label">Description<textarea className="field min-h-24" required maxLength={4000} value={draft.description} onChange={(e) => set("description", e.target.value)} /></label>
      <div className="grid gap-6 sm:grid-cols-2">
        <label className="label">Skills<input className="field" value={draft.skills.join(", ")} onChange={(e) => set("skills", csv(e.target.value))} placeholder="copywriting, seo" /></label>
        <label className="label">Categories<input className="field" value={draft.categories.join(", ")} onChange={(e) => set("categories", csv(e.target.value))} placeholder="writing, marketing" /></label>
      </div>
      <label className="label">Instructions and skills<textarea className="field min-h-40 font-mono text-[12px]" maxLength={60000} value={draft.instructions} onChange={(e) => set("instructions", e.target.value)} placeholder="How should it work? Tone, structure, rules. Imported skill files land here." /><span className="hint">{draft.instructions.length.toLocaleString()} / 60,000 characters. {draft.runtime === "local" ? "Your runner receives these with each job." : "Sent to the model as the agent's system instructions."}</span></label>
    </fieldset>

    <fieldset className="mt-10 space-y-6 border-t border-rule pt-8"><legend className="float-left mb-4 w-full text-[17px] font-semibold tracking-[-0.02em]">Budgets and limits</legend>
      <div className="clear-both grid gap-6 sm:grid-cols-3">
        <label className="label">Minimum reward<input className="field num" inputMode="numeric" value={draft.minRewardBaseUnits} onChange={(e) => set("minRewardBaseUnits", e.target.value.replace(/\D/g, ""))} /></label>
        <label className="label">Bid, % of budget<input className="field num" type="number" min={1} max={100} value={draft.bidPercent} onChange={(e) => set("bidPercent", Number(e.target.value))} /></label>
        <label className="label">Max bid, optional<input className="field num" inputMode="numeric" value={draft.maxBidBaseUnits} onChange={(e) => set("maxBidBaseUnits", e.target.value.replace(/\D/g, ""))} /></label>
        <label className="label">Jobs at once<input className="field num" type="number" min={1} max={10} value={draft.maxConcurrentJobs} onChange={(e) => set("maxConcurrentJobs", Number(e.target.value))} /></label>
        <label className="label">Jobs per day<input className="field num" type="number" min={1} max={200} value={draft.maxJobsPerDay} onChange={(e) => set("maxJobsPerDay", Number(e.target.value))} /></label>
        <label className="label">Tokens per job<input className="field num" type="number" min={256} max={32000} value={draft.maxTokensPerJob} onChange={(e) => set("maxTokensPerJob", Number(e.target.value))} /></label>
      </div>
      <label className="flex items-center gap-3 text-[14px]"><input type="checkbox" checked={draft.autonomyEnabled} onChange={(e) => set("autonomyEnabled", e.target.checked)} />Autopilot: pick up matching bounties on its own</label>
      <label className="flex items-center gap-3 text-[14px]"><input type="checkbox" checked={draft.autoSubmit} onChange={(e) => set("autoSubmit", e.target.checked)} />Submit automatically (off = hold drafts for my OK)</label>
      <label className="label">Payout address, optional<input className="field num text-[13px]" value={draft.payoutWallet} onChange={(e) => set("payoutWallet", e.target.value.trim())} placeholder="0x…" /><span className="hint">Verify it later on the agents page before it can be paid on-chain.</span></label>
    </fieldset>

    <p className="mt-8 border-t border-rule pt-6 text-[14px] text-dim">{summary}</p>
    {error && <div className="mt-6"><Notice>{error}</Notice></div>}
    <div className="mt-6 flex flex-wrap gap-3"><button className="btn btn-primary btn-lg" disabled={saving}>{saving ? "Creating…" : "Create agent"}</button><button type="button" className="btn btn-lg" onClick={exportJson}>Export JSON</button></div>
  </form>;
}
