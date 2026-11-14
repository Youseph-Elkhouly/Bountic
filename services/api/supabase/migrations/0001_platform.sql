create extension if not exists pgcrypto;

create type public.user_role as enum ('requester', 'earner');
create type public.bounty_status as enum ('draft', 'funding', 'active', 'review', 'settled', 'refunded', 'expired');
create type public.payment_kind as enum ('funding', 'settlement', 'refund');
create type public.payment_status as enum ('pending', 'confirmed', 'failed');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.user_role,
  display_name text check (display_name is null or length(display_name) <= 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.agents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (length(name) between 1 and 100),
  description text not null check (length(description) <= 4000),
  skills text[] not null default '{}',
  categories text[] not null default '{}',
  capabilities text[] not null default '{}',
  min_reward_base_units numeric(78,0) not null default 0 check (min_reward_base_units >= 0),
  payout_wallet text not null check (payout_wallet ~ '^0x[0-9a-fA-F]{40}$'),
  available boolean not null default true,
  verified_at timestamptz,
  wallet_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index agents_owner_idx on public.agents(owner_id);
create index agents_available_idx on public.agents(available) where available;

create table public.telegram_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  agent_id uuid references public.agents(id) on delete cascade,
  telegram_user_id bigint unique,
  chat_id bigint unique,
  link_token_hash text unique,
  link_expires_at timestamptz,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.bounties (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references public.profiles(id) on delete restrict,
  title text not null check (length(title) between 5 and 160),
  description text not null check (length(description) between 20 and 12000),
  category text not null check (length(category) between 1 and 80),
  required_skills text[] not null default '{}',
  deliverable_requirements text not null check (length(deliverable_requirements) <= 8000),
  max_budget_base_units numeric(78,0) not null check (max_budget_base_units > 0),
  asset_symbol text not null default 'BTC' check (asset_symbol = 'BTC'),
  display_fiat_amount numeric(18,2) check (display_fiat_amount is null or display_fiat_amount > 0),
  display_fiat_currency char(3),
  deadline timestamptz not null,
  status public.bounty_status not null default 'draft',
  external_id text unique,
  onchain_bounty_id numeric(78,0) unique,
  funding_tx_hash text unique check (funding_tx_hash is null or funding_tx_hash ~ '^0x[0-9a-fA-F]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (deadline > created_at),
  check ((display_fiat_amount is null) = (display_fiat_currency is null))
);
create index bounties_requester_idx on public.bounties(requester_id, created_at desc);
create index bounties_active_deadline_idx on public.bounties(deadline) where status = 'active';

create table public.bounty_matches (
  id uuid primary key default gen_random_uuid(),
  bounty_id uuid not null references public.bounties(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  score numeric(6,5) not null check (score >= 0 and score <= 1),
  score_breakdown jsonb not null default '{}'::jsonb,
  notification_status text not null default 'queued' check (notification_status in ('queued','sent','failed','accepted','declined')),
  notified_at timestamptz,
  response_at timestamptz,
  created_at timestamptz not null default now(),
  unique (bounty_id, agent_id)
);
create index bounty_matches_agent_idx on public.bounty_matches(agent_id, created_at desc);

create table public.submissions (
  id uuid primary key default gen_random_uuid(),
  bounty_id uuid not null references public.bounties(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete restrict,
  proposed_amount_base_units numeric(78,0) not null check (proposed_amount_base_units > 0),
  deliverable_type text not null check (deliverable_type in ('file','repository','video','external_link','text')),
  deliverable_url text,
  storage_path text,
  description text not null default '' check (length(description) <= 8000),
  winner boolean not null default false,
  submitted_at timestamptz not null default now(),
  check (deliverable_url is not null or storage_path is not null or deliverable_type = 'text')
);
create index submissions_bounty_idx on public.submissions(bounty_id, submitted_at desc);
create index submissions_agent_idx on public.submissions(agent_id, submitted_at desc);
create unique index one_winner_per_bounty on public.submissions(bounty_id) where winner;

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  bounty_id uuid not null references public.bounties(id) on delete cascade,
  kind public.payment_kind not null,
  status public.payment_status not null default 'pending',
  amount_base_units numeric(78,0) not null check (amount_base_units > 0),
  tx_hash text unique check (tx_hash is null or tx_hash ~ '^0x[0-9a-fA-F]{64}$'),
  block_number numeric(78,0),
  explorer_url text,
  submission_id uuid references public.submissions(id) on delete set null,
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);
create index payments_bounty_idx on public.payments(bounty_id, created_at desc);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_actor_idx on public.audit_logs(actor_id, created_at desc);

create table public.telegram_events (
  update_id bigint primary key,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  status text not null default 'received' check (status in ('received','processing','processed','ignored','failed'))
);

create table public.notification_jobs (
  id bigint generated always as identity primary key,
  bounty_match_id uuid not null unique references public.bounty_matches(id) on delete cascade,
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  sent_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);
create index notification_jobs_pending_idx on public.notification_jobs(available_at) where sent_at is null;

create function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger agents_updated_at before update on public.agents for each row execute function public.set_updated_at();
create trigger telegram_connections_updated_at before update on public.telegram_connections for each row execute function public.set_updated_at();
create trigger bounties_updated_at before update on public.bounties for each row execute function public.set_updated_at();

create function public.create_profile_for_auth_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.create_profile_for_auth_user();

create function public.choose_my_role(next_role public.user_role) returns public.profiles language plpgsql security definer set search_path = '' as $$
declare updated public.profiles;
begin
  update public.profiles set role = next_role, updated_at = now()
  where id = auth.uid() and role is null returning * into updated;
  if updated.id is null then raise exception 'Profile role is already set or profile is missing'; end if;
  return updated;
end;
$$;
grant execute on function public.choose_my_role(public.user_role) to authenticated;

alter table public.profiles enable row level security;
alter table public.agents enable row level security;
alter table public.telegram_connections enable row level security;
alter table public.bounties enable row level security;
alter table public.bounty_matches enable row level security;
alter table public.submissions enable row level security;
alter table public.payments enable row level security;
alter table public.audit_logs enable row level security;
alter table public.telegram_events enable row level security;
alter table public.notification_jobs enable row level security;

create policy profiles_read_self on public.profiles for select to authenticated using (id = auth.uid());
grant select on public.profiles to authenticated;

create policy agents_read_owner on public.agents for select to authenticated using (owner_id = auth.uid());
create policy agents_insert_owner on public.agents for insert to authenticated with check (owner_id = auth.uid() and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'earner'));
create policy agents_update_owner on public.agents for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
revoke insert, update on public.agents from authenticated;
grant select on public.agents to authenticated;
grant insert (owner_id, name, description, skills, categories, capabilities, min_reward_base_units, payout_wallet, available) on public.agents to authenticated;
grant update (name, description, skills, categories, capabilities, min_reward_base_units, payout_wallet, available) on public.agents to authenticated;

create policy telegram_connections_read_owner on public.telegram_connections for select to authenticated using (user_id = auth.uid());
grant select on public.telegram_connections to authenticated;

create policy bounties_read_active_or_owner on public.bounties for select to authenticated using (status = 'active' or requester_id = auth.uid());
create policy bounties_insert_requester on public.bounties for insert to authenticated with check (requester_id = auth.uid() and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'requester'));
create policy bounties_update_owner on public.bounties for update to authenticated using (requester_id = auth.uid()) with check (requester_id = auth.uid());
revoke insert, update on public.bounties from authenticated;
grant select on public.bounties to authenticated;
grant insert (requester_id, title, description, category, required_skills, deliverable_requirements, max_budget_base_units, display_fiat_amount, display_fiat_currency, deadline) on public.bounties to authenticated;
grant update (title, description, category, required_skills, deliverable_requirements, display_fiat_amount, display_fiat_currency, deadline) on public.bounties to authenticated;

create policy bounty_matches_read_participants on public.bounty_matches for select to authenticated using (
  exists (select 1 from public.bounties b where b.id = bounty_id and b.requester_id = auth.uid()) or
  exists (select 1 from public.agents a where a.id = agent_id and a.owner_id = auth.uid())
);
grant select on public.bounty_matches to authenticated;

create policy submissions_read_participants on public.submissions for select to authenticated using (
  exists (select 1 from public.bounties b where b.id = bounty_id and b.requester_id = auth.uid()) or
  exists (select 1 from public.agents a where a.id = agent_id and a.owner_id = auth.uid())
);
create policy submissions_insert_agent_owner on public.submissions for insert to authenticated with check (
  exists (select 1 from public.agents a where a.id = agent_id and a.owner_id = auth.uid())
);
revoke insert on public.submissions from authenticated;
grant select on public.submissions to authenticated;
grant insert (bounty_id, agent_id, proposed_amount_base_units, deliverable_type, deliverable_url, storage_path, description) on public.submissions to authenticated;

create policy payments_read_bounty_participant on public.payments for select to authenticated using (
  exists (select 1 from public.bounties b where b.id = bounty_id and b.requester_id = auth.uid()) or
  exists (select 1 from public.submissions s join public.agents a on a.id = s.agent_id where s.bounty_id = public.payments.bounty_id and a.owner_id = auth.uid())
);
grant select on public.payments to authenticated;

create policy audit_logs_read_actor on public.audit_logs for select to authenticated using (actor_id = auth.uid());
grant select on public.audit_logs to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('bounty-submissions', 'bounty-submissions', false, 52428800,
  array['application/pdf','application/zip','application/x-zip-compressed','image/png','image/jpeg','image/webp','video/mp4','text/plain'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
create policy submission_upload_owner on storage.objects for insert to authenticated
with check (bucket_id = 'bounty-submissions' and (storage.foldername(name))[1] = auth.uid()::text);
create policy submission_read_uploader on storage.objects for select to authenticated
using (bucket_id = 'bounty-submissions' and (storage.foldername(name))[1] = auth.uid()::text);
