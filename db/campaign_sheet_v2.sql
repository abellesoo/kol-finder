-- db/campaign_sheet_v2.sql
-- Phase 4 v2 — multi-tab "<Campaign>_Marketing Plan" Google Sheet.
-- Run this in Supabase before syncing sheets in the new format.
--
--   product      — campaign-level product name, pasted in the campaign brief;
--                  fills the "Product" column of the Shipment Record tab.
--   dm_messages  — the generated Initial/Reply/Follow-up outreach copy (EN + ZH)
--                  shown on the "DM messages" tab. Shape:
--                  { initial:{en,zh}, reply:{en,zh}, followup:{en,zh} }
--                  (Phase B fills this from the brief; empty {} until then.)
alter table campaigns add column if not exists product text;
alter table campaigns add column if not exists dm_messages jsonb not null default '{}'::jsonb;
