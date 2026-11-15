-- One settlement transaction emits both winner and refund amounts. Keep one
-- auditable row per payment kind while preventing duplicate rows per kind/hash.
alter table public.payments drop constraint if exists payments_tx_hash_key;
create unique index payments_tx_hash_kind_key on public.payments(tx_hash, kind);
