-- ============================================================================
-- KOL Finder — Pre-launch audit: Row-Level Security + review-merge RPC
-- ----------------------------------------------------------------------------
-- Apply in the Supabase SQL editor (Dashboard → SQL). Run top to bottom.
-- Then verify from the browser console that you CANNOT escalate your role or
-- read/write outside the intended scope (see AUDIT_MANUAL_CHECKLIST.md).
--
-- Tables covered: users, sessions, shared_results.
-- Model: every real user is an authenticated @markato.com Google account.
--   * users         — private-ish: you can read your own row; only admins may
--                     change roles (prevents privilege escalation).
--   * sessions      — team-shared workspace history (any @markato user).
--   * shared_results— team-shared review workflow (any @markato user).
--
-- NOTE ON id TYPES: this assumes shared_results.id is uuid and sessions.id is
-- bigint (Date.now()), matching the app code. If yours differ, adjust the RPC
-- signature at the bottom accordingly (the client falls back gracefully if the
-- RPC signature doesn't match, so nothing breaks — it just isn't atomic).
-- ============================================================================

-- ── Helper functions ────────────────────────────────────────────────────────
-- SECURITY DEFINER so they can read users.role without tripping RLS recursion.
create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$ select role from public.users where id = auth.uid() $$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$ select coalesce(public.current_user_role() = 'admin', false) $$;

-- Defense-in-depth: the caller's verified Google email must be @markato.com.
create or replace function public.is_markato()
returns boolean
language sql
stable
as $$ select coalesce((auth.jwt() ->> 'email') like '%@markato.com', false) $$;

-- ── users ───────────────────────────────────────────────────────────────────
alter table public.users enable row level security;

-- Drop the legacy ad-hoc policies from before this migration existed. There
-- was no UPDATE or DELETE policy at all under the old names, so role changes
-- from the Team page were silently failing (0 rows updated, no error) — the
-- same failure mode as the shared_results delete bug below.
drop policy if exists "Users can insert their own row" on public.users;
drop policy if exists "team can view all users" on public.users;
drop policy if exists "Users can read their own row" on public.users;

drop policy if exists users_select_self_or_admin on public.users;
create policy users_select_self_or_admin on public.users
  for select using (id = auth.uid() or public.is_admin());

-- First-login self-insert (AuthGate). Locked to your own id and the default
-- role, so nobody can create themselves as admin.
drop policy if exists users_insert_self on public.users;
create policy users_insert_self on public.users
  for insert with check (
    id = auth.uid() and role = 'assistant_bm' and public.is_markato()
  );

-- Only admins may update or delete user rows → role escalation is impossible
-- for a normal user (they have no UPDATE path to their own role at all).
drop policy if exists users_update_admin on public.users;
create policy users_update_admin on public.users
  for update using (public.is_admin()) with check (public.is_admin());

drop policy if exists users_delete_admin on public.users;
create policy users_delete_admin on public.users
  for delete using (public.is_admin());

-- ── sessions (team-shared) ───────────────────────────────────────────────────
alter table public.sessions enable row level security;

-- Drop the legacy ad-hoc policies from before this migration existed. These
-- gated on `authenticated` only (any logged-in Supabase user), not on the
-- @markato.com email check — replaced below with the is_markato()-gated
-- policy for defense-in-depth against the OAuth hosted-domain restriction.
drop policy if exists "team can manage sessions" on public.sessions;
drop policy if exists "all users delete sessions" on public.sessions;
drop policy if exists "all users insert sessions" on public.sessions;
drop policy if exists "all users read sessions" on public.sessions;
drop policy if exists "all users update sessions" on public.sessions;

drop policy if exists sessions_team_all on public.sessions;
create policy sessions_team_all on public.sessions
  for all using (public.is_markato()) with check (public.is_markato());

-- ── shared_results (team-shared) ─────────────────────────────────────────────
alter table public.shared_results enable row level security;

-- Drop the legacy ad-hoc policies from before this migration existed. These
-- granted the `anon` role unconditional read/insert/update (qual = true) —
-- i.e. anyone with the public anon key could read or write every campaign
-- without logging in — and had NO delete policy at all, which is why deletes
-- silently matched 0 rows (Postgres denies a command outright when no policy
-- covers it, without raising an error).
drop policy if exists anon_select on public.shared_results;
drop policy if exists anon_insert on public.shared_results;
drop policy if exists anon_update on public.shared_results;
drop policy if exists "Anyone can read shared results" on public.shared_results;
drop policy if exists "Authenticated users can insert" on public.shared_results;
drop policy if exists "Authenticated users can update" on public.shared_results;

drop policy if exists shared_results_team_all on public.shared_results;
create policy shared_results_team_all on public.shared_results
  for all using (public.is_markato()) with check (public.is_markato());

-- ── Atomic per-account review_state merge (fixes last-write-wins) ────────────
-- The client calls this via supabase.rpc('merge_review_entry', {...}). It sets
-- ONE account's entry using jsonb top-level concatenation, so concurrent
-- reviewers editing different accounts never clobber each other. SECURITY
-- INVOKER → still governed by the shared_results RLS policy above.
create or replace function public.merge_review_entry(
  p_review_id uuid,
  p_username  text,
  p_entry     jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  merged jsonb;
begin
  update public.shared_results
     set review_state = coalesce(review_state, '{}'::jsonb)
                        || jsonb_build_object(p_username, p_entry)
   where id = p_review_id
   returning review_state into merged;

  if merged is null then
    raise exception 'shared_results row % not found or not permitted', p_review_id;
  end if;
  return merged;
end;
$$;

grant execute on function public.merge_review_entry(uuid, text, jsonb) to authenticated;

-- ── Bootstrap the first admin (run ONCE, replace the email) ──────────────────
-- After RLS is on, nobody can self-promote. Seed your first admin here using
-- the SQL editor (which runs as a privileged role):
--   update public.users set role = 'admin' where email = 'you@markato.com';
