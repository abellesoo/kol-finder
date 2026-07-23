-- ============================================================================
-- KOL Finder — Campaign assignment
-- ----------------------------------------------------------------------------
-- Gives each campaign an owning brand manager, so the Dashboard's "your review"
-- counts and the Review Queue can filter to a person. Reviews (shared_results)
-- inherit an owner through their campaign_id — there is no per-submission
-- assignee, by design (one assignment per campaign covers all its runs).
--
-- Apply in the Supabase SQL editor (Dashboard → SQL). Idempotent — safe to
-- re-run. Depends on public.users, public.campaigns, and public.is_markato()
-- (db/audit_rls_and_rpc.sql).
-- ============================================================================

-- ── The assignee column ──────────────────────────────────────────────────────
-- ON DELETE SET NULL: removing a user returns their campaigns to "Unassigned"
-- rather than deleting them. campaigns_team_all (campaign_ops_schema.sql) already
-- lets any @markato user UPDATE a campaign, so no new write policy is needed.
alter table public.campaigns
  add column if not exists assigned_to uuid references public.users(id) on delete set null;

create index if not exists campaigns_assigned_to_idx on public.campaigns(assigned_to);

-- ── Assignable-user lookup ────────────────────────────────────────────────────
-- users is self-read-only under RLS (users_select_self_or_admin), so a brand
-- manager can't list the team to pick an assignee or resolve assignee names.
-- This SECURITY DEFINER function returns just the assignable pool (brand
-- managers + admins) to any signed-in @markato user — id/email/role only, no
-- secrets — without loosening the base-table policy. The is_markato() guard
-- makes it return nothing to a non-team caller.
create or replace function public.list_assignable_users()
returns table (id uuid, email text, role text)
language sql
stable
security definer
set search_path = public
as $$
  select u.id, u.email, u.role
  from public.users u
  where u.role in ('brand_manager', 'admin')
    and public.is_markato()
  order by u.email
$$;

grant execute on function public.list_assignable_users() to authenticated;
