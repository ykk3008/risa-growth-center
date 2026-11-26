-- Growth Center persistence: an append-friendly record store.
-- Every row of every logical table (brands, interactions, opp_history, tasks, ...) is one JSONB document.
-- Source rows are kept verbatim (incl. import-retry duplicates); edits to history tables are appended as new versions.
create table if not exists public.records (
  seq         bigserial primary key,
  table_name  text        not null,
  record_id   text        not null,
  data        jsonb       not null,
  created_at  timestamptz not null default now()
);
create index if not exists records_table_record_idx on public.records (table_name, record_id);

-- Only the server (service-role key) reads/writes. RLS on with no policies = anon/public clients get nothing.
alter table public.records enable row level security;

-- Newer Supabase projects do not auto-grant table privileges to the server role. The app uses the
-- service-role / secret key on the server only, so grant it explicitly (anon/authenticated get nothing).
grant usage on schema public to service_role;
grant select, insert, update, delete on public.records to service_role;
grant usage, select on sequence public.records_seq_seq to service_role;
