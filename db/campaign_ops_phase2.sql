-- ============================================================================
-- Campaign Ops Tracker — Phase 2 migration (OPTIONAL, additive).
-- ----------------------------------------------------------------------------
-- Phase 2 (verification worker, human-verify toggle, overdue nudges) needs NO
-- new tables — it reuses verified_posts + nudges from campaign_ops_schema.sql.
-- This one column is purely for observability: "when did the worker last scrape
-- this KOL?". The worker stamps it best-effort, so skipping this file does not
-- break verification. Safe to re-run.
-- ============================================================================

alter table public.campaign_kols
  add column if not exists last_checked_at timestamptz;

-- ── Dedupe scope fix for verified_posts ───────────────────────────────────────
-- The original schema put a GLOBAL unique on post_shortcode, so the same KOL
-- enrolled in two campaigns who posts once → only the first campaign records the
-- post. Dedupe must be per campaign_kol. This swaps the constraint in place on
-- already-deployed DBs (fresh installs get it straight from campaign_ops_schema.sql).
-- Re-runnable.
alter table public.verified_posts
  drop constraint if exists verified_posts_post_shortcode_key;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'verified_posts_campaign_kol_id_post_shortcode_key'
  ) then
    alter table public.verified_posts
      add constraint verified_posts_campaign_kol_id_post_shortcode_key
      unique (campaign_kol_id, post_shortcode);
  end if;
end $$;

-- ── HOW THE WORKER AUTHENTICATES (no schema change, just a reminder) ──────────
-- The cron/verify engine runs with no logged-in user, so is_markato() (which
-- reads the caller's JWT email) is FALSE for it. It therefore talks to PostgREST
-- with the Supabase SERVICE_ROLE key, which bypasses RLS entirely. No extra
-- policy is needed. Set it as a Worker secret, never in the client bundle:
--   wrangler secret put SUPABASE_SERVICE_ROLE_KEY
-- (Option (a) from campaign_ops_schema.sql's Phase 2 note.)
