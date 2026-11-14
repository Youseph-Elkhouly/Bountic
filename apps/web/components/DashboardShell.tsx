import Link from "next/link";
import { SignOut } from "@/components/SignOut";

export type DashboardRole = "requester" | "earner";

const navigation: Record<DashboardRole, { label: string; href: string }[]> = {
  requester: [
    { label: "Overview", href: "/dashboard/requester" },
    { label: "My bounties", href: "/dashboard/requester#bounties" },
    { label: "Create bounty", href: "/bounties/new" },
    { label: "Submissions", href: "/dashboard/requester#submissions" },
    { label: "Payments", href: "/dashboard/requester#payments" },
    { label: "Settings", href: "/dashboard/requester#settings" },
  ],
  earner: [
    { label: "Overview", href: "/dashboard/earner" },
    { label: "My agents", href: "/dashboard/earner#agents" },
    { label: "Register agent", href: "/agents/new" },
    { label: "Opportunities", href: "/dashboard/earner#opportunities" },
    { label: "Submissions", href: "/dashboard/earner#submissions" },
    { label: "Earnings", href: "/dashboard/earner#earnings" },
    { label: "Settings", href: "/dashboard/earner#settings" },
  ],
};

export function DashboardShell({ role, email, children }: { role: DashboardRole; email: string; children: React.ReactNode }) {
  const label = role === "requester" ? "Requester workspace" : "Earner workspace";
  return <div className="dashboard-layout">
    <aside className="dashboard-sidebar">
      <Link className="dashboard-brand" href="/">bountic<span>.</span></Link>
      <div className="dashboard-role">{label}</div>
      <nav className="dashboard-nav" aria-label={`${label} navigation`}>
        {navigation[role].map((item) => <Link key={item.label} href={item.href}>{item.label}</Link>)}
      </nav>
      <div className="dashboard-account">
        <span className="account-avatar">{email.slice(0, 1).toUpperCase()}</span>
        <span className="account-email" title={email}>{email}</span>
        <SignOut />
      </div>
    </aside>
    <main className="dashboard-main"><div className="dashboard-mobilebar"><div className="mobilebar-top"><Link className="dashboard-brand" href="/">bountic<span>.</span></Link><SignOut /></div><nav className="dashboard-mobile-nav" aria-label={`${label} navigation`}>{navigation[role].map((item) => <Link key={item.label} href={item.href}>{item.label}</Link>)}</nav></div>{children}<section className="dashboard-settings" id="settings"><p className="eyebrow">ACCOUNT SETTINGS</p><h2>Account</h2><p>{email}</p><p>Role: {role === "requester" ? "Requester" : "Earner"}</p><SignOut /></section></main>
  </div>;
}

export function DashboardLoadError({ title, message }: { title: string; message: string }) {
  return <div className="notice-error mt-6" role="alert"><h2 className="font-semibold">{title}</h2><p className="mt-1 text-sm">{message}</p><p className="mt-2 text-xs">Check that migrations 0001–0006 are applied and the Supabase project is reachable.</p><a className="mt-3 inline-block text-xs font-semibold underline" href="">Retry</a></div>;
}

export function MetricCard({ label, value, detail }: { label: string; value: string | number; detail?: string }) {
  return <article className="metric-card"><p className="metric-label">{label}</p><p className="metric-value">{value}</p>{detail && <p className="metric-detail">{detail}</p>}</article>;
}

export function StatusPill({ value }: { value: string }) {
  const normalized = value.toLowerCase();
  const kind = ["active", "confirmed", "available", "accepted", "settled"].includes(normalized) ? "success"
    : ["funding", "pending", "queued", "sent", "review"].includes(normalized) ? "pending"
      : ["failed", "refunded", "declined", "expired"].includes(normalized) ? "muted" : "default";
  return <span className={`status-pill status-${kind}`}>{value.replaceAll("_", " ")}</span>;
}
