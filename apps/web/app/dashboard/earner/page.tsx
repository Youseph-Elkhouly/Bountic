import Link from "next/link";
import { redirect } from "next/navigation";
import { AgentActions } from "@/components/AgentActions";
import { AgentProfileEditor } from "@/components/AgentProfileEditor";
import { AgentResponse } from "@/components/AgentResponse";
import { AgentSubmissionForm } from "@/components/AgentSubmissionForm";
import { DashboardLoadError, DashboardShell, MetricCard, StatusPill } from "@/components/DashboardShell";
import { QatomReceipts, qatomReceiptColumns, totalUsdTdn, type QatomReceipt } from "@/components/QatomReceipts";
import { TelegramLink } from "@/components/TelegramLink";
import { createClient } from "@/lib/supabase/server";

const amount = (value: string | number | bigint) => BigInt(value).toLocaleString();

export default async function EarnerDashboard() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const { data: profile, error: profileError } = await supabase.from("profiles").select("role,display_name").eq("id", user.id).maybeSingle();
  if (profileError) return <DashboardShell role="earner" email={user.email || "Account"}><DashboardLoadError title="Could not verify your account role" message={profileError.message} /></DashboardShell>;
  if (!profile?.role) redirect("/onboarding");
  if (profile.role !== "earner") redirect("/dashboard/requester");

  const { data: agents, error: agentError } = await supabase.from("agents")
    .select("id,name,description,skills,categories,capabilities,min_reward_base_units,payout_wallet,available,wallet_verified_at,created_at")
    .eq("owner_id", user.id).order("created_at", { ascending: false });
  if (agentError) return <DashboardShell role="earner" email={user.email || "Account"}><DashboardLoadError title="Could not load your agents" message={agentError.message} /></DashboardShell>;

  const agentRows = agents || [];
  const agentIds = agentRows.map((agent) => agent.id);
  const [matchResult, submissionResult, receiptResult] = await Promise.all([
    agentIds.length ? supabase.from("bounty_matches").select("id,bounty_id,agent_id,score,notification_status,created_at").in("agent_id", agentIds).order("created_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
    agentIds.length ? supabase.from("submissions").select("id,bounty_id,agent_id,proposed_amount_base_units,deliverable_type,deliverable_url,storage_path,description,winner,submitted_at").in("agent_id", agentIds).order("submitted_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
    agentIds.length ? supabase.from("qatom_receipts").select(qatomReceiptColumns).in("agent_id", agentIds).order("occurred_at", { ascending: false }).limit(20) : Promise.resolve({ data: [], error: null }),
  ]);
  const loadIssue = matchResult.error || submissionResult.error || receiptResult.error;
  if (loadIssue) return <DashboardShell role="earner" email={user.email || "Account"}><DashboardLoadError title="Could not load agent work" message={loadIssue.message} /></DashboardShell>;
  const matches = matchResult.data || [];
  const submissions = submissionResult.data || [];
  const receipts = (receiptResult.data || []) as QatomReceipt[];
  const bountyIds = [...new Set([...matches.map((item) => item.bounty_id), ...submissions.map((item) => item.bounty_id), ...receipts.map((item) => item.bounty_id)])];
  const [bountyResult, paymentResult] = await Promise.all([
    bountyIds.length ? supabase.from("bounties").select("id,title,description,category,required_skills,deliverable_requirements,max_budget_base_units,asset_symbol,display_fiat_amount,display_fiat_currency,deadline,status").in("id", bountyIds) : Promise.resolve({ data: [], error: null }),
    bountyIds.length ? supabase.from("payments").select("id,bounty_id,kind,status,amount_base_units,tx_hash,explorer_url,created_at,submission_id").in("bounty_id", bountyIds).order("created_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
  ]);
  const laterIssue = bountyResult.error || paymentResult.error;
  if (laterIssue) return <DashboardShell role="earner" email={user.email || "Account"}><DashboardLoadError title="Could not load bounty and payment details" message={laterIssue.message} /></DashboardShell>;

  const bounties = bountyResult.data || [];
  const bountyById = new Map(bounties.map((bounty) => [bounty.id, bounty]));
  const agentById = new Map(agentRows.map((agent) => [agent.id, agent]));
  const payments = paymentResult.data || [];
  const submissionDownloads = new Map<string, string>();
  await Promise.all(submissions.filter((submission) => submission.storage_path).map(async (submission) => {
    const { data } = await supabase.storage.from("bounty-submissions").createSignedUrl(submission.storage_path!, 300);
    if (data?.signedUrl) submissionDownloads.set(submission.id, data.signedUrl);
  }));
  const confirmedEarnings = payments.filter((payment) => payment.kind === "settlement" && payment.status === "confirmed").reduce((sum, payment) => sum + BigInt(payment.amount_base_units), BigInt(0));
  const pendingPayments = payments.filter((payment) => payment.kind === "settlement" && payment.status === "pending");
  const pendingBaseUnits = pendingPayments.reduce((sum, payment) => sum + BigInt(payment.amount_base_units), BigInt(0));
  const opportunities = matches.filter((match) => match.notification_status === "sent" || match.notification_status === "accepted")
    .map((match) => ({ match, bounty: bountyById.get(match.bounty_id), agent: agentById.get(match.agent_id) }))
    .filter((item) => item.bounty?.status === "active" && item.agent);
  const availableOpportunities = opportunities.filter((item) => item.match.notification_status === "sent");
  const acceptedMatches = opportunities.filter((item) => item.match.notification_status === "accepted");
  const activeBountyIds = new Set(acceptedMatches.map((item) => item.bounty!.id));

  return <DashboardShell role="earner" email={user.email || "Account"}>
    <header className="dashboard-heading"><div><p className="eyebrow">EARNER WORKSPACE</p><h1>{profile.display_name ? `Welcome, ${profile.display_name}` : "Find work for your agents"}</h1><p>Keep your agents ready, respond to matched work, and track confirmed earnings.</p></div><Link className="button-primary" href="/agents/new">Register agent</Link></header>
    <section className="metric-grid" aria-label="Earner metrics"><MetricCard label="Registered agents" value={agentRows.length} detail={`${agentRows.filter((agent) => agent.available).length} available`} /><MetricCard label="Matched opportunities" value={availableOpportunities.length} detail="Invitations awaiting a response" /><MetricCard label="Active assignments" value={acceptedMatches.length} detail="Accepted, open bounties" /><MetricCard label="Submissions sent" value={submissions.length} detail="Deliverables under review or decided" /><MetricCard label="Confirmed earnings" value={amount(confirmedEarnings)} detail="Native base units paid on-chain" /><MetricCard label="Pending payout" value={amount(pendingBaseUnits)} detail="Native base units awaiting confirmation" /></section>

    <section className="dashboard-section" id="agents"><div className="section-heading"><div><p className="eyebrow">YOUR AGENT ROSTER</p><h2>My agents</h2></div><Link href="/agents/new" className="button-secondary">Add agent</Link></div>
      {agentRows.length ? <div className="space-y-3">{agentRows.map((agent) => <article className="list-card block" key={agent.id}>
        <div className="flex flex-wrap items-start justify-between gap-4"><div><h3 className="font-semibold">{agent.name}</h3><p className="mt-1 max-w-2xl text-sm text-neutral-600">{agent.description || "No description added."}</p><p className="mt-2 text-xs text-neutral-500">{agent.skills?.join(" · ") || "No skills listed"}</p></div><StatusPill value={agent.available ? "available" : "paused"} /></div>
        <p className="mt-3 text-xs text-neutral-500">Payout address <span className="font-mono">{agent.payout_wallet ? `${agent.payout_wallet.slice(0, 8)}…${agent.payout_wallet.slice(-5)}` : "not added"}</span> · {agent.wallet_verified_at ? "verified" : agent.payout_wallet ? "verification required" : "add later to receive payouts"}</p>
        <AgentActions id={agent.id} available={agent.available} verified={Boolean(agent.wallet_verified_at)} hasWallet={Boolean(agent.payout_wallet)} />
        <AgentProfileEditor agent={agent} />
      </article>)}</div> : <div className="empty-state"><h3>Your agents start here</h3><p>Register an agent that runs on your own computer or server. Bountic stores its profile, not its private keys.</p><Link href="/agents/new" className="button-primary mt-4">Register your first agent</Link></div>}
    </section>

    <section className="dashboard-section" id="opportunities"><div className="section-heading"><div><p className="eyebrow">FUNDED WORK</p><h2>Bounty opportunities</h2></div></div>
      {opportunities.length ? <div className="space-y-3">{opportunities.map(({ match, bounty, agent }) => bounty && agent && <article className="list-card block" key={match.id}>
        <div className="flex flex-wrap items-start justify-between gap-3"><div><Link className="font-semibold hover:underline" href={`/bounties/${bounty.id}`}>{bounty.title}</Link><p className="mt-1 text-sm text-neutral-600">{bounty.category} · {agent.name}</p></div><div className="flex items-center gap-2">{match.score !== null && <span className="text-xs text-neutral-500">{Math.round(Number(match.score) * 100)}% match</span>}<StatusPill value={match.notification_status} /></div></div>
        <p className="mt-3 line-clamp-2 text-sm leading-6 text-neutral-600">{bounty.description}</p><p className="mt-2 text-xs text-neutral-500">{bounty.display_fiat_amount ? `$${bounty.display_fiat_amount} ${bounty.display_fiat_currency} displayed budget · ` : ""}Escrow: {amount(bounty.max_budget_base_units)} {bounty.asset_symbol} base units · due {new Date(bounty.deadline).toLocaleDateString()} · {bounty.required_skills?.join(", ") || "Skills not specified"}</p>
        {match.notification_status === "sent" && <AgentResponse bountyId={bounty.id} agentId={agent.id} />}
        {match.notification_status === "accepted" && <AgentSubmissionForm bountyId={bounty.id} agentId={agent.id} />}
      </article>)}</div> : <div className="empty-state"><h3>No matched opportunities yet</h3><p>Only funded bounties returned by the matching service appear here. Keep an agent available and connect Telegram to receive invitations.</p></div>}
    </section>

    <div className="dashboard-columns">
      <section className="dashboard-section" id="submissions"><div className="section-heading"><div><p className="eyebrow">DELIVERABLES</p><h2>Your submissions</h2></div></div>
        {submissions.length ? <div className="space-y-2">{submissions.slice(0, 8).map((submission) => { const status = submission.winner ? "winner" : bountyById.get(submission.bounty_id)?.status === "settled" ? "unsuccessful" : activeBountyIds.has(submission.bounty_id) ? "under review" : "submitted"; return <article className="activity-row" key={submission.id}><span><strong>{bountyById.get(submission.bounty_id)?.title || "Bounty"}</strong><small>{agentById.get(submission.agent_id)?.name || "Agent"} · {amount(submission.proposed_amount_base_units)} base units · {new Date(submission.submitted_at).toLocaleDateString()}</small>{submission.deliverable_url && <a href={submission.deliverable_url} className="text-xs underline" target="_blank" rel="noreferrer">Open deliverable</a>}{submissionDownloads.has(submission.id) && <a href={submissionDownloads.get(submission.id)} className="text-xs underline" target="_blank" rel="noreferrer">Download submitted file</a>}</span><StatusPill value={status} /></article>})}</div> : <div className="empty-state compact"><h3>No submissions sent</h3><p>Once an agent accepts an invitation, submit a file or deliverable link from its opportunity.</p></div>}
      </section>
      <section className="dashboard-section" id="earnings"><div className="section-heading"><div><p className="eyebrow">GOAT TESTNET</p><h2>Earnings and payouts</h2></div></div>
        <div className="earnings-total"><p className="metric-label">Confirmed on-chain earnings</p><strong>{amount(confirmedEarnings)}</strong><span>native base units</span></div>
        {pendingPayments.length ? <div className="mt-3 space-y-2">{pendingPayments.map((payment) => <article className="activity-row" key={payment.id}><span><strong>Settlement pending</strong><small>{amount(payment.amount_base_units)} base units</small></span><StatusPill value="pending" /></article>)}</div> : <p className="mt-3 text-sm text-neutral-500">No pending payouts.</p>}
        {payments.filter((payment) => payment.kind === "settlement").length > 0 && <div className="mt-3 space-y-2">{payments.filter((payment) => payment.kind === "settlement").slice(0, 6).map((payment) => <article className="activity-row" key={payment.id}><span><strong>Settlement · {amount(payment.amount_base_units)} units</strong><small>{new Date(payment.created_at).toLocaleString()}</small>{payment.tx_hash && <small className="font-mono">{payment.tx_hash.slice(0, 10)}…{payment.tx_hash.slice(-6)}</small>}</span><span className="flex items-center gap-2"><StatusPill value={payment.status} />{payment.explorer_url && <a className="text-xs underline" href={payment.explorer_url} target="_blank" rel="noreferrer">Receipt</a>}</span></article>)}</div>}
      </section>
    </div>

    <section className="dashboard-section" id="tool-spending"><div className="section-heading"><div><p className="eyebrow">QATOM</p><h2>Tool and data purchases</h2></div><span className="text-sm text-neutral-500">{totalUsdTdn(receipts)} USD-TDN spent</span></div>
      {receipts.some((receipt) => receipt.status === "pending_approval") && <p className="mb-3 text-sm text-neutral-600">Purchases above your agent&apos;s auto-approve limit need your approval. Approval links expire after about 15 minutes.</p>}
      <QatomReceipts receipts={receipts} bountyTitles={new Map(bounties.map((bounty) => [bounty.id, bounty.title]))} agentNames={new Map(agentRows.map((agent) => [agent.id, agent.name]))} showApprovalLinks />
    </section>

    <section className="dashboard-section"><div className="section-heading"><div><p className="eyebrow">ACCOUNT CONNECTION</p><h2>Telegram</h2></div></div><div className="panel p-5"><p className="mb-4 text-sm text-neutral-600">Connect the account that receives matched bounty invitations. Messages do not automatically start the agent on your computer.</p><TelegramLink /></div></section>
  </DashboardShell>;
}
