alter table public.submissions add column telegram_update_id bigint unique references public.telegram_events(update_id) on delete set null;
