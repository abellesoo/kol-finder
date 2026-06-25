import { supabase } from './supabase'

const LOCAL_KEY = 'kol_session_history'
const MAX_SESSIONS = 20

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
    await supabase.from('sessions').insert(session)
  } else {
    try {
      const existing = loadLocalHistory()
      localStorage.setItem(LOCAL_KEY, JSON.stringify([session, ...existing].slice(0, MAX_SESSIONS)))
    } catch {}
  }
  return session.id
}

export async function updateSessionLiveStats(id, statsMap) {
  if (!supabase || !id) return
  const { data } = await supabase.from('sessions').select('results').eq('id', id).single()
  if (!data) return
  const results = (data.results || []).map((r) => ({
    ...r,
    medianLikes: statsMap[r.username]?.medianLikes ?? r.medianLikes ?? null,
    medianViews: statsMap[r.username]?.medianViews ?? r.medianViews ?? null,
    medianComments: statsMap[r.username]?.medianComments ?? r.medianComments ?? null,
  }))
  await supabase.from('sessions').update({ results }).eq('id', id)
}

export async function loadHistory() {
  if (supabase) {
    const { data } = await supabase
      .from('sessions')
      .select('id, file_names, account_count, config, created_at')
      .order('created_at', { ascending: false })
      .limit(MAX_SESSIONS)
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
    const { data } = await supabase.from('sessions').select('config').eq('id', id).single()
    const config = { ...(data?.config || {}), sessionTitle: title || undefined }
    await supabase.from('sessions').update({ config }).eq('id', id)
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
    await supabase.from('sessions').delete().eq('id', id)
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
