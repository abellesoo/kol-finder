-- db/campaign_budget.sql
-- Campaign budget + seeding target.
-- Run this in Supabase before the budget feature works.
--
--   budget       — total money allocated to the campaign (KOL fees + product cost).
--                  Spend is rolled up client-side from campaign_kols.agreed_fee +
--                  campaign_kols.product_value; this is the ceiling to compare against.
--   target_kols  — approximate desired number of creators to seed on the campaign.
--                  Drives the per-creator allowance (budget / target_kols) and the
--                  "seeded vs target" progress shown on the dashboard + sheet.
-- Safe to re-run: both statements are guarded.
alter table campaigns add column if not exists budget numeric;
alter table campaigns add column if not exists target_kols int;
