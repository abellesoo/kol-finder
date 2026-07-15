-- ============================================================================
-- Campaign Ops Tracker — engagement snapshot columns on verified_posts.
-- ----------------------------------------------------------------------------
-- The verification worker's Apify scrape already returns likes/comments/views
-- on every post item; these columns store that snapshot so the per-campaign
-- Google Sheet can show post engagement. The verify cron (2×/day) and the
-- on-demand "Verify posts" button refresh them for already-posted KOLs.
--
-- BOUNDARY NOTE (perftracker contract, campaign-ops-context.md §6 rule 4):
-- engagement metrics NEVER flow through the perftracker_feed view — these
-- columns are for the seeding sheet only. Do NOT add them to the feed.
--
-- Apply in the Supabase SQL editor. Safe to re-run (add column if not exists).
-- The worker writes these best-effort: verification still works if this
-- migration hasn't been applied yet.
-- ============================================================================

alter table public.verified_posts
  add column if not exists likes_count           integer,
  add column if not exists comments_count        integer,
  add column if not exists views_count           integer,      -- video views/plays; null for images
  add column if not exists engagement_updated_at timestamptz;  -- when the snapshot was last refreshed

comment on column public.verified_posts.likes_count is
  'Engagement snapshot from the verify scrape. Sheet-only — never exposed via perftracker_feed.';
