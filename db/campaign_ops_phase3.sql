-- ============================================================================
-- Campaign Ops Tracker — Phase 3 migration: perftracker_feed view + read role.
-- ----------------------------------------------------------------------------
-- This is the DATA CONTRACT to Michelle's perftracker (repo:
-- michellesplayground/performance-tracker). It exposes ONE read-only view that
-- her analytics layer consumes: the verified-post dataset she has no other
-- source for. See campaign-ops-context.md §6 for the full contract.
--
-- Apply in the Supabase SQL editor (Dashboard → SQL). Run top to bottom.
-- Safe to re-run: create-or-replace + guarded grants.
--
-- DEPENDENCY: campaign_ops_schema.sql (the 4 tables) must exist first.
--
-- CONTRACT RULES (do not break without telling Michelle — additive changes only):
--   1. Rows with human_verified = false are PROVISIONAL. perftracker may ingest
--      but should mark them unconfirmed.
--   2. post_shortcode is the stable dedupe key across both systems.
--   3. Overdue is determined ONLY on this side. perftracker consumes is_overdue
--      rather than re-deriving it from missing placements.
--   4. Engagement metrics NEVER flow through this contract — her collectors pull
--      them from the platform on their own decay schedule.
--   5. Schema changes are additive only (new columns fine; no renames/removals).
-- ============================================================================

-- ── perftracker_feed ──────────────────────────────────────────────────────────
-- One row per (campaign_kol × verified_post). A KOL with no post yet still
-- appears once (post_* columns null) so perftracker sees the full roster,
-- including who is still awaiting / overdue.
--
-- NOTE ON RLS: the base tables (campaign_kols, campaigns, verified_posts) have
-- row-level security requiring public.is_markato(). This view is created by the
-- SQL-editor role (postgres), which OWNS those tables; table owners bypass RLS
-- (we use `enable`, not `force`, row level security). With the default
-- security_invoker = false, the view runs with the owner's rights, so the
-- dedicated read role below can select the feed WITHOUT an @markato JWT — which
-- is exactly what a headless perftracker pull needs. We deliberately do NOT set
-- security_invoker = true here.
create or replace view public.perftracker_feed as
select
  c.id                                               as a_campaign_id,   -- a_ = "annabelle-side" id
  c.name                                             as campaign_name,
  c.brand,
  c.market,
  c.campaign_type,
  ck.kol_handle                                      as a_kol_id,        -- KOL identity = IG handle (no per-KOL uuid exists)
  ck.kol_handle                                      as kol_handle,
  ck.tier,
  ck.agreed_fee,                                                          -- → perftracker spend (KOL fees)
  ck.product_value,                                                       -- → spend (gifted product cost)
  ck.state,
  ck.shipped_at,
  coalesce(ck.deadline_override, c.posting_deadline) as effective_deadline,
  (ck.state = 'overdue')                             as is_overdue,      -- consume this; don't re-derive
  vp.post_url,                                                            -- → placement registration (kind='kol')
  vp.post_shortcode,
  vp.posted_at,
  vp.detected_at,                                                         -- for incremental pulls (see JSON fallback)
  vp.human_verified
from public.campaign_kols ck
join public.campaigns c        on c.id = ck.campaign_id
left join public.verified_posts vp on vp.campaign_kol_id = ck.id;

comment on view public.perftracker_feed is
  'Data contract → perftracker. Read-only. is_overdue/post_shortcode/human_verified '
  'per campaign-ops-context.md §6. Additive changes only; coordinate renames with Michelle.';

-- ── Dedicated read-only role for perftracker ──────────────────────────────────
-- Michelle connects with this role. It can SELECT the feed view and NOTHING
-- else (no base-table access, no writes). Guarded so re-running is safe.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'perftracker_reader') then
    -- NOLOGIN by default; give it a password out-of-band (never commit one):
    --   alter role perftracker_reader with login password '<generated>';
    create role perftracker_reader nologin;
  end if;
end $$;

-- The role needs USAGE on the schema and SELECT on the view only.
grant usage  on schema public          to perftracker_reader;
grant select on public.perftracker_feed to perftracker_reader;

-- Do NOT grant the base tables. RLS-bypass happens via the view owner (see the
-- RLS note above), so the reader never needs — and must not get — direct table
-- access. Also keep the feed off the anon/authenticated PostgREST roles unless
-- you deliberately want it web-exposed:
revoke all on public.perftracker_feed from anon, authenticated;

-- ── DELIVERY MODES (per campaign-ops-context.md §6) ───────────────────────────
-- A. Read-only view (THIS FILE — the default/preferred contract). Michelle
--    connects with perftracker_reader and `select * from perftracker_feed`,
--    or filters incrementally: `where detected_at > :last_pull`.
-- B. JSON endpoint (fallback, if she can't reach Postgres directly): a
--    Bearer-token GET on the worker returning this same row shape, with
--    ?since=<iso8601> filtering on detected_at. Not built until she asks —
--    it's a thin read over this exact view. See worker/PHASE3_PERFTRACKER_FEED.md.
-- ============================================================================
