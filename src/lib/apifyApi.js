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

export async function pollUntilDone(run, { timeoutMs = 300000 } = {}) {
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
