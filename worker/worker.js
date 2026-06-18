const BASE = 'https://api.apify.com/v2'
const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'
const CLAUDE_MODEL = 'claude-sonnet-4-6'
const AI_BATCH = 10 // accounts per Claude call

function corsHeaders(origin) {
  const isAllowed = origin === 'https://abellesoo.github.io' || origin.startsWith('http://localhost:')
  const allowed = isAllowed ? origin : 'https://abellesoo.github.io'
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
}

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  })
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || ''

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) })
    }

    const { pathname } = new URL(request.url)
    const KEY = env.APIFY_API_KEY

    if (!KEY) return json({ error: 'APIFY_API_KEY not configured in Worker secrets' }, 500, origin)

    // POST /start-run/instagram-scraper
    if (pathname === '/start-run/instagram-scraper' && request.method === 'POST') {
      const body = await request.json()
      const res = await fetch(`${BASE}/acts/apify~instagram-scraper/runs?token=${KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      return json(await res.json(), res.status, origin)
    }

    // POST /start-run/reel-scraper
    if (pathname === '/start-run/reel-scraper' && request.method === 'POST') {
      const body = await request.json()
      const res = await fetch(`${BASE}/acts/apify~instagram-reel-scraper/runs?token=${KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      return json(await res.json(), res.status, origin)
    }

    // GET /run-status/:runId
    if (pathname.startsWith('/run-status/') && request.method === 'GET') {
      const runId = pathname.slice('/run-status/'.length)
      const res = await fetch(`${BASE}/actor-runs/${runId}?token=${KEY}`)
      return json(await res.json(), res.status, origin)
    }

    // GET /dataset/:datasetId
    if (pathname.startsWith('/dataset/') && request.method === 'GET') {
      const datasetId = pathname.slice('/dataset/'.length)
      const res = await fetch(`${BASE}/datasets/${datasetId}/items?token=${KEY}&limit=2000&clean=true`)
      return json(await res.json(), res.status, origin)
    }

    // POST /ai-deep-dive
    // Body: { accounts: [{ username, captions, hashtags, bio }], campaignBrief }
    // Returns: { verdicts: [{ username, verdict }] }
    if (pathname === '/ai-deep-dive' && request.method === 'POST') {
      const { accounts, campaignBrief } = await request.json()
      if (!Array.isArray(accounts) || accounts.length === 0) {
        return json({ error: 'accounts array required' }, 400, origin)
      }

      const ANTHROPIC_KEY = env.ANTHROPIC_API_KEY
      if (!ANTHROPIC_KEY) return json({ error: 'Anthropic key not configured' }, 500, origin)

      const verdicts = []
      // Process in batches of AI_BATCH to keep prompt size manageable
      for (let i = 0; i < accounts.length; i += AI_BATCH) {
        const batch = accounts.slice(i, i + AI_BATCH)
        const briefSection = campaignBrief
          ? `Campaign brief: ${campaignBrief}`
          : 'Campaign brief: Not provided — evaluate general content quality and niche coherence.'

        const accountsText = batch.map((a) => {
          const captions = (a.captions || []).join(' | ').slice(0, 500)
          const tags = (a.hashtags || []).slice(0, 15).join(' ')
          const bio = (a.bio || '').slice(0, 200)
          return `@${a.username}\nBio: ${bio || '—'}\nCaptions: ${captions || '—'}\nHashtags: ${tags || '—'}`
        }).join('\n\n---\n\n')

        const prompt = `${briefSection}

For each Instagram account below, write 2–3 sentences assessing:
1. How well the account's content style and aesthetic fits the campaign brief
2. Any notable strengths or concerns for this specific campaign

Be specific and honest. Reference actual signals from their content where possible.

Return ONLY a JSON array with no markdown fencing, no extra text:
[{"username": "...", "verdict": "..."}, ...]

Accounts:
${accountsText}`

        const res = await fetch(ANTHROPIC_API, {
          method: 'POST',
          headers: {
            'x-api-key': ANTHROPIC_KEY,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: CLAUDE_MODEL,
            max_tokens: 1024,
            messages: [{ role: 'user', content: prompt }],
          }),
        })

        if (!res.ok) {
          const errBody = await res.text()
          return json({ error: `Anthropic API error ${res.status}: ${errBody}` }, 502, origin)
        }

        const aiRes = await res.json()
        const raw = aiRes.content?.[0]?.text || '[]'
        try {
          const parsed = JSON.parse(raw)
          verdicts.push(...parsed)
        } catch {
          // If Claude didn't return valid JSON, push a fallback for each account
          for (const a of batch) {
            verdicts.push({ username: a.username, verdict: raw.slice(0, 300) })
          }
        }
      }

      return json({ verdicts }, 200, origin)
    }

    return new Response('Not found', { status: 404, headers: corsHeaders(origin) })
  },
}
