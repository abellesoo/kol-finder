import { computeStats } from './computeStats'

const BASE = 'https://api.apify.com/v2'
const TOKEN = import.meta.env.VITE_APIFY_API_KEY

export async function startReelScraper(usernames, resultsLimit = 100) {
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
    `${BASE}/datasets/${datasetId}/items?token=${TOKEN}&limit=500&clean=true`
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
 * Scrape a list of usernames in chunks of 50 and return a map of
 * username → computeStats result. Calls onProgress(done, total) after each chunk.
 */
export async function fetchBatchStats(usernames, onProgress) {
  const CHUNK = 50
  const statsMap = {}

  for (let i = 0; i < usernames.length; i += CHUNK) {
    const chunk = usernames.slice(i, i + CHUNK)
    const run = await startReelScraper(chunk, 30)
    const completed = await pollUntilDone(run)
    const items = await getDatasetItems(completed.defaultDatasetId)

    // Group items by ownerUsername
    const byUser = {}
    for (const item of items) {
      const u = item.ownerUsername
      if (!u) continue
      if (!byUser[u]) byUser[u] = []
      byUser[u].push(item)
    }

    for (const username of chunk) {
      statsMap[username] = computeStats(byUser[username] || [])
    }

    if (onProgress) onProgress(Math.min(i + CHUNK, usernames.length), usernames.length)
  }

  return statsMap
}
