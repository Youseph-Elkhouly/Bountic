import Link from "next/link";
import { redirect } from "next/navigation";
import { DashboardLoadError, DashboardShell, MetricCard, StatusPill } from "@/components/DashboardShell";
import { QatomReceipts, qatomReceiptColumns, totalUsdTdn, type QatomReceipt } from "@/components/QatomReceipts";
import { RequesterBounties } from "@/components/RequesterBounties";
import { createClient } from "@/lib/supabase/server";

const number = (value: string | number | bigint) => BigInt(value).toLocaleString();

export default async function RequesterDashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile, error: profileError } = await supabase.from("profiles").select("role,display_name").eq("id", user.id).maybeSingle();
  if (profileError) return <DashboardShell role="requester" email={user.email || "Account"}><DashboardLoadError title="Could not verify your account role" message={profileError.message} /></DashboardShell>;
  if (!profile?.role) redirect("/onboarding");
  if (profile.role !== "requester") redirect("/dashboard/earner");

  const { data: bounties, error } = await supabase.from("bounties")
    .select("id,title,status,max_budget_base_units,asset_symbol,display_fiat_amount,display_fiat_currency,deadline,created_at,funding_tx_hash")
    .eq("requester_id", user.id).order("created_at", { ascending: false });
  if (error) return <DashboardShell role="requester" email={user.email || "Account"}><DashboardLoadError title="Could not load your bounties" message={error.message} /></DashboardShell>;

  const rows = bounties || [];
  const bountyIds = rows.map((row) => row.id);
  const [submissionResult, paymentResult, matchResult, receiptResult] = await Promise.all([
    bountyIds.length ? supabase.from("submissions").select("id,bounty_id,submitted_at").in("bounty_id", bountyIds).order("submitted_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
    bountyIds.length ? supabase.from("payments").select("id,bounty_id,kind,status,amount_base_units,tx_hash,explorer_url,created_at").in("bounty_id", bountyIds).order("created_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
    bountyIds.length ? supabase.from("bounty_matches").select("id,bounty_id,notification_status").in("bounty_id", bountyIds) : Promise.resolve({ data: [], error: null }),
    bountyIds.length ? supabase.from("qatom_receipts").select(qatomReceiptColumns).in("bounty_id", bountyIds).order("occurred_at", { ascending: false }).limit(20) : Promise.resolve({ data: [], error: null }),
  ]);
  const loadIssue = submissionResult.error || paymentResult.error || matchResult.error || receiptResult.error;
  if (loadIssue) return <DashboardShell role="requester" email={user.email || "Account"}><DashboardLoadError title="Some dashboard records could not be loaded" message={loadIssue.message} /></DashboardShell>;
  const submissions = submissionResult.data || [];
  const payments = paymentResult.data || [];
  const matches = matchResult.data || [];
  const receipts = (receiptResult.data || []) as QatomReceipt[];
  const submissionCounts: Record<string, number> = {};
  for (const item of submissions) submissionCounts[item.bounty_id] = (submissionCounts[item.bounty_id] || 0) + 1;
  const matchCounts: Record<string, number> = {};
  for (const item of matches) matchCounts[item.bounty_id] = (matchCounts[item.bounty_id] || 0) + 1;
  const activeCount = rows.filter((item) => item.status === "active").length;
  const fundedBaseUnits = payments.filter((item) => item.kind === "funding" && item.status === "confirmed").reduce((sum, item) => sum + BigInt(item.amount_base_units), BigInt(0));
  const activity = [
    ...rows.map((row) => ({ id: `b-${row.id}`, date: row.created_at, title: `Bounty created · ${row.title}`, status: row.status, href: `/bounties/${row.id}` })),
    ...payments.map((item) => ({ id: `p-${item.id}`, date: item.created_at, title: `${item.kind} · ${item.amount_base_units.toString()} base units`, status: item.status, href: item.explorer_url || `/bounties/${item.bounty_id}` })),
    ...submissions.map((item) => ({ id: `s-${item.id}`, date: item.submitted_at, title: `Submission received · ${rows.find((row) => row.id === item.bounty_id)?.title || "Bounty"}`, status: "received", href: `/bounties/${item.bounty_id}/submissions` })),
  ].sort((a, b) => Date.parse(b.date) - Date.parse(a.date)).slice(0, 6);

  return <DashboardShell role="requester" email={user.email || "Account"}>
    <header className="dashboard-heading"><div><p className="eyebrow">REQUESTER WORKSPACE</p><h1>{profile.display_name ? `Welcome, ${profile.display_name}` : "Your work, in one place"}</h1><p>Post opportunities, follow escrow, and review completed work.</p></div><Link className="button-primary" href="/bounties/new">Create bounty</Link></header>
    <section className="metric-grid" aria-label="Requester metrics"><MetricCard label="Bounties created" value={rows.length} detail="Across all statuses" /><MetricCard label="Active bounties" value={activeCount} detail="Funded and open" /><MetricCard label="Submissions received" value={submissions.length} detail="Across your bounties" /><MetricCard label="Confirmed funding" value={number(fundedBaseUnits)} detail="Total deposited, native base units" /></section>

    <section className="dashboard-section" id="bounties"><div className="section-heading"><div><p className="eyebrow">YOUR MARKETPLACE</p><h2>My bounties</h2></div><span className="text-sm text-neutral-500">{rows.length} total</span></div><RequesterBounties bounties={rows} submissionCounts={submissionCounts} matchCounts={matchCounts} />
      {matches.length > 0 && <p className="mt-3 text-xs text-neutral-500">Agent matches have been recorded for {Object.keys(matchCounts).length} {Object.keys(matchCounts).length === 1 ? "bounty" : "bounties"}.</p>}
    </section>

    <div className="dashboard-columns">
      <section className="dashboard-section" id="submissions"><div className="section-heading"><div><p className="eyebrow">WORK TO REVIEW</p><h2>Recent submissions</h2></div></div>
        {submissions.length ? <div className="space-y-2">{submissions.slice(0, 5).map((item) => <Link className="activity-row" key={item.id} href={`/bounties/${item.bounty_id}/submissions`}><span><strong>{rows.find((row) => row.id === item.bounty_id)?.title || "Bounty submission"}</strong><small>Submitted {new Date(item.submitted_at).toLocaleString()}</small></span><span className="text-sm text-neutral-500">Review →</span></Link>)}</div> : <div className="empty-state compact"><h3>No submissions yet</h3><p>Submissions appear here after invited agents send their work.</p></div>}
      </section>
      <section className="dashboard-section" id="payments"><div className="section-heading"><div><p className="eyebrow">ON-CHAIN RECORD</p><h2>Payment activity</h2></div></div>
        {payments.length ? <div className="space-y-2">{payments.slice(0, 6).map((payment) => <article className="activity-row" key={payment.id}><span><strong className="capitalize">{payment.kind}</strong><small>{number(payment.amount_base_units)} base units · {new Date(payment.created_at).toLocaleDateString()}</small>{payment.tx_hash && <small className="font-mono">{payment.tx_hash.slice(0, 10)}…{payment.tx_hash.slice(-6)}</small>}</span><span className="flex items-center gap-2"><StatusPill value={payment.status} />{payment.explorer_url && <a className="text-xs underline" href={payment.explorer_url} target="_blank" rel="noreferrer">Receipt</a>}</span></article>)}</div> : <div className="empty-state compact"><h3>No payment activity</h3><p>Funding and settlement records appear after transactions are confirmed.</p></div>}
      </section>
    </div>

    <section className="dashboard-section" id="agent-spending"><div className="section-heading"><div><p className="eyebrow">QATOM</p><h2>Agent tool spending</h2></div><span className="text-sm text-neutral-500">{totalUsdTdn(receipts)} USD-TDN spent</span></div>
      <p className="mb-3 text-sm text-neutral-600">Tools and data agents bought from their own wallets while working on your bounties. This spending is separate from your escrowed budget.</p>
      <QatomReceipts receipts={receipts} bountyTitles={new Map(rows.map((row) => [row.id, row.title]))} agentNames={new Map()} />
    </section>

    <section className="dashboard-section"><div className="section-heading"><div><p className="eyebrow">LATEST CHANGES</p><h2>Recent activity</h2></div></div>
      {activity.length ? <div className="space-y-2">{activity.map((item) => <Link className="activity-row" href={item.href} key={item.id}><span><strong>{item.title}</strong><small>{new Date(item.date).toLocaleString()}</small></span><StatusPill value={item.status} /></Link>)}</div> : <div className="empty-state compact"><h3>Your activity will show here</h3><p>Create a bounty to get started.</p></div>}
    </section>
  </DashboardShell>;
}
