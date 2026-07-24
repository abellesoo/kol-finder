import { supabase } from './supabase'

const LOCAL_KEY = 'kol_session_history'

// ── Supabase-backed session history (shared across all users) ──────────────

export async function saveSession({ fileNames, config, results, influencers, campaignId = null }) {
  const session = {
    // Collision-resistant while staying a time-sortable bigint inside Number's
    // safe range: ms × 1000 + a random suffix. Plain Date.now() collided when
    // two saves landed in the same millisecond (a double-click, or two
    // teammates finishing runs together) → duplicate-PK insert error, lost run.
    id: Date.now() * 1000 + Math.floor(Math.random() * 1000),
    campaign_id: campaignId || null,
    file_names: fileNames || [],
    account_count: results.length,
    config,
    results,
    influencers: influencers.map(({ captions, sampleCaptions, ...rest }) => rest),
  }

  if (supabase) {
    const { error } = await supabase.from('sessions').insert(session)
    if (error) throw error
  } else {
    try {
      const existing = loadLocalHistory()
      localStorage.setItem(LOCAL_KEY, JSON.stringify([session, ...existing]))
    } catch {}
  }
  return session.id
}

// platform scopes which rows a stats map may touch — the same handle can exist
// as separate Instagram and Threads rows, and IG live stats must never land on
// a Threads row (or vice versa). null = legacy behavior, all rows.
export async function updateSessionLiveStats(id, statsMap, platform = null) {
  if (!supabase || !id) return
  // Preferred path: an atomic, row-locked merge in the DB (db/session_live_stats_merge.sql)
  // so two concurrent passes (IG + Threads, or two teammates on one session)
  // can't clobber each other's writes. Falls back to the read-modify-write
  // below when the RPC isn't present, so nothing breaks pre-migration.
  const { error: rpcError } = await supabase.rpc('merge_session_live_stats', {
    p_id: id,
    p_stats: statsMap || {},
    p_platform: platform,
  })
  if (!rpcError) return
  // Fallback (non-atomic): last writer wins under concurrency.
  const { data } = await supabase.from('sessions').select('results').eq('id', id).single()
  if (!data) return
  const matchesPlatform = (r) =>
    platform == null || (platform === 'threads' ? r.platform === 'threads' : r.platform !== 'threads')
  const results = (data.results || []).map((r) => {
    if (!matchesPlatform(r)) return r
    const s = statsMap[r.username]
    return {
      ...r,
      medianLikes: s?.medianLikes ?? r.medianLikes ?? null,
      medianViews: s?.medianViews ?? r.medianViews ?? null,
      medianComments: s?.medianComments ?? r.medianComments ?? null,
      followerCount: s?.followerCount ?? r.followerCount ?? null,
    }
  })
  await supabase.from('sessions').update({ results }).eq('id', id)
}

// Persist AI fit scores back onto the session's results so they survive a
// reload — the counterpart to updateSessionLiveStats. Without this the scores
// live only in the browser tab and vanish when the session is reopened.
// scoreMap is keyed by `${platform}:${username}` (the rowKey the UI seeds from),
// each entry { score, reason }. Non-atomic read-modify-write: last writer wins
// if two people re-score the same session at once.
export async function updateSessionAiScores(id, scoreMap) {
  if (!supabase || !id || !scoreMap) return
  const { data } = await supabase.from('sessions').select('results').eq('id', id).single()
  if (!data) return
  const rowKey = (r) => `${r.platform || 'instagram'}:${r.username}`
  const results = (data.results || []).map((r) => {
    const s = scoreMap[rowKey(r)]
    if (!s) return r
    return { ...r, aiScore: s.score ?? r.aiScore ?? null, aiReason: s.reason ?? r.aiReason ?? '' }
  })
  await supabase.from('sessions').update({ results }).eq('id', id)
}

// Persist first-round triage (Keep / Cut) back onto the session's results so an
// assistant's shortlisting survives a reload — the counterpart to
// updateSessionAiScores. This is the FIRST gate: the assistant keeps the KOLs
// worth a brand manager's time and cuts the rest, before any are sent to the
// Review Queue where the brand manager does the real Approve / Reject.
// triageMap is keyed by `${platform}:${username}` (the rowKey the UI seeds
// from); each value is 'kept', 'cut', or null to clear. Non-atomic
// read-modify-write: last writer wins if two people triage one session at once.
export async function updateSessionTriage(id, triageMap) {
  if (!supabase || !id || !triageMap) return
  const { data } = await supabase.from('sessions').select('results').eq('id', id).single()
  if (!data) return
  const rowKey = (r) => `${r.platform || 'instagram'}:${r.username}`
  const results = (data.results || []).map((r) => {
    const key = rowKey(r)
    if (!(key in triageMap)) return r
    const status = triageMap[key]
    // null/undefined clears the row back to undecided so the field never lingers.
    return { ...r, triageStatus: status === 'kept' || status === 'cut' ? status : null }
  })
  await supabase.from('sessions').update({ results }).eq('id', id)
}

export async function loadHistory() {
  if (supabase) {
    const { data, error } = await supabase
      .from('sessions')
      .select('id, campaign_id, file_names, account_count, config, created_at')
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data || []).map(normalizeRow)
  }
  return loadLocalHistory()
}

// Sessions belonging to one campaign, newest first — for the Campaign detail's
// "Seeder sessions" list. Light select (no results/influencers blobs).
export async function listSessionsForCampaign(campaignId) {
  if (!supabase || !campaignId) return []
  const { data, error } = await supabase
    .from('sessions')
    .select('id, campaign_id, file_names, account_count, config, created_at')
    .eq('campaign_id', campaignId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data || []).map(normalizeRow)
}

export async function loadSessionFull(id) {
  if (supabase) {
    const { data } = await supabase
      .from('sessions')
      .select('*')
      .eq('id', id)
      .single()
    return data ? normalizeRow(data) : null
  }
  return loadLocalHistory().find((s) => s.id === id) || null
}

// Move a Seeder session under a campaign (or clear it with null). Sessions carry
// a snapshot config, so this only re-files the session — it never re-runs it.
export async function setSessionCampaign(id, campaignId) {
  if (supabase) {
    const { data, error } = await supabase
      .from('sessions')
      .update({ campaign_id: campaignId || null })
      .eq('id', id)
      .select('id')
    if (error) throw error
    if (!data || data.length === 0) {
      throw new Error('Move was blocked (0 rows updated) — check Supabase permissions for the sessions table')
    }
  } else {
    try {
      const updated = loadLocalHistory().map((s) =>
        s.id === id ? { ...s, campaign_id: campaignId || null } : s
      )
      localStorage.setItem(LOCAL_KEY, JSON.stringify(updated))
    } catch {}
  }
}

export async function updateSessionTitle(id, title) {
  if (supabase) {
    const { data, error } = await supabase.from('sessions').select('config').eq('id', id).single()
    if (error) throw error
    if (!data) throw new Error(`Session ${id} not found`)
    const config = { ...(data.config || {}), sessionTitle: title || undefined }
    const { error: updateError } = await supabase.from('sessions').update({ config }).eq('id', id)
    if (updateError) throw updateError
  } else {
    try {
      const updated = loadLocalHistory().map((s) =>
        s.id === id ? { ...s, config: { ...(s.config || {}), sessionTitle: title || undefined } } : s
      )
      localStorage.setItem(LOCAL_KEY, JSON.stringify(updated))
    } catch {}
  }
}

export async function deleteSession(id) {
  if (supabase) {
    const { data, error } = await supabase.from('sessions').delete().eq('id', id).select('id')
    if (error) throw error
    if (!data || data.length === 0) {
      throw new Error('Delete was blocked (0 rows removed) — check Supabase permissions for the sessions table')
    }
  } else {
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(loadLocalHistory().filter((s) => s.id !== id)))
    } catch {}
  }
}

// Normalise Supabase row (snake_case) → shape the rest of the app expects
function normalizeRow(row) {
  return {
    id: row.id,
    campaignId: row.campaign_id ?? null,
    // created_at is the source of truth; the id fallback handles legacy rows.
    // New ids are ms×1000, so scale them back down before treating as a date.
    date: row.created_at || new Date(row.id > 1e14 ? Math.floor(row.id / 1000) : row.id).toISOString(),
    fileNames: row.file_names || [],
    accountCount: row.account_count || 0,
    config: row.config || {},
    results: row.results || [],
    influencers: row.influencers || [],
  }
}

function loadLocalHistory() {
  try {
    return JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]')
  } catch {
    return []
  }
}
