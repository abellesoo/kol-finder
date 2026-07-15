-- ============================================================================
-- Campaign Ops Tracker — SF Express shipment tracking (manual).
-- ----------------------------------------------------------------------------
-- One text column: the SF waybill/tracking number a manager pastes in when the
-- product ships. The UI renders a one-click "Track" link to SF Express's public
-- waybill page — no SF Open Platform account, API credentials, or webhooks
-- needed. (A full SF BSP API integration was considered and deferred: it
-- requires a Markato SF business account + developer credentials, which don't
-- exist today. This column is forward-compatible with that — the API version
-- would key off the same number.)
--
-- Apply in the Supabase SQL editor. Safe to re-run.
-- ============================================================================

alter table public.campaign_kols
  add column if not exists tracking_number text;

comment on column public.campaign_kols.tracking_number is
  'SF Express waybill number (manual entry). UI links to SF''s public tracking page.';
