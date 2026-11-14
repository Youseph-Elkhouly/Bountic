create table public.agent_wallet_challenges (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  wallet_address text not null check (wallet_address ~ '^0x[0-9a-fA-F]{40}$'),
  nonce text not null unique,
  message text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);
create index agent_wallet_challenges_active_idx on public.agent_wallet_challenges(agent_id, expires_at) where used_at is null;
alter table public.agent_wallet_challenges enable row level security;
