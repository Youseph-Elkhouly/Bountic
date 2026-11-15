import Link from "next/link";
import { baseUnits, coin, NATIVE_SYMBOL, shortHash } from "@/lib/format";

const tones: Record<string, "ok" | "wait" | "off"> = {
  active: "ok", confirmed: "ok", available: "ok", accepted: "ok", settled: "ok", completed: "ok", winner: "ok", verified: "ok", funded: "ok",
  funding: "wait", pending: "wait", queued: "wait", sent: "wait", review: "wait", pending_approval: "wait", "under review": "wait", submitted: "wait",
};
const labels: Record<string, string> = {
  active: "Live", sent: "Invited", funding: "Awaiting funding", review: "In review", settled: "Paid out", pending_approval: "Needs approval",
};

/** A status as a coloured dot and plain words. Unknown values render neutral. */
export function Status({ value }: { value: string }) {
  const key = value.toLowerCase();
  const tone = tones[key] || "off";
  const text = labels[key] || key.replaceAll("_", " ");
  const dot = tone === "ok" ? "bg-ok" : tone === "wait" ? "bg-sat" : "bg-rule-strong";
  return <span className="inline-flex items-center gap-2 whitespace-nowrap text-[13px]">
    <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${dot}`} />
    <span className="inline-block first-letter:uppercase">{text}</span>
  </span>;
}

/** An on-chain amount: readable figure in mono, exact base units on hover. */
export function Amount({ base, symbol = NATIVE_SYMBOL, className = "" }: { base: string | number | bigint; symbol?: string | null; className?: string }) {
  return <span className={`num ${className}`} title={`${baseUnits(base)} base units`}>{coin(base)} <span className="text-dim">{symbol || NATIVE_SYMBOL}</span></span>;
}

export function Hash({ value, href }: { value: string; href?: string | null }) {
  const text = <span className="num text-[12px]" title={value}>{shortHash(value)}</span>;
  return href ? <a className="link text-dim hover:text-ink" href={href} target="_blank" rel="noreferrer noopener">{text}</a> : <span className="text-dim">{text}</span>;
}

export function PageHead({ title, lead, action, back }: { title: string; lead?: React.ReactNode; action?: React.ReactNode; back?: { href: string; label: string } }) {
  return <header className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5 pb-8 pt-10 sm:pt-14">
    <div className="min-w-0 max-w-2xl">
      {back && <Link href={back.href} className="mb-5 inline-block text-[13px] text-dim hover:text-ink">Back to {back.label}</Link>}
      <h1 className="text-title">{title}</h1>
      {lead && <p className="mt-3 text-[15px] leading-relaxed text-dim">{lead}</p>}
    </div>
    {action && <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div>}
  </header>;
}

export function Section({ title, aside, children, id }: { title: string; aside?: React.ReactNode; children: React.ReactNode; id?: string }) {
  return <section id={id} className="mt-14 first:mt-0">
    <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
      <h2 className="text-[17px] tracking-[-0.02em]">{title}</h2>
      {aside && <div className="text-[13px] text-dim">{aside}</div>}
    </div>
    {children}
  </section>;
}

/** Figures in one hairline-ruled band. Values are short; labels say what is counted. */
export function Stats({ items }: { items: { label: string; value: React.ReactNode; detail?: string }[] }) {
  return <dl className="grid grid-cols-2 border-y border-rule lg:grid-flow-col lg:auto-cols-fr lg:grid-cols-none">
    {items.map((item, index) => <div key={item.label} className={`py-5 pr-4 ${index % 2 ? "pl-5 max-lg:border-l max-lg:border-rule" : ""} ${index > 1 ? "max-lg:border-t max-lg:border-rule" : ""} ${index > 0 ? "lg:border-l lg:border-rule lg:pl-6" : "lg:pl-0"}`}>
      <dt className="text-[13px] text-dim">{item.label}</dt>
      <dd className="num mt-1.5 text-[26px] leading-none tracking-[-0.04em]">{item.value}</dd>
      {item.detail && <dd className="mt-2 text-[12px] text-faint">{item.detail}</dd>}
    </div>)}
  </dl>;
}

export function Empty({ title, children, action }: { title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return <div className="border border-dashed border-rule-strong px-6 py-10 sm:px-10">
    <h3 className="text-[15px]">{title}</h3>
    {children && <p className="mt-1.5 max-w-xl text-dim">{children}</p>}
    {action && <div className="mt-5">{action}</div>}
  </div>;
}

export function Notice({ tone = "bad", title, children }: { tone?: "bad" | "ok" | "plain"; title?: string; children: React.ReactNode }) {
  const edge = tone === "bad" ? "border-l-bad" : tone === "ok" ? "border-l-ok" : "border-l-ink";
  return <div role={tone === "bad" ? "alert" : "status"} className={`border border-rule border-l-2 ${edge} bg-wash px-4 py-3 text-[13px] leading-relaxed`}>
    {title && <p className="font-medium">{title}</p>}
    <div className={title ? "mt-0.5 text-dim" : ""}>{children}</div>
  </div>;
}

/** Shown when Supabase rejects a query. States what failed and what to check. */
export function LoadError({ title, message }: { title: string; message: string }) {
  return <div className="py-14"><Notice title={title}>
    <p>{message}</p>
    <p className="mt-2">Check that the Supabase project is reachable and the migrations in <code className="num text-[12px]">services/api/supabase/migrations</code> are applied, then <a className="link text-ink" href="">reload</a>.</p>
  </Notice></div>;
}

export function Tags({ items, empty }: { items?: string[] | null; empty?: string }) {
  if (!items?.length) return empty ? <span className="text-[13px] text-faint">{empty}</span> : null;
  return <ul className="flex flex-wrap gap-1.5">{items.map((item) => <li key={item} className="rounded-full border border-rule px-2.5 py-0.5 text-[12px] text-dim">{item}</li>)}</ul>;
}

export function Wordmark({ href = "/" }: { href?: string }) {
  return <Link href={href} className="text-[19px] font-semibold leading-none tracking-[-0.06em]" aria-label="Bountic home">bountic</Link>;
}
