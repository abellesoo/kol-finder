const HISTORY_KEY = 'kol_session_history'
const MAX_SESSIONS = 5

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
