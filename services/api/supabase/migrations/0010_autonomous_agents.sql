-- Autonomous agents: owner-configured autopilot settings, spending/work limits,
-- and an auditable run log the dashboards read.

alter table public.agents
  add column autonomy_enabled boolean not null default false,
  add column runtime text not null default 'hosted' check (runtime in ('hosted', 'local', 'webhook')),
  add column model text not null default 'auto' check (length(model) between 1 and 80),
  add column instructions text not null default '' check (length(instructions) <= 8000),
  add column webhook_url text check (webhook_url is null or webhook_url ~ '^https://'),
  add column max_concurrent_jobs integer not null default 1 check (max_concurrent_jobs between 1 and 10),
  add column max_jobs_per_day integer not null default 5 check (max_jobs_per_day between 1 and 200),
  add column bid_percent integer not null default 90 check (bid_percent between 1 and 100),
  add column max_bid_base_units numeric(78,0) check (max_bid_base_units is null or max_bid_base_units > 0),
  add column max_tokens_per_job integer not null default 4000 check (max_tokens_per_job between 256 and 32000),
  add column tool_budget_usd_tdn numeric(18,3) not null default 0 check (tool_budget_usd_tdn >= 0),
  add column auto_submit boolean not null default true,
  -- Hosted agents run on Backboard (backboard.io): one Backboard assistant per agent, one thread per job.
  add column backboard_assistant_id text check (backboard_assistant_id is null or length(backboard_assistant_id) <= 200),
  add column memory_enabled boolean not null default true,
  add column web_search_enabled boolean not null default false,
  -- 'local' agents run on the developer's own machine and pull jobs with this key (only a hash is stored).
  add column runner_key_hash text unique,
  add column runner_key_prefix text,
  add column runner_last_seen_at timestamptz;

grant update (autonomy_enabled, runtime, model, instructions, webhook_url, max_concurrent_jobs, max_jobs_per_day,
  bid_percent, max_bid_base_units, max_tokens_per_job, tool_budget_usd_tdn, auto_submit, memory_enabled, web_search_enabled) on public.agents to authenticated;

create type public.agent_run_status as enum ('claimed', 'working', 'awaiting_review', 'submitted', 'failed', 'skipped');

create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  bounty_id uuid not null references public.bounties(id) on delete cascade,
  -- Copied at claim time so requesters can see who is working without reading the agents table.
  agent_name text not null default '' check (length(agent_name) <= 100),
  status public.agent_run_status not null default 'claimed',
  match_score numeric(6,5),
  bid_base_units numeric(78,0),
  deliverable text check (deliverable is null or length(deliverable) <= 20000),
  submission_id uuid references public.submissions(id) on delete set null,
  executor text,
  backboard_thread_id text check (backboard_thread_id is null or length(backboard_thread_id) <= 200),
  tokens_used integer not null default 0,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  unique (agent_id, bounty_id)
);
create index agent_runs_agent_idx on public.agent_runs(agent_id, started_at desc);
create index agent_runs_open_idx on public.agent_runs(agent_id) where status in ('claimed', 'working');

create table public.agent_run_events (
  id bigint generated always as identity primary key,
  run_id uuid references public.agent_runs(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  kind text not null check (kind in ('scan', 'claimed', 'working', 'drafted', 'submitted', 'skipped', 'failed', 'limit', 'paused')),
  message text not null check (length(message) <= 1000),
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index agent_run_events_agent_idx on public.agent_run_events(agent_id, created_at desc);

alter table public.agent_runs enable row level security;
alter table public.agent_run_events enable row level security;

create policy agent_runs_read_participants on public.agent_runs for select to authenticated using (
  exists (select 1 from public.agents a where a.id = agent_id and a.owner_id = auth.uid()) or
  exists (select 1 from public.bounties b where b.id = bounty_id and b.requester_id = auth.uid())
);
create policy agent_run_events_read_owner on public.agent_run_events for select to authenticated using (
  exists (select 1 from public.agents a where a.id = agent_id and a.owner_id = auth.uid())
);
grant select on public.agent_runs, public.agent_run_events to authenticated;

-- Platform cut. Hosted agents run on Bountic's infrastructure, so a fee is taken from their payout.
-- Agents on the developer's own hardware (runtime 'local' or 'webhook') pay no fee.
-- Ledger only: it records the split; the escrow contract is not changed.
create table public.platform_fees (
  id uuid primary key default gen_random_uuid(),
  bounty_id uuid not null unique references public.bounties(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete restrict,
  submission_id uuid not null references public.submissions(id) on delete restrict,
  runtime text not null,
  gross_base_units numeric(78,0) not null check (gross_base_units > 0),
  fee_bps integer not null check (fee_bps between 0 and 5000),
  fee_base_units numeric(78,0) not null check (fee_base_units >= 0),
  net_base_units numeric(78,0) not null check (net_base_units >= 0),
  simulated boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.platform_fees enable row level security;
create policy platform_fees_read_participant on public.platform_fees for select to authenticated using (
  exists (select 1 from public.bounties b where b.id = bounty_id and b.requester_id = auth.uid())
  or exists (select 1 from public.agents a where a.id = agent_id and a.owner_id = auth.uid())
);
grant select on public.platform_fees to authenticated;
