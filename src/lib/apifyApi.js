import { computeStats } from './computeStats'
import { supabase } from './supabase'

// Public URL of the Cloudflare Worker proxy — not a secret.
// In production this is set via VITE_PROXY_URL in GitHub Actions.
// For local dev either point at the deployed worker or run `wrangler dev`
// in the /worker directory (listens on http://localhost:8787 by default).
const PROXY = (import.meta.env.VITE_PROXY_URL || 'https://kol-finder-proxy.asoo.workers.dev').replace(/\/$/, '')

// The worker requires an `Authorization: Bearer <supabase_access_token>` header
// on all of its endpoints. Merge that token into the headers of every
// worker-bound request. (All fetches in this file hit PROXY / the worker.)
async function workerHeaders(extra = {}) {
  const headers = { ...extra }
  if (supabase) {
    const { data } = await supabase.auth.getSession()
    const token = data?.session?.access_token
    if (token) headers.Authorization = `Bearer ${token}`
  }
  return headers
}

async function startInstagramScraper(usernames, resultsLimit = 30) {
  const directUrls = usernames.map((u) => `https://www.instagram.com/${u}/`)
  const res = await fetch(`${PROXY}/start-run/instagram-scraper`, {
    method: 'POST',
    headers: await workerHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ directUrls, resultsType: 'posts', resultsLimit }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Failed to start actor (${res.status}): ${text || 'no response body'}`)
  }
  const { data } = await res.json()
  return data
}

/**
 * Start an instagram-scraper run from a mix of post/hashtag/profile URLs or
 * hashtag strings. The caller passes raw lines from a textarea; this function
 * normalises them into the Apify input format.
 *
 * Supported input lines:
 *  - Full Instagram URLs (posts, hashtag explore pages, tagged pages, profiles)
 *  - Hashtag strings: "#skincare" or "skincare"  → converted to explore URLs
 */
export async function startSeederScrape(lines, resultsLimit = 200) {
  const directUrls = []
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue
    if (line.startsWith('https://') || line.startsWith('http://')) {
      directUrls.push(line)
    } else {
      // Treat as hashtag (strip leading # if present)
      const tag = line.replace(/^#/, '').trim()
      if (tag) directUrls.push(`https://www.instagram.com/explore/tags/${encodeURIComponent(tag)}/`)
    }
  }
  if (directUrls.length === 0) throw new Error('No valid URLs or hashtags provided')
  // Tagged pages (/username/tagged/) need resultsType 'mentions' to return posts
  // by other users who tagged the brand. Hashtag/post URLs use 'posts'.
  const resultsType = directUrls.some((u) => u.includes('/tagged/')) ? 'mentions' : 'posts'
  const res = await fetch(`${PROXY}/start-run/instagram-scraper`, {
    method: 'POST',
    headers: await workerHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ directUrls, resultsType, resultsLimit }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Failed to start actor (${res.status}): ${text || 'no response body'}`)
  }
  const { data } = await res.json()
  return data
}

/**
 * Start a Threads keyword-search scrape via igview-owner/threads-search-scraper
 * — the actor the manual seeding playbook actually used. Threads has no public
 * "tagged" page, so discovery is search-based: one term = one Threads search
 * query (pain-point like 掉髮, or content-genre like "olive young").
 *
 * Why not futurizerush's search: Meta anti-bots the SEARCH endpoint hard and
 * blocks futurizerush's proxy pool for long windows (its profile/user mode
 * stays up — that's what enrichment below uses). igview-owner runs on separate
 * infra that keeps working through those blocks. Its search items carry post +
 * engagement data but NO follower/bio — those come from startThreadsProfileScrape.
 *
 * ONE term per call: search blocks are per-request/per-proxy-IP, so isolating
 * terms (and retrying with a fresh run) keeps one block from sinking the rest.
 * `sort`: the seeding flow tries 'top' first (Meta's engagement ranking — the
 * quality pre-filter recent-sort lacks) and falls back to 'recent' if top
 * fails or returns nothing. maxPosts is floored at 20 (actor min).
 */
export async function startThreadsSeederScrape(term, resultsLimit = 30, sort = 'recent') {
  const searchQuery = String(Array.isArray(term) ? term[0] : term).trim()
  if (!searchQuery) throw new Error('No search term provided')
  const res = await fetch(`${PROXY}/start-run/threads-search`, {
    method: 'POST',
    headers: await workerHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      searchQuery,
      sort,
      maxPosts: Math.max(20, resultsLimit),
    }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Failed to start Threads search (${res.status}): ${text || 'no response body'}`)
  }
  const { data } = await res.json()
  return data
}

/**
 * Enrich discovered Threads handles with follower count + bio, which the search
 * actor doesn't return. Uses futurizerush/meta-threads-scraper in `user` mode —
 * its profile scrape is reliable even while its search endpoint is blocked
 * (confirmed by testing). One batched run covers all handles. Best-effort: the
 * caller wraps this so a failure just leaves follower/bio blank rather than
 * sinking the whole scrape.
 */
export async function startThreadsProfileScrape(usernames, postsPerUser = 10) {
  const list = [...new Set((usernames || []).map((u) => String(u).trim()).filter(Boolean))]
  if (list.length === 0) throw new Error('No usernames to enrich')
  // The actor's input schema caps usernames at 20 items — a bigger array fails
  // Apify's schema validation at run CREATION (no run ever starts, so nothing
  // shows up in the console). Callers with more handles must chunk; use
  // fetchThreadsProfileItems below.
  if (list.length > THREADS_PROFILE_CHUNK) {
    throw new Error(`Threads profile scrape accepts at most ${THREADS_PROFILE_CHUNK} usernames per run (got ${list.length}) — use fetchThreadsProfileItems`)
  }
  const res = await fetch(`${PROXY}/start-run/threads-scraper`, {
    method: 'POST',
    headers: await workerHeaders({ 'Content-Type': 'application/json' }),
    // max_posts floored at 10 (actor minimum); we only need profile-level
    // follower/bio, so the exact post count doesn't matter.
    body: JSON.stringify({ mode: 'user', usernames: list, max_posts: Math.max(10, postsPerUser) }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Failed to start Threads profile enrichment (${res.status}): ${text || 'no response body'}`)
  }
  const { data } = await res.json()
  return data
}

// futurizerush/meta-threads-scraper input schema: usernames maxItems = 20.
const THREADS_PROFILE_CHUNK = 20
// Cap concurrent enrichment runs — chunks beyond this queue up client-side.
const THREADS_PROFILE_CONCURRENCY = 5

/**
 * Run an array of async task fns with at most `limit` in flight, returning
 * their results in task order. Tasks are expected to handle their own errors
 * (a throw rejects the whole pool) — every caller here wraps per-task
 * try/catch so one failed Apify run never sinks its siblings. If the Apify
 * plan's concurrency limit is exceeded, extra runs just sit in READY until
 * capacity frees, which pollUntilDone already waits through.
 */
export async function runWithConcurrency(tasks, limit) {
  const results = new Array(tasks.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(limit, tasks.length) }, async () => {
      while (next < tasks.length) {
        const i = next++
        results[i] = await tasks[i]()
      }
    })
  )
  return results
}

/**
 * Chunked Threads profile enrichment: splits handles into runs of ≤20 (the
 * actor's hard input-schema cap — see startThreadsProfileScrape), runs up to
 * 5 chunks concurrently, retries each chunk once with a fresh run (fresh
 * proxy IP recovers most transient Meta blocks), and returns the combined
 * dataset items. A chunk that still returns nothing after the retry is
 * dropped — partial results are far better than none, and the caller treats
 * only a fully-empty result as "enrichment blocked".
 */
export async function fetchThreadsProfileItems(usernames, postsPerUser = 10, onProgress) {
  const list = [...new Set((usernames || []).map((u) => String(u).trim()).filter(Boolean))]
  if (list.length === 0) throw new Error('No usernames to enrich')
  const chunks = []
  for (let i = 0; i < list.length; i += THREADS_PROFILE_CHUNK) {
    chunks.push(list.slice(i, i + THREADS_PROFILE_CHUNK))
  }

  async function runChunk(chunk) {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 4000))
      try {
        const run = await startThreadsProfileScrape(chunk, postsPerUser)
        const completed = await pollUntilDone(run, { allowPartial: true })
        if (completed.defaultDatasetId) {
          const items = await getDatasetItems(completed.defaultDatasetId)
          if (items.length > 0) return items
        }
      } catch (err) {
        console.error(`Threads profile enrichment chunk of ${chunk.length} failed (attempt ${attempt + 1}/2):`, err)
      }
    }
    return []
  }

  let done = 0
  const perChunk = await runWithConcurrency(
    chunks.map((chunk) => async () => {
      const items = await runChunk(chunk)
      done += chunk.length
      if (onProgress) onProgress(Math.min(done, list.length), list.length)
      return items
    }),
    THREADS_PROFILE_CONCURRENCY
  )
  return perChunk.flat()
}

// Used for KolLookup (single-profile mode)
export async function startReelScraper(usernames, resultsLimit = 30) {
  const list = Array.isArray(usernames) ? usernames : [usernames]
  const res = await fetch(`${PROXY}/start-run/reel-scraper`, {
    method: 'POST',
    headers: await workerHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ username: list, resultsLimit }),
  })
  if (!res.ok) throw new Error(`Failed to start actor (${res.status})`)
  const { data } = await res.json()
  return data
}

export async function getRun(runId) {
  const res = await fetch(`${PROXY}/run-status/${runId}`, { headers: await workerHeaders() })
  if (!res.ok) throw new Error(`Failed to get run (${res.status})`)
  const { data } = await res.json()
  return data
}

export async function getDatasetItems(datasetId) {
  const res = await fetch(`${PROXY}/dataset/${datasetId}`, { headers: await workerHeaders() })
  if (!res.ok) throw new Error(`Failed to fetch dataset (${res.status})`)
  return res.json()
}

// Poll with backoff: 3s → 5s → 8s → 10s (cap)
const POLL_DELAYS = [3000, 5000, 8000, 10000]

// allowPartial: when true, a non-SUCCEEDED terminal status (FAILED/ABORTED/
// TIMED-OUT) is returned instead of thrown, so the caller can still read the
// run's dataset. The Threads actor exits non-zero when Threads rate-limits one
// or more keywords, but it has usually already pushed whatever posts it did
// fetch — those are worth salvaging rather than discarding the whole run.
export async function pollUntilDone(run, { timeoutMs = 300000, allowPartial = false } = {}) {
  let runData = run
  let attempt = 0
  const deadline = Date.now() + timeoutMs
  while (runData.status === 'READY' || runData.status === 'RUNNING') {
    if (Date.now() >= deadline) {
      throw new Error(`Apify run timed out after ${Math.round(timeoutMs / 1000)}s`)
    }
    const delay = POLL_DELAYS[Math.min(attempt, POLL_DELAYS.length - 1)]
    await new Promise((r) => setTimeout(r, delay))
    attempt++
    runData = await getRun(runData.id)
  }
  if (runData.status !== 'SUCCEEDED') {
    if (allowPartial) return runData
    throw new Error(`Actor run ${runData.status.toLowerCase()}`)
  }
  return runData
}

// ── Campaign Ops Phase 2 ──────────────────────────────────────────────────────
// Trigger the verification engine for one campaign on demand (the worker also
// runs it on a cron). Returns { checked, matched, overdue, posts }.
export async function runVerification(campaignId) {
  const res = await fetch(`${PROXY}/verify-campaign`, {
    method: 'POST',
    headers: await workerHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ campaignId }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Verification failed (${res.status}): ${text || 'no response body'}`)
  }
  const { summary } = await res.json()
  return summary
}

// Generate an overdue nudge DM draft. Language follows the market (HK →
// Cantonese, TW → zh-TW) — the worker never mixes them. Returns { draft, language }.
export async function draftNudge({ handle, brand, market }) {
  const res = await fetch(`${PROXY}/draft-nudge`, {
    method: 'POST',
    headers: await workerHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ handle, brand, market }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Nudge draft failed (${res.status}): ${text || 'no response body'}`)
  }
  return res.json()
}

// Create-or-sync the campaign's Google Sheet (one-way push). `values` is the 2D
// grid from buildCampaignSheetValues. Returns { url, created }.
export async function syncCampaignSheet(campaignId, title, values) {
  const res = await fetch(`${PROXY}/campaign-sheet`, {
    method: 'POST',
    headers: await workerHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ campaignId, title, values }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Sheet sync failed (${res.status}): ${text || 'no response body'}`)
  }
  return res.json()
}

export async function fetchBatchStats(usernames, onProgress) {
  const CHUNK = 50
  const statsMap = {}
  const failed = []
  let done = 0
  const total = usernames.length

  const reportProgress = (n) => {
    done += n
    if (onProgress) onProgress(Math.min(done, total), total)
  }

  // Run one Apify actor call for a batch of usernames. Apify persists
  // whatever it scraped before an error into the run's dataset even when the
  // run's final status isn't SUCCEEDED (e.g. one private/unscrapable account
  // trips an abort) — that data has already been paid for, so read it
  // regardless of status instead of discarding the whole run. Each username
  // is then judged individually against what's actually in the dataset: this
  // isolates a bad account for free, with no extra Apify runs. Bisection
  // retry only kicks in as a last resort, when the run couldn't even be
  // started/reached at all (so there's no dataset to recover from).
  async function fetchBatch(batch) {
    let completed
    try {
      const run = await startInstagramScraper(batch, 10)
      try {
        completed = await pollUntilDone(run)
      } catch {
        completed = run // non-SUCCEEDED or our poll timed out — recover what's there
      }
    } catch (err) {
      if (batch.length === 1) {
        failed.push(batch[0])
        reportProgress(1)
        console.error(`fetchBatchStats: failed to start run for ${batch[0]}:`, err)
        return
      }
      const mid = Math.ceil(batch.length / 2)
      await Promise.allSettled([
        fetchBatch(batch.slice(0, mid)),
        fetchBatch(batch.slice(mid)),
      ])
      return
    }

    const items = completed.defaultDatasetId ? await getDatasetItems(completed.defaultDatasetId) : []

    const followerMap = {}
    const byUser = {}
    for (const item of items) {
      if (item.followersCount != null && item.username && item.timestamp == null) {
        followerMap[item.username] = item.followersCount
        continue
      }
      const u = item.ownerUsername
      if (!u) continue
      if (item.ownerFollowersCount != null && followerMap[u] == null) {
        followerMap[u] = item.ownerFollowersCount
      }
      if (!byUser[u]) byUser[u] = []
      byUser[u].push(item)
    }

    for (const username of batch) {
      if (byUser[username] || followerMap[username] != null) {
        const stats = computeStats(byUser[username] || [])
        if (followerMap[username] != null) stats.followerCount = followerMap[username]
        statsMap[username] = stats
      } else {
        failed.push(username)
      }
    }
    reportProgress(batch.length)
  }

  const chunks = []
  for (let i = 0; i < usernames.length; i += CHUNK) {
    chunks.push(usernames.slice(i, i + CHUNK))
  }
  await Promise.allSettled(chunks.map((chunk) => fetchBatch(chunk)))

  // Attach the failed usernames as a non-enumerable property so existing
  // callers that iterate the map (e.g. Object.entries) are unaffected, while
  // callers that care about partial failure can read statsMap._failed.
  Object.defineProperty(statsMap, '_failed', { value: failed, enumerable: false })

  return statsMap
}
