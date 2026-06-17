import { computeStats } from './computeStats'

const BASE = 'https://api.apify.com/v2'
const TOKEN = import.meta.env.VITE_APIFY_API_KEY

// Used for both batch scraping and single-profile KolLookup
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

export async function fetchBatchStats(usernames, onProgress) {
  const CHUNK = 50
  const statsMap = {}
  let done = 0

  const chunks = []
  for (let i = 0; i < usernames.length; i += CHUNK) {
    chunks.push(usernames.slice(i, i + CHUNK))
  }

  await Promise.all(chunks.map(async (chunk) => {
    const run = await startReelScraper(chunk, 30)
    const completed = await pollUntilDone(run)
    const items = await getDatasetItems(completed.defaultDatasetId)

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

    done += chunk.length
    if (onProgress) onProgress(Math.min(done, usernames.length), usernames.length)
  }))

  return statsMap
}
