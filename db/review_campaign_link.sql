-- ─────────────────────────────────────────────────────────────────────────────
-- Group the Review Queue + Ready to Send by campaign.
--
-- Seeder `sessions` already carry a campaign_id (db/campaign_seeding_setup.sql).
-- Brand-review submissions live in a SEPARATE table, `shared_results` (one row
-- per "send for review" batch, keyed by its own uuid). Those had no campaign
-- link, so the Review Queue / Ready to Send could only group by brief text.
--
-- This adds shared_results.campaign_id so both views group by the same Campaign
-- entity the rest of the app is built around. Existing rows stay null and show
-- under an "Unassigned" group until moved (via the in-app "Move to campaign"
-- menu). ON DELETE SET NULL: deleting a campaign un-groups its submissions, it
-- never deletes review data.
--
-- Run this once in the Supabase SQL editor. Idempotent — safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.shared_results
  add column if not exists campaign_id uuid references public.campaigns(id) on delete set null;

create index if not exists shared_results_campaign_idx on public.shared_results (campaign_id);
