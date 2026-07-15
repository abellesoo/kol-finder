-- ============================================================================
-- Campaign Ops Tracker — recipient shipping address per campaign KOL.
-- ----------------------------------------------------------------------------
-- Feeds the "SF bulk file" export: one click builds the Excel a manager uploads
-- on SF Express HK's online bulk-shipment (批量寄件) page, so addresses are
-- typed once here instead of once per parcel on SF's order form. SF generates
-- the waybills; the manager prints and sticks them. No SF API/credentials.
--
-- Apply in the Supabase SQL editor. Safe to re-run.
-- ============================================================================

alter table public.campaign_kols
  add column if not exists recipient_name    text,
  add column if not exists recipient_phone   text,
  add column if not exists recipient_address text;

comment on column public.campaign_kols.recipient_address is
  'Shipping address for seeding parcels. Exported to the SF Express bulk-order Excel.';
