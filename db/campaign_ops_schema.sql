-- ============================================================================
-- Campaign Ops Tracker — Phase 1 schema (campaigns, campaign_kols,
-- verified_posts, nudges) + index + team RLS.
-- ----------------------------------------------------------------------------
-- Apply in the Supabase SQL editor (Dashboard → SQL). Run top to bottom.
-- Safe to re-run: every statement is guarded (if not exists / drop-then-create).
--
-- DEPENDENCY: the team-access RLS below calls public.is_markato(), which is
-- defined in db/audit_rls_and_rpc.sql. Run that file first (it's already the
-- production security baseline). If you haven't, the RLS section will error —
-- run the tables + index (through the "── indexes ──" line) and come back to
-- RLS after applying the audit migration.
--
-- KOL IDENTITY NOTE: kol-finder has no `kols` table. Approved KOLs are JSONB on
-- shared_results, identified by their Instagram handle (accounts[i].username /
-- review_state key). So campaign_kols references a KOL by kol_handle (text),
-- NOT a uuid FK, and optionally records the run it was approved in via
-- kol_run_id → shared_results(id). See campaign-ops-context.md §6.
-- ============================================================================

-- ── campaigns ────────────────────────────────────────────────────────────────
create table if not exists public.campaigns (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,                  -- e.g. 'LILYEVE TW Seeding Wave 2'
  brand            text not null,                  -- WELLAGE | LILYEVE | BB LAB | ...
  market           text not null,                  -- HK | TW | SG | ...
  campaign_type    text not null default 'gifted', -- gifted | paid | mixed
  start_date       date,
  posting_deadline date not null,                  -- default deadline for all KOLs
  hashtags         text[] default '{}',            -- signals for post detection
  mention_handles  text[] default '{}',            -- e.g. {lilyeve_tw}
  status           text not null default 'active', -- active | closed
  created_at       timestamptz not null default now()
);

-- ── campaign_kols: per-KOL pipeline state ─────────────────────────────────────
create table if not exists public.campaign_kols (
  id                uuid primary key default gen_random_uuid(),
  campaign_id       uuid not null references public.campaigns(id) on delete cascade,
  kol_handle        text not null,                 -- IG username = canonical KOL id
  kol_run_id        uuid references public.shared_results(id), -- optional: approval run
  tier              text not null default 'A',     -- A = gifted-only | B = paid/open
  agreed_fee        numeric not null default 0,    -- 0 for gifted
  product_value     numeric default 0,             -- retail value of seeded product
  state             text not null default 'approved',
    -- approved → shipped → awaiting_post → posted | overdue | opted_out
  shipped_at        date,
  deadline_override date,                           -- per-KOL deadline if ≠ campaign
  notes             text,
  updated_at        timestamptz not null default now(),
  unique (campaign_id, kol_handle)
);

-- ── verified_posts: output of the verification worker ─────────────────────────
create table if not exists public.verified_posts (
  id               uuid primary key default gen_random_uuid(),
  campaign_kol_id  uuid not null references public.campaign_kols(id) on delete cascade,
  platform         text not null default 'instagram',
  post_url         text not null,
  post_shortcode   text,                            -- IG shortcode for dedupe
  posted_at        timestamptz,
  detected_at      timestamptz not null default now(),
  detection_method text not null,                   -- apify_mention | apify_hashtag | manual
  matched_signals  text[] default '{}',             -- which tags/hashtags hit
  human_verified   boolean not null default false,  -- brand-manager confirm toggle
  -- Dedupe is PER campaign_kol, not global: the same shortcode can legitimately
  -- belong to one KOL enrolled in two different campaigns.
  unique (campaign_kol_id, post_shortcode)
);

-- ── nudges: overdue reminder drafts (copy-paste send; Meta API paused) ────────
create table if not exists public.nudges (
  id               uuid primary key default gen_random_uuid(),
  campaign_kol_id  uuid not null references public.campaign_kols(id) on delete cascade,
  draft_text       text not null,
  language         text not null,                   -- zh-TW | zh-HK | en
  created_at       timestamptz not null default now(),
  sent_manually_at timestamptz                      -- user marks after sending
);

-- ── indexes ───────────────────────────────────────────────────────────────────
-- Worker + board query campaign_kols by (campaign, state) constantly.
create index if not exists campaign_kols_campaign_state_idx
  on public.campaign_kols (campaign_id, state);

-- ============================================================================
-- Row-Level Security — team-shared, same model as sessions/shared_results:
-- any authenticated @markato.com Google account has full access; everyone
-- else (incl. the anon key) is denied. Requires public.is_markato() from
-- db/audit_rls_and_rpc.sql.
-- ============================================================================

alter table public.campaigns      enable row level security;
alter table public.campaign_kols  enable row level security;
alter table public.verified_posts enable row level security;
alter table public.nudges         enable row level security;

drop policy if exists campaigns_team_all on public.campaigns;
create policy campaigns_team_all on public.campaigns
  for all using (public.is_markato()) with check (public.is_markato());

drop policy if exists campaign_kols_team_all on public.campaign_kols;
create policy campaign_kols_team_all on public.campaign_kols
  for all using (public.is_markato()) with check (public.is_markato());

drop policy if exists verified_posts_team_all on public.verified_posts;
create policy verified_posts_team_all on public.verified_posts
  for all using (public.is_markato()) with check (public.is_markato());

drop policy if exists nudges_team_all on public.nudges;
create policy nudges_team_all on public.nudges
  for all using (public.is_markato()) with check (public.is_markato());

-- ── NOTE ON THE VERIFICATION WORKER (Phase 2) ────────────────────────────────
-- The Cloudflare Worker writes verified_posts/updates campaign_kols on a cron
-- with no logged-in user, so is_markato() (which reads the caller's JWT email)
-- will be FALSE for it. Options when you build Phase 2:
--   (a) worker uses the Supabase service_role key (bypasses RLS) — simplest; or
--   (b) add a dedicated worker JWT + a policy that recognizes it.
-- Not needed for Phase 1 (UI runs as a real @markato user).

-- ── perftracker_feed VIEW is Phase 3, not here — see campaign-ops-context.md §6.
