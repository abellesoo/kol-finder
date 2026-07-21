-- ============================================================================
-- Input Databank — a shared, reusable store of Seeder run inputs so a repeat
-- run for the same brand / campaign / product doesn't have to be re-typed.
--
-- One row per named entry (usually the brand). `step1` holds the Get-Data
-- scrape inputs (URLs / hashtags / Threads terms / platforms / limit); `step2`
-- holds the Configure-scoring form (same shape as the old localStorage presets).
-- Both are opaque JSON to Postgres — the shape is owned by src/lib/inputDatabank.js.
--
-- Team-shared like the campaign tables: any authenticated @markato.com account
-- has full access via public.is_markato() (from db/audit_rls_and_rpc.sql);
-- the anon key is denied. Additive + safe to re-run.
-- ============================================================================

create table if not exists public.input_databank (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  step1      jsonb not null default '{}'::jsonb,
  step2      jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Upsert-by-name (case-insensitive): saving "Wellage" twice updates in place
-- instead of piling up duplicates. Matches the old preset behavior.
create unique index if not exists input_databank_name_key
  on public.input_databank (lower(name));

alter table public.input_databank enable row level security;

drop policy if exists input_databank_team_all on public.input_databank;
create policy input_databank_team_all on public.input_databank
  for all using (public.is_markato()) with check (public.is_markato());
