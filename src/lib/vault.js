import { supabase } from './supabase'
import { normalizeHandle } from './campaigns'
import { profileUrl } from './platforms'

// ── Data layer for the Creator Vault ─────────────────────────────────────────
// A team-shared, persistent library of creators worth reusing. Mirrors how
// reviewState.js / campaigns.js / sessionHistory.js isolate Supabase access.
// Table: db/creator_vault.sql. A creator is identified by normalized handle +
// platform (the same canonical id as campaign_kols.kol_handle), so re-saving is
// an idempotent upsert on the (handle, platform) unique index.
//
// Metrics stored here are a SNAPSHOT taken at save time and go stale — the Vault
// tab renders them with an "as of created_at" label.

// Build the row we persist from a scored result / reviewed account. `account` is
// a result row (ResultsStep) or an approved account (ReviewPage) — both carry
// username / platform / fullName / aiScore / followerCount. `niches` comes from
// the run's config so the Vault is filterable by vertical.
function toVaultRow(account, { runId = null, niches = [], userId = null } = {}) {
  const handle = normalizeHandle(account.username)
  if (!handle) return null
  return {
    handle,
    platform: account.platform || 'instagram',
    display_name: account.fullName || null,
    follower_count: account.followerCount ?? null,
    avg_likes: account.avgLikes ?? null,
    ai_score: account.aiScore ?? null,
    niche_tags: Array.isArray(niches) ? niches : [],
    profile_url: profileUrl(account) || null,
    source_run_id: runId,
    added_by: userId,
  }
}

// Every creator in the shared vault, newest first.
export async function listVault() {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('creator_vault')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data || []
}

// A Set of "platform:handle" keys for the creators already vaulted, so save
// buttons can render filled/empty state without an N+1 lookup. Instagram keeps
// the bare handle to stay consistent with the rest of the app's IG-default keys.
export function vaultKey(account) {
  const handle = normalizeHandle(typeof account === 'string' ? account : account?.username)
  const platform = typeof account === 'string' ? 'instagram' : account?.platform || 'instagram'
  return platform === 'threads' ? `threads:${handle}` : handle
}

export async function vaultedKeySet() {
  const rows = await listVault()
  return new Set(rows.map((r) => vaultKey({ username: r.handle, platform: r.platform })))
}

// Save (upsert) one creator into the shared vault. Idempotent on
// (handle, platform): re-saving refreshes the snapshot rather than duplicating.
export async function saveToVault(account, opts = {}) {
  if (!supabase) throw new Error('Supabase not configured')
  const { data: { user } = {} } = await supabase.auth.getUser()
  const row = toVaultRow(account, { ...opts, userId: user?.id || null })
  if (!row) throw new Error('Creator has no usable handle')
  const { data, error } = await supabase
    .from('creator_vault')
    .upsert(row, { onConflict: 'handle,platform' })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data
}

// Remove one creator from the vault by row id.
export async function removeFromVault(id) {
  if (!supabase) throw new Error('Supabase not configured')
  const { error } = await supabase.from('creator_vault').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// Remove by handle+platform — used by a save button toggling off without knowing
// the row id.
export async function removeFromVaultByHandle(account) {
  if (!supabase) throw new Error('Supabase not configured')
  const handle = normalizeHandle(account.username)
  const platform = account.platform || 'instagram'
  const { error } = await supabase
    .from('creator_vault')
    .delete()
    .eq('handle', handle)
    .eq('platform', platform)
  if (error) throw new Error(error.message)
}
