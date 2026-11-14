create table public.settlement_authorizations (
  id uuid primary key default gen_random_uuid(),
  bounty_id uuid not null unique references public.bounties(id) on delete restrict,
  submission_id uuid not null references public.submissions(id) on delete restrict,
  requester_id uuid not null references public.profiles(id) on delete restrict,
  recipient_wallet text not null check (recipient_wallet ~ '^0x[0-9a-fA-F]{40}$'),
  payout_amount_base_units numeric(78,0) not null check (payout_amount_base_units > 0),
  created_at timestamptz not null default now()
);
alter table public.settlement_authorizations enable row level security;

create function public.authorize_bounty_winner(target_bounty uuid, target_submission uuid, actor uuid)
returns public.settlement_authorizations
language plpgsql security definer set search_path = '' as $$
declare
  bounty_row public.bounties;
  submission_row public.submissions;
  agent_row public.agents;
  authorization_row public.settlement_authorizations;
begin
  select * into bounty_row from public.bounties where id = target_bounty for update;
  if bounty_row.id is null or bounty_row.requester_id <> actor or bounty_row.status not in ('active','review') then
    raise exception 'Requester is not authorized to select a winner for this bounty';
  end if;
  select * into submission_row from public.submissions where id = target_submission and bounty_id = target_bounty for update;
  if submission_row.id is null or submission_row.proposed_amount_base_units > bounty_row.max_budget_base_units then
    raise exception 'Submission is invalid or exceeds the funded budget';
  end if;
  select * into agent_row from public.agents where id = submission_row.agent_id;
  if agent_row.id is null or agent_row.wallet_verified_at is null then
    raise exception 'Agent payout wallet has not been verified';
  end if;
  insert into public.settlement_authorizations (bounty_id, submission_id, requester_id, recipient_wallet, payout_amount_base_units)
  values (target_bounty, target_submission, actor, agent_row.payout_wallet, submission_row.proposed_amount_base_units)
  on conflict (bounty_id) do nothing;
  select * into authorization_row from public.settlement_authorizations where bounty_id = target_bounty;
  if authorization_row.submission_id <> target_submission or authorization_row.requester_id <> actor then
    raise exception 'A different settlement is already authorized for this bounty';
  end if;
  update public.submissions set winner = (id = target_submission) where bounty_id = target_bounty;
  update public.bounties set status = 'review' where id = target_bounty;
  return authorization_row;
end;
$$;
revoke all on function public.authorize_bounty_winner(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.authorize_bounty_winner(uuid, uuid, uuid) to service_role;

create function public.prevent_settlement_authorization_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Settlement authorizations are immutable';
end;
$$;
create trigger settlement_authorizations_immutable
before update or delete on public.settlement_authorizations
for each row execute function public.prevent_settlement_authorization_mutation();
