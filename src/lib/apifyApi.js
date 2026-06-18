import { computeStats } from './computeStats'

// Public URL of the Cloudflare Worker proxy — not a secret.
// In production this is set via VITE_PROXY_URL in GitHub Actions.
// For local dev either point at the deployed worker or run `wrangler dev`
// in the /worker directory (listens on http://localhost:8787 by default).
const PROXY = (import.meta.env.VITE_PROXY_URL || 'https://kol-finder-proxy.asoo.workers.dev').replace(/\/$/, '')

async function startInstagramScraper(usernames, resultsLimit = 30) {
  const directUrls = usernames.map((u) => `https://www.instagram.com/${u}/`)
  const res = await fetch(`${PROXY}/start-run/instagram-scraper`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ directUrls, resultsType: 'posts', resultsLimit }),
  })
  if (!res.ok) throw new Error(`Failed to start actor (${res.status})`)
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
      if (tag) directUrls.push(`https://www.instagram.com/explore/tags/${tag}/`)
    }
  }
  if (directUrls.length === 0) throw new Error('No valid URLs or hashtags provided')
  const res = await fetch(`${PROXY}/start-run/instagram-scraper`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ directUrls, resultsType: 'posts', resultsLimit }),
  })
  if (!res.ok) throw new Error(`Failed to start actor (${res.status})`)
  const { data } = await res.json()
  return data
}

// Used for KolLookup (single-profile mode)
export async function startReelScraper(usernames, resultsLimit = 30) {
  const list = Array.isArray(usernames) ? usernames : [usernames]
  const res = await fetch(`${PROXY}/start-run/reel-scraper`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: list, resultsLimit }),
  })
  if (!res.ok) throw new Error(`Failed to start actor (${res.status})`)
  const { data } = await res.json()
  return data
}

export async function getRun(runId) {
  const res = await fetch(`${PROXY}/run-status/${runId}`)
  if (!res.ok) throw new Error(`Failed to get run (${res.status})`)
  const { data } = await res.json()
  return data
}

export async function getDatasetItems(datasetId) {
  const res = await fetch(`${PROXY}/dataset/${datasetId}`)
  if (!res.ok) throw new Error(`Failed to fetch dataset (${res.status})`)
  return res.json()
}

// Poll with backoff: 3s → 5s → 8s → 10s (cap)
const POLL_DELAYS = [3000, 5000, 8000, 10000]

export async function pollUntilDone(run) {
  let runData = run
  let attempt = 0
  while (runData.status === 'READY' || runData.status === 'RUNNING') {
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

export async function fetchBatchStats(usernames, onProgress) {
  const CHUNK = 50
  const statsMap = {}
  let done = 0

  const chunks = []
  for (let i = 0; i < usernames.length; i += CHUNK) {
    chunks.push(usernames.slice(i, i + CHUNK))
  }

  await Promise.all(chunks.map(async (chunk) => {
    const run = await startInstagramScraper(chunk, 10)
    const completed = await pollUntilDone(run)
    const items = await getDatasetItems(completed.defaultDatasetId)

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

    for (const username of chunk) {
      const stats = computeStats(byUser[username] || [])
      if (followerMap[username] != null) stats.followerCount = followerMap[username]
      statsMap[username] = stats
    }

    done += chunk.length
    if (onProgress) onProgress(Math.min(done, usernames.length), usernames.length)
  }))

  return statsMap
}
