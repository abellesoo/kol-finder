import { supabase } from './supabase'

// Canonical review_state persistence.
//
// review_state is a jsonb map on the shared_results row:
//   { [username]: { status, dm_status, dm_draft, notes }, __notes__: string }

// Key for an account's review_state entry. Instagram accounts keep the bare
// username (backward compatible with every existing row); Threads accounts are
// namespaced so a same-handle IG + Threads pair in one run don't share a single
// approve/reject entry. Use this EVERYWHERE review_state is read or written.
export function reviewKey(account) {
  const username = typeof account === 'string' ? account : account?.username || ''
  const platform = typeof account === 'string' ? 'instagram' : account?.platform || 'instagram'
  return platform === 'threads' ? `threads:${username}` : username
}
//
// The old code wrote the WHOLE map from a component's local copy, so two
// reviewers editing different accounts clobbered each other (last-write-wins).
// This helper merges ONE account's entry into the row, preserving every other
// account (and __notes__). It prefers an atomic server-side RPC and falls back
// to fetch-merge-write if that function isn't deployed yet.
//
// Returns the merged review_state map so callers can reconcile local state with
// authoritative server state (and thereby pick up others' concurrent edits).
export async function mergeReviewEntry(reviewId, username, entry) {
  if (!supabase) throw new Error('Supabase not configured')

  // Preferred path: a single atomic UPDATE using jsonb concatenation, so
  // concurrent writers can't lose each other's changes. Requires the
  // merge_review_entry() SQL function (see the RLS/DB migration deliverable).
  const rpc = await supabase.rpc('merge_review_entry', {
    p_review_id: reviewId,
    p_username: username,
    p_entry: entry,
  })
  if (!rpc.error) return rpc.data || {}

  // 42883 = Postgres undefined_function; PGRST202 = PostgREST can't find the RPC.
  // Any other error (permissions, network, RLS) is real — surface it.
  const missing = rpc.error.code === '42883' || rpc.error.code === 'PGRST202'
  if (!missing) throw new Error(rpc.error.message)

  // Fallback: read latest, merge this one account, write back. Preserves other
  // accounts and __notes__; narrows but does not fully eliminate the race.
  const { data: row, error: fetchErr } = await supabase
    .from('shared_results')
    .select('review_state')
    .eq('id', reviewId)
    .single()
  if (fetchErr) throw new Error(fetchErr.message)

  const merged = { ...(row?.review_state || {}), [username]: entry }
  const { error: updErr } = await supabase
    .from('shared_results')
    .update({ review_state: merged })
    .eq('id', reviewId)
  if (updErr) throw new Error(updErr.message)
  return merged
}
