-- Requester wallet identity and durable, bounded autonomous agent executions.
create table public.requester_wallet_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  wallet_address text not null check (wallet_address ~ '^0x[0-9a-fA-F]{40}$'),
  message text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index requester_wallet_challenges_active_idx on public.requester_wallet_challenges(user_id, expires_at) where used_at is null;
alter table public.requester_wallet_challenges enable row level security;

create table public.requester_wallets (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  wallet_address text not null unique check (wallet_address ~ '^0x[0-9a-fA-F]{40}$'),
  verified_at timestamptz not null,
  updated_at timestamptz not null default now()
);
alter table public.requester_wallets enable row level security;
create policy requester_wallets_read_owner on public.requester_wallets for select to authenticated using (user_id = auth.uid());
grant select on public.requester_wallets to authenticated;

alter table public.agents
  add column autonomous_enabled boolean not null default false,
  add column autonomous_instructions text not null default '' check (length(autonomous_instructions) <= 4000),
  add column model_name text,
  add column max_output_tokens integer not null default 2000 check (max_output_tokens between 128 and 3000),
  add column daily_token_limit integer not null default 10000 check (daily_token_limit between 128 and 100000),
  add column max_concurrent_tasks integer not null default 1 check (max_concurrent_tasks between 1 and 2),
  add column allowed_tools text[] not null default '{}' check (allowed_tools <@ array['text_generation']::text[]);

create type public.agent_run_status as enum ('pending','running','completed','failed','cancelled');
create table public.agent_runs (
  id uuid primary key default gen_random_uuid(),
  bounty_id uuid not null references public.bounties(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  status public.agent_run_status not null default 'pending',
  attempts integer not null default 0 check (attempts between 0 and 3),
  available_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  heartbeat_at timestamptz,
  cancellation_requested_at timestamptz,
  tokens_used integer not null default 0 check (tokens_used >= 0),
  reserved_tokens integer not null default 0 check (reserved_tokens >= 0),
  submission_id uuid references public.submissions(id) on delete set null,
  result_summary text,
  error_message text,
  logs jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bounty_id, agent_id)
);
alter table public.submissions add column agent_run_id uuid references public.agent_runs(id) on delete set null;
create unique index submissions_agent_run_unique on public.submissions(agent_run_id) where agent_run_id is not null;
create index agent_runs_pending_idx on public.agent_runs(available_at, created_at) where status = 'pending';
create index agent_runs_agent_idx on public.agent_runs(agent_id, created_at desc);
alter table public.agent_runs enable row level security;
create policy agent_runs_read_owner on public.agent_runs for select to authenticated using (
  exists (select 1 from public.agents a where a.id = agent_runs.agent_id and a.owner_id = auth.uid())
);
grant select on public.agent_runs to authenticated;

create function public.claim_agent_run()
returns setof public.agent_runs
language plpgsql security definer set search_path = '' as $$
declare claimed public.agent_runs;
begin
  update public.agent_runs set status = case when cancellation_requested_at is not null then 'cancelled'::public.agent_run_status when attempts >= 3 then 'failed'::public.agent_run_status else 'pending'::public.agent_run_status end,
    reserved_tokens = 0, available_at = now(), finished_at = case when cancellation_requested_at is not null or attempts >= 3 then now() else null end,
    error_message = 'Worker heartbeat expired; safely reclaimed for retry', updated_at = now()
  where status = 'running' and heartbeat_at < now() - interval '5 minutes';
  select r.* into claimed
  from public.agent_runs r
  join public.agents a on a.id = r.agent_id
  join public.bounties b on b.id = r.bounty_id
  where r.status = 'pending' and r.available_at <= now()
    and r.cancellation_requested_at is null
    and exists (select 1 from public.bounty_matches m where m.bounty_id = r.bounty_id and m.agent_id = r.agent_id and m.notification_status <> 'declined')
    and a.available and a.autonomous_enabled and a.wallet_verified_at is not null
    and b.status = 'active' and b.deadline > now()
    and r.attempts < 3
    and (select count(*) from public.agent_runs active where active.agent_id = a.id and active.status = 'running') < a.max_concurrent_tasks
    and (select coalesce(sum(done.tokens_used), 0) from public.agent_runs done where done.agent_id = a.id and done.created_at >= date_trunc('day', now()))
      + (select coalesce(sum(active.reserved_tokens), 0) from public.agent_runs active where active.agent_id = a.id and active.status = 'running') < a.daily_token_limit
  order by r.available_at, r.created_at
  limit 1 for update of r, a skip locked;
  if claimed.id is null then return; end if;
  update public.agent_runs set status = 'running', attempts = attempts + 1,
    reserved_tokens = (select least(a.max_output_tokens + 5000,
      greatest(0, a.daily_token_limit - coalesce((select sum(done.tokens_used) from public.agent_runs done where done.agent_id = a.id and done.created_at >= date_trunc('day', now())), 0)))
      from public.agents a where a.id = claimed.agent_id),
    started_at = coalesce(started_at, now()), heartbeat_at = now(), updated_at = now()
  where id = claimed.id returning * into claimed;
  return next claimed;
end;
$$;
revoke all on function public.claim_agent_run() from public, anon, authenticated;
grant execute on function public.claim_agent_run() to service_role;

create function public.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger agent_runs_updated_at before update on public.agent_runs for each row execute function public.touch_updated_at();
