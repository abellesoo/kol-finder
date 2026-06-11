const BASE = 'https://api.apify.com/v2'
const TOKEN = import.meta.env.VITE_APIFY_API_KEY

export async function startReelScraper(username) {
  const res = await fetch(
    `${BASE}/acts/apify~instagram-reel-scraper/runs?token=${TOKEN}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: [username],
        resultsLimit: 100,
      }),
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
    `${BASE}/datasets/${datasetId}/items?token=${TOKEN}&limit=200&clean=true`
  )
  if (!res.ok) throw new Error(`Failed to fetch dataset (${res.status})`)
  return res.json()
}
