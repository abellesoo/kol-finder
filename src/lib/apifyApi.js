import { computeStats } from './computeStats'

const BASE = 'https://api.apify.com/v2'
const TOKEN = import.meta.env.VITE_APIFY_API_KEY

async function startInstagramScraper(usernames, resultsLimit = 30) {
  const res = await fetch(
    `${BASE}/acts/apify~instagram-scraper/runs?token=${TOKEN}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        usernames,
        resultsType: 'posts',
        resultsLimit,
      }),
    }
  )
  if (!res.ok) throw new Error(`Failed to start actor (${res.status})`)
  const { data } = await res.json()
  return data
}

// Kept for KolLookup (single-profile mode)
export async function startReelScraper(usernames, resultsLimit = 30) {
  const list = Array.isArray(usernames) ? usernames : [usernames]
  const res = await fetch(
    `${BASE}/acts/apify~instagram-reel-scraper/runs?token=${TOKEN}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: list, resultsLimit }),
    }
  )
  if (!res.ok) throw new Error(`Failed to start actor (${res.status})`)
  const { data } = await res.json()
  return data
}

export async function getRun(runId) {
  const res = await fetch(`${BASE}/actor-runs/${runId}?token=${TOKEN}`)
  if (!res.ok) throw new Error(`Failed to get run (${res.status})`)
  const { data } = await res.json()
  return data
}

export async function getDatasetItems(datasetId) {
  const res = await fetch(
    `${BASE}/datasets/${datasetId}/items?token=${TOKEN}&limit=2000&clean=true`
  )
  if (!res.ok) throw new Error(`Failed to fetch dataset (${res.status})`)
  return res.json()
}

async function pollUntilDone(run) {
  let runData = run
  while (runData.status === 'READY' || runData.status === 'RUNNING') {
    await new Promise((r) => setTimeout(r, 3000))
    runData = await getRun(run.id)
  }
  if (runData.status !== 'SUCCEEDED') {
    throw new Error(`Actor run ${runData.status.toLowerCase()}`)
  }
  return runData
}

/**
 * Scrape a list of usernames using the general instagram-scraper which returns
 * both post data (for median likes/views) and profile data (for follower count).
 */
export async function fetchBatchStats(usernames, onProgress) {
  const CHUNK = 50
  const statsMap = {}

  for (let i = 0; i < usernames.length; i += CHUNK) {
    const chunk = usernames.slice(i, i + CHUNK)

    const run = await startInstagramScraper(chunk, 30)
    const completed = await pollUntilDone(run)
    const items = await getDatasetItems(completed.defaultDatasetId)

    // Separate profile-level items from post-level items
    // instagram-scraper returns a mix: profile objects have followersCount,
    // post objects have ownerUsername + engagement data
    const followerMap = {}
    const byUser = {}

    for (const item of items) {
      // Post items always have a timestamp or likesCount; pure profile items do not
      const isPost = item.timestamp != null || item.likesCount !== undefined

      if (!isPost) {
        // Profile-only item
        const u = item.username
        if (u && item.followersCount != null) followerMap[u] = item.followersCount
        continue
      }

      // Post item — try multiple field names for owner
      const u = item.ownerUsername || item.username || item.owner?.username
      if (!u) continue

      if (item.followersCount != null && followerMap[u] == null) {
        followerMap[u] = item.followersCount
      }
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

    if (onProgress) onProgress(Math.min(i + CHUNK, usernames.length), usernames.length)
  }

  return statsMap
}
