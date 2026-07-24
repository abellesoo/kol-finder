-- ============================================================================
-- Campaign notes — a running, team-shared log of notes on a campaign.
-- ----------------------------------------------------------------------------
-- Apply in the Supabase SQL editor (Dashboard → SQL). Run top to bottom.
-- Safe to re-run: every statement is guarded (if not exists / drop-then-create).
--
-- DEPENDENCY: the RLS below calls public.is_markato(), defined in
-- db/audit_rls_and_rpc.sql (the production security baseline). Run that file
-- first. If you haven't, run the table + indexes and come back to RLS after.
--
-- WHY THIS TABLE EXISTS: the campaign detail page had nowhere to jot shared
-- context — "waiting on samples", "brief approved by brand", "push her deadline".
-- This is a lightweight append-only feed: any teammate can add a note; entries
-- are kept with who wrote them and when, and shown newest-first.
--
-- ATTRIBUTION: author_id is the auth user; author_name is a snapshot of their
-- display name at write time (user_metadata.full_name or email prefix — the same
-- name App.jsx shows), so the feed renders without a join back to public.users.
-- ============================================================================

create table if not exists public.campaign_notes (
  id           uuid primary key default gen_random_uuid(),
  campaign_id  uuid not null references public.campaigns(id) on delete cascade,
  body         text not null,
  author_id    uuid references public.users(id) on delete set null,
  author_name  text,                              -- display-name snapshot at write time
  created_at   timestamptz not null default now()
);

-- ── indexes ───────────────────────────────────────────────────────────────────
-- The notes tab lists one campaign's notes, newest-first.
create index if not exists campaign_notes_campaign_idx
  on public.campaign_notes (campaign_id, created_at desc);

-- ============================================================================
-- Row-Level Security — team-shared, same model as campaigns/creator_vault:
-- any authenticated @markato.com Google account can read and add notes; a note
-- can only be deleted by the teammate who wrote it (author_id = auth.uid()).
-- There is no UPDATE policy — notes are not editable, only added or removed.
-- Requires public.is_markato() from db/audit_rls_and_rpc.sql.
-- ============================================================================

alter table public.campaign_notes enable row level security;

drop policy if exists campaign_notes_team_read on public.campaign_notes;
create policy campaign_notes_team_read on public.campaign_notes
  for select using (public.is_markato());

drop policy if exists campaign_notes_team_insert on public.campaign_notes;
create policy campaign_notes_team_insert on public.campaign_notes
  for insert with check (public.is_markato() and author_id = auth.uid());

drop policy if exists campaign_notes_delete_own on public.campaign_notes;
create policy campaign_notes_delete_own on public.campaign_notes
  for delete using (public.is_markato() and author_id = auth.uid());
