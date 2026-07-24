-- ============================================================================
-- KOL Finder — Merge assistant_bm / brand_manager into a single "member" role
-- ----------------------------------------------------------------------------
-- Access is no longer split between assistants and brand managers: every signed-in
-- @markato user gets the full workflow (Seeder, History, Ready to Send, Review
-- Queue, Campaigns). The only remaining distinction is `admin`, who additionally
-- gets the Team tab. Ownership is now expressed per-campaign via assigned_to
-- (db/campaign_assignee.sql), not via a global role — so anyone who has signed in
-- can be an assignee.
--
-- Apply in the Supabase SQL editor (Dashboard → SQL). Idempotent — safe to
-- re-run. Depends on public.users and public.is_markato() (db/audit_rls_and_rpc.sql)
-- and db/campaign_assignee.sql (defines list_assignable_users).
-- ============================================================================

-- ── 1. Replace the role CHECK constraint, then collapse existing roles ───────
-- users.role has a CHECK constraint (users_role_check) that only permitted the
-- old values. Drop it first so 'member' is allowed, update the rows, then re-add
-- a constraint that permits exactly the new set. Order matters: the UPDATE would
-- fail the old constraint, and a new constraint added before the UPDATE would
-- reject the surviving legacy rows.
alter table public.users drop constraint if exists users_role_check;

-- Everyone who was assistant_bm or brand_manager becomes a plain member; admins
-- keep their role.
update public.users
  set role = 'member'
  where role in ('assistant_bm', 'brand_manager');

alter table public.users
  add constraint users_role_check check (role in ('member', 'admin'));

-- ── 2. New default role on first-login self-insert ───────────────────────────
-- AuthGate inserts the caller's own row on first sign-in. Lock it to 'member' so
-- nobody can self-insert as admin (role escalation stays impossible — only admins
-- can UPDATE roles, per users_update_admin in db/audit_rls_and_rpc.sql).
drop policy if exists users_insert_self on public.users;
create policy users_insert_self on public.users
  for insert with check (
    id = auth.uid() and role = 'member' and public.is_markato()
  );

-- ── 3. Assignable pool = everyone who has signed in ──────────────────────────
-- Previously limited to brand managers + admins. Now any signed-in @markato user
-- can be assigned a campaign, so this returns the whole team. Still gated by
-- is_markato() (returns nothing to a non-team caller) and exposes id/email/role
-- only. users is self-read-only under RLS, so this SECURITY DEFINER RPC is how the
-- Campaigns / Review Queue / Dashboard views resolve the roster.
create or replace function public.list_assignable_users()
returns table (id uuid, email text, role text)
language sql
stable
security definer
set search_path = public
as $$
  select u.id, u.email, u.role
  from public.users u
  where public.is_markato()
  order by u.email
$$;

grant execute on function public.list_assignable_users() to authenticated;
