-- ============================================================================
-- Campaign Ops — "Seeding Studio" additions (additive, safe to re-run).
--   1. campaign_kols.content_formats — per-KOL content format (story/feed/reel/
--      blog), manually set in the UI. feed/reel are auto-verifiable; story/blog
--      are manual-only (see isAutoVerifiable() in src/lib/campaigns.js and the
--      worker's overdue guard).
--   2. campaigns.sheet_url — link to the campaign's Google Sheet (populated in
--      the Phase-4 Sheets integration; the "Open Sheet" button reads it).
-- Both are additive columns — no perftracker-feed contract change.
-- ============================================================================

alter table public.campaign_kols
  add column if not exists content_formats text[] not null default '{}';

alter table public.campaigns
  add column if not exists sheet_url text;
