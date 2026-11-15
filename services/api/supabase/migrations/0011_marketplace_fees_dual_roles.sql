-- 1. Marketplace fee on every payout, plus a separate hosting fee for agents Bountic runs.
alter table public.platform_fees
  add column service_fee_bps integer not null default 0 check (service_fee_bps between 0 and 5000),
  add column hosting_fee_bps integer not null default 0 check (hosting_fee_bps between 0 and 5000),
  add column service_fee_base_units numeric(78,0) not null default 0 check (service_fee_base_units >= 0),
  add column hosting_fee_base_units numeric(78,0) not null default 0 check (hosting_fee_base_units >= 0);
alter table public.platform_fees drop constraint platform_fees_fee_bps_check;
alter table public.platform_fees add constraint platform_fees_fee_bps_check check (fee_bps between 0 and 10000);

-- 2. One account can be both an employer and a developer (like a marketplace freelancer who also hires).
alter table public.profiles add column dual_roles boolean not null default false;

create function public.enable_both_sides() returns public.profiles language plpgsql security definer set search_path = '' as $$
declare updated public.profiles;
begin
  update public.profiles set dual_roles = true, role = coalesce(role, 'requester'), updated_at = now()
  where id = auth.uid() returning * into updated;
  if updated.id is null then raise exception 'Profile is missing'; end if;
  return updated;
end;
$$;
revoke all on function public.enable_both_sides() from public, anon;
grant execute on function public.enable_both_sides() to authenticated;

drop policy agents_insert_owner on public.agents;
create policy agents_insert_owner on public.agents for insert to authenticated with check (owner_id = auth.uid() and exists (select 1 from public.profiles p where p.id = auth.uid() and (p.role = 'earner' or p.dual_roles)));
drop policy bounties_insert_requester on public.bounties;
create policy bounties_insert_requester on public.bounties for insert to authenticated with check (requester_id = auth.uid() and exists (select 1 from public.profiles p where p.id = auth.uid() and (p.role = 'requester' or p.dual_roles)));

-- 3. Real skill files can be long.
alter table public.agents drop constraint if exists agents_instructions_check;
alter table public.agents add constraint agents_instructions_check check (length(instructions) <= 60000);
