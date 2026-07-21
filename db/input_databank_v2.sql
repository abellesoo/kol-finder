-- ============================================================================
-- Input Databank v2 — brands split from run presets.
--
-- v1 (db/input_databank.sql) kept one row per name with two opaque JSON blobs,
-- which conflated durable brand facts with per-campaign inputs: a brand's
-- second campaign either overwrote the first or forced names like
-- "Wellage – July". v2 splits that:
--
--   brands         one row per brand; the facts that survive campaigns
--                  (name / background / product catalogue) live in real
--                  columns so they're queryable and can't drift.
--   brand_presets  one row per saved run under a brand (scrape inputs in
--                  `step1`, campaign scoring config in `step2` — same JSON
--                  shapes as before, minus the brand fields, owned by
--                  src/lib/inputDatabank.js).
--   databank_revisions
--                  trigger-captured copy of every overwritten or deleted row
--                  from both tables, so a save is never destructive. No UI
--                  yet — recover via SQL: filter by src_table + row_id.
--
-- Upserts now go through real unique constraints (citext), so the old
-- select-then-insert race between two teammates saving the same name is gone,
-- and `updated_at` is stamped by a trigger instead of the client clock.
--
-- Team-shared like the campaign tables: any authenticated @markato.com account
-- has full access via public.is_markato() (from db/audit_rls_and_rpc.sql);
-- the anon key is denied. Additive + safe to re-run. Migrates existing
-- input_databank rows (brand fields lifted out of step2; the rest becomes a
-- "Default" preset) and leaves the v1 table in place — drop it manually once
-- you've confirmed the new bar works.
-- ============================================================================

create extension if not exists citext;

-- Shared updated_at stamp — client never sends it.
create or replace function public.databank_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- Copy the pre-image of any update/delete into the revisions table.
create or replace function public.databank_capture_revision()
returns trigger language plpgsql as $$
begin
  insert into public.databank_revisions (src_table, row_id, data, changed_by)
  values (tg_table_name, old.id, to_jsonb(old), auth.uid());
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

-- ── brands — durable facts, real columns ───────────────────────────────────
create table if not exists public.brands (
  id         uuid primary key default gen_random_uuid(),
  name       citext not null unique,   -- citext: "Wellage" and "wellage" are one brand
  background text not null default '',
  products   jsonb not null default '[]'::jsonb,  -- [{ name, points }]
  created_by uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── brand_presets — one saved run per campaign/product under a brand ───────
create table if not exists public.brand_presets (
  id           uuid primary key default gen_random_uuid(),
  brand_id     uuid not null references public.brands(id) on delete cascade,
  name         citext not null default 'Default',
  step1        jsonb not null default '{}'::jsonb,  -- Get-Data scrape inputs
  step2        jsonb not null default '{}'::jsonb,  -- scoring config minus brand fields
  created_by   uuid references auth.users(id) default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  last_used_at timestamptz,                          -- stamped when loaded into the form
  unique (brand_id, name)
);

-- ── databank_revisions — append-only pre-images, never overwritten ─────────
create table if not exists public.databank_revisions (
  id         bigint generated always as identity primary key,
  src_table  text not null,
  row_id     uuid not null,
  data       jsonb not null,
  changed_by uuid,
  changed_at timestamptz not null default now()
);
create index if not exists databank_revisions_row_idx
  on public.databank_revisions (src_table, row_id, changed_at desc);

-- Triggers (drop-first keeps the file re-runnable).
drop trigger if exists brands_set_updated_at on public.brands;
create trigger brands_set_updated_at
  before update on public.brands
  for each row execute function public.databank_set_updated_at();

drop trigger if exists brand_presets_set_updated_at on public.brand_presets;
create trigger brand_presets_set_updated_at
  before update on public.brand_presets
  for each row execute function public.databank_set_updated_at();

drop trigger if exists brands_capture_revision on public.brands;
create trigger brands_capture_revision
  before update or delete on public.brands
  for each row execute function public.databank_capture_revision();

drop trigger if exists brand_presets_capture_revision on public.brand_presets;
create trigger brand_presets_capture_revision
  before update or delete on public.brand_presets
  for each row execute function public.databank_capture_revision();

-- ── RLS — same team-wide policy as the campaign tables ─────────────────────
alter table public.brands enable row level security;
drop policy if exists brands_team_all on public.brands;
create policy brands_team_all on public.brands
  for all using (public.is_markato()) with check (public.is_markato());

alter table public.brand_presets enable row level security;
drop policy if exists brand_presets_team_all on public.brand_presets;
create policy brand_presets_team_all on public.brand_presets
  for all using (public.is_markato()) with check (public.is_markato());

alter table public.databank_revisions enable row level security;
drop policy if exists databank_revisions_team_all on public.databank_revisions;
create policy databank_revisions_team_all on public.databank_revisions
  for all using (public.is_markato()) with check (public.is_markato());

-- ── Migrate v1 rows (no-op when input_databank is absent or already moved) ─
do $$
begin
  if to_regclass('public.input_databank') is null then return; end if;

  insert into public.brands (name, background, products, created_by, created_at, updated_at)
  select
    coalesce(nullif(d.step2->>'brandName', ''), d.name),
    coalesce(d.step2->>'brandBackground', ''),
    coalesce(d.step2->'products', '[]'::jsonb),
    d.created_by, d.created_at, d.updated_at
  from public.input_databank d
  on conflict (name) do nothing;

  -- Preset name: 'Default' when the v1 entry was named after the brand itself;
  -- otherwise keep the entry name (e.g. "Wellage – July" becomes a preset
  -- called that under brand Wellage) so two entries for one brand both survive.
  insert into public.brand_presets (brand_id, name, step1, step2, created_by, created_at, updated_at)
  select
    b.id,
    case when b.name = d.name::citext then 'Default' else d.name end,
    d.step1,
    d.step2 - 'brandName' - 'brandBackground' - 'products',
    d.created_by, d.created_at, d.updated_at
  from public.input_databank d
  join public.brands b on b.name = coalesce(nullif(d.step2->>'brandName', ''), d.name)
  on conflict (brand_id, name) do nothing;
end $$;
