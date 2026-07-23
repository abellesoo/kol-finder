-- ============================================================================
-- Creator Vault — a persistent, team-shared library of creators worth reusing.
-- ----------------------------------------------------------------------------
-- Apply in the Supabase SQL editor (Dashboard → SQL). Run top to bottom.
-- Safe to re-run: every statement is guarded (if not exists / drop-then-create).
--
-- DEPENDENCY: the team-access RLS below calls public.is_markato(), defined in
-- db/audit_rls_and_rpc.sql (the production security baseline). Run that file
-- first. If you haven't, run the table + index (through the "── indexes ──"
-- line) and come back to RLS after applying the audit migration.
--
-- WHY THIS TABLE EXISTS: kol-finder has no `kols` table — a creator only ever
-- existed transiently inside a scoring run (shared_results.accounts JSONB) or as
-- a campaign_kols row. The Vault is the first durable home for a creator: you
-- manually "star" the good ones so a find survives the run it came from, then
-- reuse them by dropping them into a campaign (attachKols) without re-scraping.
--
-- IDENTITY: a creator is identified by their normalized handle + platform (same
-- canonical form as campaign_kols.kol_handle — see campaigns.js normalizeHandle).
-- unique(handle, platform) makes re-starring the same creator an idempotent
-- upsert, so the Vault is naturally deduped.
--
-- METRICS ARE A SNAPSHOT: follower_count / avg_likes / ai_score are captured at
-- save time and go stale. The UI shows them with an "as of <created_at>" label.
-- A live "refresh from Instagram" (Apify re-scrape) is a future addition.
-- ============================================================================

create table if not exists public.creator_vault (
  id             uuid primary key default gen_random_uuid(),
  handle         text not null,                    -- normalizeHandle() — canonical id
  platform       text not null default 'instagram',-- instagram | threads
  display_name   text,                             -- fullName at save time
  -- snapshot metrics (stale over time; shown "as of" created_at) ──────────────
  follower_count integer,
  avg_likes      numeric,
  ai_score       numeric,
  niche_tags     text[] not null default '{}',     -- from the run's config.niches
  profile_url    text,
  -- provenance + attribution ──────────────────────────────────────────────────
  source_run_id  uuid references public.shared_results(id) on delete set null,
  notes          text,
  added_by       uuid references public.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  -- Re-starring the same creator is a no-op upsert rather than a duplicate row.
  unique (handle, platform)
);

-- ── indexes ───────────────────────────────────────────────────────────────────
-- The Vault tab lists newest-first and filters by niche tag.
create index if not exists creator_vault_created_idx
  on public.creator_vault (created_at desc);
create index if not exists creator_vault_niche_idx
  on public.creator_vault using gin (niche_tags);

-- ============================================================================
-- Row-Level Security — team-shared, same model as campaigns/shared_results:
-- any authenticated @markato.com Google account has full access; everyone else
-- (incl. the anon key) is denied. Requires public.is_markato() from
-- db/audit_rls_and_rpc.sql.
-- ============================================================================

alter table public.creator_vault enable row level security;

drop policy if exists creator_vault_team_all on public.creator_vault;
create policy creator_vault_team_all on public.creator_vault
  for all using (public.is_markato()) with check (public.is_markato());
