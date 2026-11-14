-- The profile trigger only runs for auth users created after migration 0001.
-- Backfill accounts that already existed when the platform schema was applied.
insert into public.profiles (id)
select id from auth.users
on conflict (id) do nothing;
