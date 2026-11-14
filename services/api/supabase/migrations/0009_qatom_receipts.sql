-- Qatom purchases made by earner agents while working on a bounty. Rows are
-- written only by the payments worker through POST /internal/qatom/receipts.
create table public.qatom_receipts (
  id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique check (length(idempotency_key) between 1 and 400),
  bounty_id uuid not null references public.bounties(id) on delete restrict,
  agent_id uuid not null references public.agents(id) on delete restrict,
  status text not null check (status in ('completed','pending_approval','rejected')),
  transaction_id text unique check (transaction_id is null or length(transaction_id) between 1 and 200),
  item_id text not null check (length(item_id) between 1 and 200),
  item_name text not null check (length(item_name) <= 300),
  seller text not null check (length(seller) between 1 and 200),
  amount_usd_tdn numeric(18,3) not null check (amount_usd_tdn >= 0),
  approval_url text check (approval_url is null or approval_url ~ '^https://'),
  rejection_reason text check (rejection_reason is null or length(rejection_reason) <= 1000),
  receipt jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'completed' or transaction_id is not null),
  check (status <> 'pending_approval' or approval_url is not null),
  check (status <> 'rejected' or rejection_reason is not null)
);
create index qatom_receipts_bounty_idx on public.qatom_receipts(bounty_id, occurred_at desc);
create index qatom_receipts_agent_idx on public.qatom_receipts(agent_id, occurred_at desc);
create trigger qatom_receipts_updated_at before update on public.qatom_receipts for each row execute function public.set_updated_at();

-- A purchase is fixed once recorded: only a pending approval may move to its
-- final state, and the item, seller, amount and parties never change.
create function public.guard_qatom_receipt_update() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.status <> 'pending_approval' then
    raise exception 'Completed or rejected Qatom receipts are immutable';
  end if;
  if new.idempotency_key is distinct from old.idempotency_key or new.bounty_id is distinct from old.bounty_id
    or new.agent_id is distinct from old.agent_id or new.item_id is distinct from old.item_id
    or new.seller is distinct from old.seller or new.amount_usd_tdn is distinct from old.amount_usd_tdn then
    raise exception 'Qatom receipt purchase details cannot change';
  end if;
  return new;
end;
$$;
create trigger qatom_receipts_guard_update before update on public.qatom_receipts
for each row execute function public.guard_qatom_receipt_update();

create function public.prevent_qatom_receipt_delete() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'Qatom receipts cannot be deleted';
end;
$$;
create trigger qatom_receipts_no_delete before delete on public.qatom_receipts
for each row execute function public.prevent_qatom_receipt_delete();

alter table public.qatom_receipts enable row level security;
create policy qatom_receipts_read_participants on public.qatom_receipts for select to authenticated using (
  exists (select 1 from public.bounties b where b.id = bounty_id and b.requester_id = auth.uid()) or
  exists (select 1 from public.agents a where a.id = agent_id and a.owner_id = auth.uid())
);
grant select on public.qatom_receipts to authenticated;
