-- ============================================================================
-- Campaign Seeding Setup — promote `campaigns` to the top-level entity that owns
-- Seeder sessions and holds the saved setup that pre-fills each new run.
-- ----------------------------------------------------------------------------
-- Apply in the Supabase SQL editor (Dashboard → SQL). Run top to bottom.
-- Safe to re-run: every statement is guarded (if not exists / do-block checks).
--
-- WHAT CHANGES & WHY:
--   • The existing `campaigns` table (Campaign Ops — db/campaign_ops_schema.sql)
--     becomes the ONE entity spanning setup → review → ops. It already owns a
--     Google Sheet (campaigns.sheet_url) and a KOL pipeline; we add the setup
--     fields so a campaign also pre-fills the Seeder's Step 1.
--   • A campaign hangs under a durable `brand` (db/input_databank_v2.sql) via a
--     new brand_id FK. Brand facts (background / products) stay on `brands`;
--     the per-campaign setup (audience / keywords / location / scrape history)
--     lives on the campaign as default_step1 / default_step2 JSON — the SAME
--     shapes the databank already used, so src/lib/inputDatabank.js adapters are
--     reused unchanged.
--   • `sessions` gets a campaign_id FK. Copied-defaults model: a new session
--     COPIES the campaign's defaults into its own config snapshot and may
--     diverge; editing a campaign affects FUTURE sessions only.
--
-- MIGRATION OF EXISTING DATA:
--   • brand_presets → campaigns: every saved databank preset becomes a campaign
--     under its brand (its role folds into the campaign). Idempotent via a
--     NOT EXISTS guard. The brand_presets table is LEFT IN PLACE until you've
--     confirmed the new flow (mirrors how v2 left input_databank behind).
--   • Existing sessions: NOT backfilled — campaign_id null renders as
--     "Ungrouped" and History keeps working. An OPTIONAL backfill block is at
--     the bottom, commented out — run it by hand if the ungrouped list gets
--     noisy.
--
-- Team-shared RLS already exists on campaigns/sessions (public.is_markato()),
-- so no new policies are needed here. Additive + safe to re-run.
-- ============================================================================

-- ── 1. Campaign setup columns ──────────────────────────────────────────────
alter table public.campaigns
  add column if not exists brand_id      uuid references public.brands(id) on delete set null,
  add column if not exists default_step1 jsonb not null default '{}'::jsonb,  -- scrape history: { platforms, scrapeInput, painpointInput, genreInput, resultsLimit }
  add column if not exists default_step2 jsonb not null default '{}'::jsonb;  -- scoring config: { targetAudience, targetKeywords, locationTarget, niches, ... }

comment on column public.campaigns.brand_id      is 'Durable brand parent (public.brands). Brand facts live there; campaign setup lives here.';
comment on column public.campaigns.default_step1 is 'Editable scrape-input defaults new sessions copy (STEP1_FIELDS in src/lib/inputDatabank.js).';
comment on column public.campaigns.default_step2 is 'Editable scoring-config defaults new sessions copy (CAMPAIGN_FIELDS in src/lib/inputDatabank.js).';

-- ── 2. Relax NOT NULLs that block creating a campaign at Step 1 ─────────────
-- A campaign is now created at setup time, before deadline / market / brand are
-- necessarily known — those ops fields fill in later. Existing rows keep values.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='campaigns'
               and column_name='posting_deadline' and is_nullable='NO') then
    alter table public.campaigns alter column posting_deadline drop not null;
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='campaigns'
               and column_name='brand' and is_nullable='NO') then
    alter table public.campaigns alter column brand drop not null;
  end if;
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='campaigns'
               and column_name='market' and is_nullable='NO') then
    alter table public.campaigns alter column market drop not null;
  end if;
end $$;

-- ── 3. Link Seeder sessions to a campaign ──────────────────────────────────
-- sessions has no schema file (created ad hoc); guard on its existence so this
-- migration is safe to run in any environment.
do $$
begin
  if to_regclass('public.sessions') is null then
    raise notice 'public.sessions not found — skipping campaign_id column.';
    return;
  end if;
  alter table public.sessions
    add column if not exists campaign_id uuid references public.campaigns(id) on delete set null;
  create index if not exists sessions_campaign_idx on public.sessions (campaign_id);
end $$;

-- ── 4. Backfill brand_id for existing ops campaigns ────────────────────────
-- Link any campaign whose free-text `brand` matches a known brand (citext ⇒
-- case-insensitive). Leaves unmatched ones null (no brand row to point at).
update public.campaigns c
set brand_id = b.id
from public.brands b
where c.brand_id is null
  and c.brand is not null
  and b.name = c.brand::citext;

-- ── 5. Migrate brand_presets → campaigns ───────────────────────────────────
-- Each saved preset becomes a campaign under its brand. Name is the brand name
-- for a "Default" preset, else "<brand> · <preset>" so multiple presets under
-- one brand stay distinct. Idempotent: NOT EXISTS keeps re-runs from duplicating
-- (campaigns has no unique(brand_id,name) constraint by design — legacy ops
-- campaigns may repeat names).
do $$
begin
  if to_regclass('public.brand_presets') is null then
    raise notice 'public.brand_presets not found — nothing to migrate.';
    return;
  end if;

  insert into public.campaigns
    (name, brand, brand_id, campaign_type, status, default_step1, default_step2, created_at)
  select
    case when p.name::text = 'Default' then b.name::text
         else b.name::text || ' · ' || p.name::text end,
    b.name::text,
    b.id,
    'gifted',
    'active',
    coalesce(p.step1, '{}'::jsonb),
    coalesce(p.step2, '{}'::jsonb),
    p.created_at
  from public.brand_presets p
  join public.brands b on b.id = p.brand_id
  where not exists (
    select 1 from public.campaigns c
    where c.brand_id = p.brand_id
      and c.name = case when p.name::text = 'Default' then b.name::text
                        else b.name::text || ' · ' || p.name::text end
  );
end $$;

-- ============================================================================
-- OPTIONAL — backfill existing sessions into a campaign per brand name.
-- Off by default (sessions with a null campaign_id show as "Ungrouped" and work
-- fine). Uncomment and run by hand if you want historical runs grouped.
-- Groups by sessions.config->>'brandName'; sessions with no brand line stay
-- ungrouped. Reuses a matching migrated campaign where one exists.
-- ============================================================================
-- do $$
-- declare r record; cid uuid;
-- begin
--   for r in
--     select distinct nullif(trim(config->>'brandName'), '') as brand_name
--     from public.sessions
--     where campaign_id is null and nullif(trim(config->>'brandName'), '') is not null
--   loop
--     select id into cid from public.campaigns
--       where brand = r.brand_name order by created_at limit 1;
--     if cid is null then
--       insert into public.campaigns (name, brand, status)
--         values (r.brand_name || ' (imported)', r.brand_name, 'active')
--         returning id into cid;
--     end if;
--     update public.sessions
--       set campaign_id = cid
--       where campaign_id is null and trim(config->>'brandName') = r.brand_name;
--   end loop;
-- end $$;
