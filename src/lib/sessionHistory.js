import { supabase } from './supabase'

const LOCAL_KEY = 'kol_session_history'

// ── Supabase-backed session history (shared across all users) ──────────────

export async function saveSession({ fileNames, config, results, influencers }) {
  const session = {
    id: Date.now(),
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

export async function loadHistory() {
  if (supabase) {
    const { data, error } = await supabase
      .from('sessions')
      .select('id, file_names, account_count, config, created_at')
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data || []).map(normalizeRow)
  }
  return loadLocalHistory()
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
    date: row.created_at || new Date(row.id).toISOString(),
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
