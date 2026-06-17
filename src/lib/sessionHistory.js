const HISTORY_KEY = 'kol_session_history'
const LOOKUP_KEY = 'kol_lookup_history'
const MAX_SESSIONS = 5
const MAX_LOOKUPS = 30

export function saveSession({ fileNames, config, results, influencers }) {
  try {
    const history = loadHistory()
    const session = {
      id: Date.now(),
      date: new Date().toISOString(),
      fileNames,
      accountCount: results.length,
      config,
      results,
      // Strip large text fields — only needed for scoring, not display
      influencers: influencers.map(({ captions, sampleCaptions, ...rest }) => rest),
    }
    const updated = [session, ...history].slice(0, MAX_SESSIONS)
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updated))
  } catch {}
}

export function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]')
  } catch {
    return []
  }
}

export function deleteSession(id) {
  try {
    const updated = loadHistory().filter((s) => s.id !== id)
    localStorage.setItem(HISTORY_KEY, JSON.stringify(updated))
  } catch {}
}

export function saveLookup({ username, stats }) {
  try {
    const history = loadLookupHistory()
    const entry = {
      id: Date.now(),
      date: new Date().toISOString(),
      username,
      medianLikes: stats.medianLikes,
      medianViews: stats.medianViews,
      hiddenCount: stats.hiddenCount,
      total: stats.total,
    }
    const updated = [entry, ...history.filter((e) => e.username !== username)].slice(0, MAX_LOOKUPS)
    localStorage.setItem(LOOKUP_KEY, JSON.stringify(updated))
  } catch {}
}

export function loadLookupHistory() {
  try {
    return JSON.parse(localStorage.getItem(LOOKUP_KEY) || '[]')
  } catch {
    return []
  }
}

export function deleteLookup(id) {
  try {
    const updated = loadLookupHistory().filter((e) => e.id !== id)
    localStorage.setItem(LOOKUP_KEY, JSON.stringify(updated))
  } catch {}
}
