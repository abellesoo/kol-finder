-- ============================================================================
-- KOL Finder — Multiple assignees per campaign
-- ----------------------------------------------------------------------------
-- Widens campaigns.assigned_to from a single uuid to a uuid[] so a campaign can
-- be owned by several teammates at once. A submission/campaign counts as "mine"
-- (Dashboard "your review", Review Queue "assigned to me") when the current user
-- is ANY of the assignees. null or an empty array both mean "Unassigned".
--
-- Apply in the Supabase SQL editor (Dashboard → SQL). Idempotent — safe to
-- re-run. Depends on db/campaign_assignee.sql (which created the scalar column)
-- and public.users.
--
-- NOTE: arrays can't carry a foreign-key constraint, so the old
-- assigned_to → users(id) FK is dropped. A deleted user simply stops resolving
-- in the picker (their id lingers harmlessly in any array until reassigned);
-- there is no cascade, matching the low frequency of user deletion.
-- ============================================================================

-- ── Convert uuid → uuid[], preserving any existing single assignment ─────────
-- Guarded so a re-run (column already ARRAY) is a no-op. Drops the scalar FK and
-- btree index first, then rewraps each existing value as a one-element array.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'campaigns'
      and column_name = 'assigned_to'
      and data_type = 'uuid'
  ) then
    alter table public.campaigns drop constraint if exists campaigns_assigned_to_fkey;
    drop index if exists public.campaigns_assigned_to_idx;
    alter table public.campaigns
      alter column assigned_to type uuid[]
      using (case when assigned_to is null then null else array[assigned_to] end);
  end if;
end $$;

-- GIN index supports containment queries (assigned_to @> array[uid]) should the
-- app ever filter server-side; client-side filtering works regardless.
create index if not exists campaigns_assigned_to_gin
  on public.campaigns using gin (assigned_to);
