import { supabase } from './supabase'

const PROXY = (import.meta.env.VITE_PROXY_URL || 'https://kol-finder-proxy.asoo.workers.dev').replace(/\/$/, '')

// The worker requires an Authorization: Bearer <supabase token> on every call.
async function authHeaders() {
  const headers = { 'Content-Type': 'application/json' }
  if (supabase) {
    const { data } = await supabase.auth.getSession()
    const token = data?.session?.access_token
    if (token) headers['Authorization'] = `Bearer ${token}`
  }
  return headers
}

// Pull the team's past approve/reject decisions from prior shared_results rows,
// joining each decided account's stored features to its decision so the AI can
// learn from real labeled examples. Bounded to the most recent rows + a total
// example cap so token cost stays predictable. Returns [] on any failure — the
// AI scorer degrades to criteria/brief-only rather than breaking.
export async function pullHistoricalDecisions({ maxRows = 15, maxExamples = 40 } = {}) {
  if (!supabase) return []
  try {
    const { data, error } = await supabase
      .from('shared_results')
      .select('accounts, review_state, created_at')
      .order('created_at', { ascending: false })
      .limit(maxRows)
    if (error || !data) return []

    const examples = []
    for (const row of data) {
      const rs = row.review_state || {}
      const byUser = {}
      for (const a of row.accounts || []) {
        // Threads entries are keyed 'threads:username' in review_state (see
        // reviewKey in reviewState.js) — mirror that here so their features join.
        if (a && a.username) byUser[a.platform === 'threads' ? `threads:${a.username}` : a.username] = a
      }
      for (const [username, entry] of Object.entries(rs)) {
        if (username === '__notes__' || username === '__criteria__') continue
        const status = entry?.status
        if (status !== 'approved' && status !== 'rejected') continue
        const a = byUser[username] || {}
        examples.push({
          status,
          reject_reason: entry.reject_reason || null,
          fit_rating: entry.fit_rating || null,
          notes: entry.notes || '',
          bio: a.bio || '',
          hashtags: a.hashtags || [],
          nicheSignals: a.nicheSignals || [],
          flags: a.flags || [],
          followerCount: a.followerCount ?? null,
        })
        if (examples.length >= maxExamples) return examples
      }
    }
    return examples
  } catch {
    return []
  }
}

// Score a set of candidate accounts against the campaign, in batches so each
// worker call stays within a reliable JSON-output size. Mirrors fetchBatchStats'
// contract: reports progress, never throws away succeeded batches on one bad
// batch, and attaches a non-enumerable _failed list of usernames.
export async function fetchAiScores(candidates, { criteria = '', campaignBrief = '', targetAudience = '', excludeNiches = '', examples = null } = {}, onProgress) {
  const BATCH = 15
  const scoreMap = {}
  const failed = []
  let done = 0
  const total = candidates.length

  const hist = examples ?? (await pullHistoricalDecisions())

  const batches = []
  for (let i = 0; i < candidates.length; i += BATCH) {
    batches.push(candidates.slice(i, i + BATCH))
  }

  const headers = await authHeaders()

  // Score one batch: mutates the shared scoreMap/failed, then reports progress.
  // A single batch's failure is isolated (its usernames go to `failed`) so the
  // rest of the run still lands — same contract as the old serial loop.
  const processBatch = async (batch) => {
    try {
      const res = await fetch(`${PROXY}/ai-score`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          candidates: batch.map((c) => ({
            username: c.username,
            bio: c.bio,
            hashtags: c.hashtags,
            nicheSignals: c.nicheSignals,
            flags: c.flags,
            followerCount: c.followerCount,
            medianLikes: c.medianLikes,
            medianViews: c.medianViews,
            overall: c.overall,
          })),
          criteria,
          campaignBrief,
          targetAudience,
          excludeNiches,
          examples: hist,
        }),
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`ai-score failed (${res.status}): ${text}`)
      }
      const { results = [], error } = await res.json()
      if (error) throw new Error(error)
      // Match the model's rows back to candidates case-insensitively, then key
      // the score by the CANDIDATE's exact username — that's what the results
      // table looks up. Keying by the model-returned username risks a casing
      // mismatch that both hides the score and falsely flags the account failed.
      const byLower = {}
      for (const r of results) {
        if (r?.username != null) byLower[String(r.username).toLowerCase()] = r
      }
      for (const c of batch) {
        // Key results by the candidate's `key` when provided (platform:username,
        // so the same handle on Instagram and Threads doesn't collide), falling
        // back to bare username for callers that don't pass one.
        const outKey = c.key || c.username
        const r = byLower[String(c.username).toLowerCase()]
        if (r) {
          // Worker rates 0–100 (finer AI granularity); the app displays and
          // scores on a 0–10 scale like Relevancy/Engagement, so convert here.
          const score10 = Math.round(Number(r.fit_score) || 0) / 10
          scoreMap[outKey] = { score: score10, reason: r.reason }
        } else {
          failed.push(outKey)
        }
      }
    } catch (err) {
      failed.push(...batch.map((c) => c.username))
      console.error('fetchAiScores: batch failed:', err)
    }
    done += batch.length
    if (onProgress) onProgress(Math.min(done, total), total)
  }

  // Run the batches through a bounded worker pool instead of strictly one at a
  // time. A whole scoring run used to be ceil(N/15) serial round-trips to the
  // proxy — for a few hundred candidates that's a long, visibly slow wait.
  // POOL keeps a few requests in flight without overwhelming the worker.
  const POOL = 4
  let next = 0
  const worker = async () => {
    while (next < batches.length) {
      const batch = batches[next++]
      await processBatch(batch)
    }
  }
  await Promise.all(Array.from({ length: Math.min(POOL, batches.length) }, worker))

  Object.defineProperty(scoreMap, '_failed', { value: failed, enumerable: false })
  return scoreMap
}
