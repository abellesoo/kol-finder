const PROXY = (import.meta.env.VITE_PROXY_URL || 'https://kol-finder-proxy.asoo.workers.dev').replace(/\/$/, '')

/**
 * Call the Worker's /ai-deep-dive endpoint.
 * accounts: [{ username, captions, hashtags, bio }]
 * campaignBrief: string
 * Returns [{ username, verdict }]
 */
export async function fetchAiVerdicts(accounts, campaignBrief) {
  const res = await fetch(`${PROXY}/ai-deep-dive`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ accounts, campaignBrief }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `AI Deep-Dive failed (${res.status})`)
  }
  const { verdicts } = await res.json()
  return verdicts || []
}
