// URL deep-linking for the SPA. The app is served statically under /kol-finder/
// with no server-side rewrites, so view state lives in query params, not paths:
//
//   ?page=dashboard|seeder|history|review_queue|ready_to_send|campaigns|help|team
//   ?page=review&id=<shared_results id>    → review detail
//   ?page=campaign&id=<campaign id>        → campaign detail
//   ?page=seeder&session=<session id>      → a saved seeder run's results
//   ?page=seeder&session=<id>&view=setup   → same run, but on the Set-up screen
//
// Params we don't own (e.g. Supabase's OAuth ?code=) are preserved untouched.

const OWN_PARAMS = ['page', 'id', 'session', 'view']
const STASH_KEY = 'kol_post_login_url'

// Session ids are Date.now() numbers; local-storage history looks them up with
// strict equality, so numeric strings from the URL must come back as numbers.
function coerceSessionId(raw) {
  return /^\d+$/.test(raw) ? Number(raw) : raw
}

export function readUrlState(search = window.location.search) {
  const params = new URLSearchParams(search)
  const page = params.get('page')
  if (!page) return null
  const id = params.get('id')
  if (page === 'review') return id ? { mode: 'review_detail', reviewId: id } : { mode: 'review_queue' }
  if (page === 'campaign') return id ? { mode: 'campaign_detail', campaignId: id } : { mode: 'campaigns' }
  const session = params.get('session')
  if (page === 'seeder' && session) {
    return {
      mode: 'seeder',
      sessionId: coerceSessionId(session),
      // A session link opens on its results unless it explicitly says setup.
      view: params.get('view') === 'setup' ? 'setup' : 'results',
    }
  }
  return { mode: page }
}

function buildSearch({ mode, reviewId, campaignId, sessionId, view }) {
  const params = new URLSearchParams(window.location.search)
  OWN_PARAMS.forEach((p) => params.delete(p))
  if (mode === 'review_detail' && reviewId) {
    params.set('page', 'review')
    params.set('id', String(reviewId))
  } else if (mode === 'campaign_detail' && campaignId) {
    params.set('page', 'campaign')
    params.set('id', String(campaignId))
  } else {
    params.set('page', mode)
    if (mode === 'seeder' && sessionId) {
      params.set('session', String(sessionId))
      // Only the non-default view is spelled out, so existing links stay valid.
      if (view === 'setup') params.set('view', 'setup')
    }
  }
  return `?${params.toString()}`
}

export function syncUrl(state, { replace = false } = {}) {
  const search = buildSearch(state)
  if (search === window.location.search) return
  const url = window.location.pathname + search + window.location.hash
  window.history[replace ? 'replaceState' : 'pushState'](null, '', url)
}

// The OAuth redirectTo is the bare app URL (whitelisted without params), so a
// deep link would be lost across the Google round-trip. The login page stashes
// it in sessionStorage (same tab survives the redirect) and MainApp restores it.
export function stashDeepLink() {
  if (!readUrlState()) return
  try {
    sessionStorage.setItem(STASH_KEY, window.location.search)
  } catch {}
}

export function popStashedDeepLink() {
  try {
    const stashed = sessionStorage.getItem(STASH_KEY)
    if (stashed) sessionStorage.removeItem(STASH_KEY)
    return stashed ? readUrlState(stashed) : null
  } catch {
    return null
  }
}
