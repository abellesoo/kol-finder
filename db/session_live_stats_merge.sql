-- ============================================================================
-- KOL Finder — Atomic Live-Stats merge for Seeder sessions
-- ----------------------------------------------------------------------------
-- updateSessionLiveStats() used to read sessions.results, merge in JS, and write
-- the whole blob back. Two concurrent passes on the same session (the IG pass
-- and the Threads pass, or two teammates) could interleave read→write and the
-- later write clobbered the earlier one — lost live stats.
--
-- This function does the merge inside a single transaction with a row lock
-- (SELECT … FOR UPDATE), so concurrent callers serialize instead of racing.
-- The client (src/lib/sessionHistory.js) calls this first and falls back to the
-- old read-modify-write if the function isn't present, so applying this is
-- optional but recommended.
--
-- Apply in the Supabase SQL editor (Dashboard → SQL). Idempotent. SECURITY
-- INVOKER: it runs as the caller, so the existing sessions_team_all RLS policy
-- still applies (no privilege escalation).
--
-- Params:
--   p_id       bigint  — sessions.id
--   p_stats    jsonb   — { username: { medianLikes, medianViews, medianComments, followerCount } }
--   p_platform text    — null = all rows; 'threads' = only Threads rows;
--                        anything else = only non-Threads (Instagram) rows.
-- ============================================================================

create or replace function public.merge_session_live_stats(
  p_id bigint,
  p_stats jsonb,
  p_platform text default null
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  cur jsonb;
  merged jsonb;
begin
  -- Lock the row so concurrent merges serialize on it.
  select results into cur from public.sessions where id = p_id for update;
  if cur is null then return; end if;

  select jsonb_agg(
    case
      when (
        p_platform is null
        or (p_platform = 'threads' and (elem->>'platform') = 'threads')
        or (p_platform <> 'threads' and coalesce(elem->>'platform', '') <> 'threads')
      ) and (p_stats ? (elem->>'username'))
      then elem || jsonb_build_object(
        'medianLikes',    coalesce(p_stats->(elem->>'username')->'medianLikes',    elem->'medianLikes',    'null'::jsonb),
        'medianViews',    coalesce(p_stats->(elem->>'username')->'medianViews',    elem->'medianViews',    'null'::jsonb),
        'medianComments', coalesce(p_stats->(elem->>'username')->'medianComments', elem->'medianComments', 'null'::jsonb),
        'followerCount',  coalesce(p_stats->(elem->>'username')->'followerCount',  elem->'followerCount',  'null'::jsonb)
      )
      else elem
    end
  )
  into merged
  from jsonb_array_elements(cur) elem;

  update public.sessions set results = coalesce(merged, cur) where id = p_id;
end
$$;

grant execute on function public.merge_session_live_stats(bigint, jsonb, text) to authenticated;
