import { AgentDraft, parseManifest } from "./manifest";

export type PickedFile = { path: string; text: string };

/** Tiny YAML-frontmatter reader: scalars, quoted strings, `>`/`|` blocks, inline and dash lists. Enough for SKILL.md and agent .md files. */
export function frontmatter(text: string): { meta: Record<string, string | string[]>; body: string } {
  const match = text.replace(/^﻿/, "").match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: text };
  const meta: Record<string, string | string[]> = {};
  const lines = match[1].split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!kv) continue;
    const [, key, raw] = kv;
    const value = raw.trim();
    if (value === ">" || value === "|" || value === ">-" || value === "|-") {
      const block: string[] = [];
      while (i + 1 < lines.length && /^(\s+|$)/.test(lines[i + 1])) block.push(lines[++i].trim());
      meta[key] = block.join(value.startsWith(">") ? " " : "\n").trim();
    } else if (value === "") {
      const items: string[] = [];
      while (i + 1 < lines.length && /^\s*-\s+/.test(lines[i + 1])) items.push(lines[++i].replace(/^\s*-\s+/, "").trim().replace(/^["']|["']$/g, ""));
      if (items.length) meta[key] = items;
    } else if (value.startsWith("[") && value.endsWith("]")) {
      meta[key] = value.slice(1, -1).split(",").map((item) => item.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
    } else {
      meta[key] = value.replace(/^["']|["']$/g, "");
    }
  }
  return { meta, body: match[2].trim() };
}

const asList = (value: string | string[] | undefined) => value === undefined ? [] : Array.isArray(value) ? value : value.split(",").map((item) => item.trim()).filter(Boolean);
const base = (path: string) => path.split("/").pop() || path;
const MAX_INSTRUCTIONS = 60000;

export type ImportResult = { draft: Partial<AgentDraft>; notes: string[] };

/**
 * Turns picked files into an agent draft. Understands:
 *  - SKILL.md (Claude/Anthropic skill files) and agent .md files with name/description frontmatter
 *  - AGENTS.md / CLAUDE.md style plain instructions
 *  - bountic.agent.json (full settings)
 * Several skills in one drop become one agent that carries all of them.
 */
export function importAgentFiles(files: PickedFile[]): ImportResult {
  const notes: string[] = [];
  const json = files.find((file) => /\.json$/i.test(file.path));
  let draft: Partial<AgentDraft> = {};
  if (json) {
    const parsed = parseManifest(json.text);
    draft = parsed.draft; notes.push(`Read settings from ${base(json.path)}.${parsed.ignored.length ? ` Ignored: ${parsed.ignored.join(", ")}.` : ""}`);
  }

  type Piece = { kind: "skill" | "agent" | "instructions"; name: string; description: string; body: string; meta: Record<string, string | string[]>; path: string };
  const pieces: Piece[] = [];
  let skipped = 0;
  for (const file of files) {
    if (!/\.(md|markdown|txt)$/i.test(file.path)) { if (!/\.json$/i.test(file.path)) skipped++; continue; }
    const depth = file.path.split("/").length - 1;
    const name = base(file.path);
    const { meta, body } = frontmatter(file.text);
    const fmName = typeof meta.name === "string" ? meta.name : "";
    const fmDescription = typeof meta.description === "string" ? meta.description : "";
    if (/^skill\\.md$/i.test(name) || (fmName && fmDescription && !("tools" in meta) && !("model" in meta))) pieces.push({ kind: "skill", name: fmName || name.replace(/\.md$/i, ""), description: fmDescription, body, meta, path: file.path });
    else if (fmName && fmDescription) pieces.push({ kind: "agent", name: fmName, description: fmDescription, body, meta, path: file.path });
    else if (/^(agents|claude|instructions|system|prompt|persona)\\.(md|txt)$/i.test(name) || /\.agent\\.(md|txt)$/i.test(name) || (depth === 0 && files.length === 1)) pieces.push({ kind: "instructions", name: name.replace(/\.(md|txt)$/i, ""), description: "", body: body || file.text, meta, path: file.path });
    else skipped++;
  }
  if (!pieces.length && !json) throw new Error("No agent found. Drop a SKILL.md, an agent .md file with name/description frontmatter, AGENTS.md, or a bountic.agent.json.");

  if (pieces.length) {
    const agentFile = pieces.find((piece) => piece.kind === "agent");
    const skills = pieces.filter((piece) => piece.kind === "skill");
    const plain = pieces.filter((piece) => piece.kind === "instructions");
    const lead = agentFile ?? (skills.length === 1 ? skills[0] : undefined);
    const folder = files[0]?.path.includes("/") ? files[0].path.split("/")[0] : "";
    if (!draft.name) draft.name = (lead?.name ?? (folder || "Imported agent")).slice(0, 100);
    if (!draft.description) draft.description = (lead?.description || skills.map((skill) => skill.description).filter(Boolean).join(" ") || "Imported agent.").slice(0, 4000);

    const sections: string[] = [];
    for (const piece of [...(agentFile ? [agentFile] : []), ...plain]) if (piece.body) sections.push(piece.body);
    for (const skill of skills) sections.push(skills.length === 1 && !agentFile && !plain.length ? skill.body : `## Skill: ${skill.name}\n${skill.description ? `${skill.description}\n\n` : ""}${skill.body}`);
    let text = sections.join("\n\n---\n\n").trim();
    if (text.length > MAX_INSTRUCTIONS) { text = text.slice(0, MAX_INSTRUCTIONS); notes.push(`Instructions were longer than ${MAX_INSTRUCTIONS.toLocaleString()} characters and were cut.`); }
    if (text) draft.instructions = draft.instructions ? `${draft.instructions}\n\n${text}`.slice(0, MAX_INSTRUCTIONS) : text;

    const tags = [...new Set([...skills.map((skill) => skill.name), ...pieces.flatMap((piece) => [...asList(piece.meta.skills), ...asList(piece.meta.tags), ...asList(piece.meta.keywords)])].map((tag) => tag.trim().slice(0, 80)).filter(Boolean))].slice(0, 30);
    if (tags.length && !draft.skills?.length) draft.skills = tags;
    const categories = [...new Set(pieces.flatMap((piece) => [...asList(piece.meta.categories), ...asList(piece.meta.category)]))].slice(0, 30);
    if (categories.length && !draft.categories?.length) draft.categories = categories;
    const tools = [...new Set(pieces.flatMap((piece) => asList(piece.meta.tools)))].slice(0, 30);
    if (tools.length && !draft.capabilities?.length) draft.capabilities = tools;
    notes.push(`Imported ${skills.length ? `${skills.length} skill${skills.length > 1 ? "s" : ""}` : ""}${skills.length && (agentFile || plain.length) ? " and " : ""}${agentFile ? "an agent file" : ""}${plain.length && !agentFile ? "instructions" : ""} (${base(pieces[0].path)}${pieces.length > 1 ? ` +${pieces.length - 1}` : ""}).`);
  }
  if (skipped) notes.push(`Skipped ${skipped} other file${skipped > 1 ? "s" : ""} (scripts, references, assets). Skill folders can include them, but only the instructions are used.`);
  return { draft, notes };
}

/** Reads dropped files and folders (folders via the webkit entry API). */
export async function readDropped(items: DataTransferItemList | null, fallback: FileList | null): Promise<PickedFile[]> {
  const out: PickedFile[] = [];
  const readFile = (entry: FileSystemFileEntry) => new Promise<File>((resolve, reject) => entry.file(resolve, reject));
  const readDir = (dir: FileSystemDirectoryEntry) => new Promise<FileSystemEntry[]>((resolve, reject) => { const reader = dir.createReader(); const all: FileSystemEntry[] = []; const next = () => reader.readEntries((batch) => { if (!batch.length) resolve(all); else { all.push(...batch); next(); } }, reject); next(); });
  async function walk(entry: FileSystemEntry, depth: number) {
    if (out.length >= 200 || depth > 4) return;
    if (entry.isFile) { const file = await readFile(entry as FileSystemFileEntry); if (file.size <= 400_000 && /\.(md|markdown|txt|json)$/i.test(file.name)) out.push({ path: entry.fullPath.replace(/^\//, ""), text: await file.text() }); }
    else if (entry.isDirectory && !/^(node_modules|\.git)$/.test(entry.name)) for (const child of await readDir(entry as FileSystemDirectoryEntry)) await walk(child, depth + 1);
  }
  if (items?.length) { const entries = [...items].map((item) => item.webkitGetAsEntry?.()).filter((entry): entry is FileSystemEntry => Boolean(entry)); for (const entry of entries) await walk(entry, 0); if (out.length) return out; }
  for (const file of [...(fallback ?? [])]) if (file.size <= 400_000 && /\.(md|markdown|txt|json)$/i.test(file.name)) out.push({ path: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name, text: await file.text() });
  return out;
}
