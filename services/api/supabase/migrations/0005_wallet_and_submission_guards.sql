create function public.clear_agent_wallet_verification_on_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.payout_wallet is distinct from old.payout_wallet then
    new.wallet_verified_at = null;
  end if;
  return new;
end;
$$;
create trigger clear_agent_wallet_verification
before update of payout_wallet on public.agents
for each row execute function public.clear_agent_wallet_verification_on_change();

-- Submissions pass through the authenticated API so it can enforce accepted
-- matches, funded budget limits, safe URLs, private storage paths, and audit logs.
drop policy if exists submissions_insert_agent_owner on public.submissions;
revoke insert on public.submissions from authenticated;
