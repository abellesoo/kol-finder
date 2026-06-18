const BASE = 'https://api.apify.com/v2'
const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'
const CLAUDE_MODEL = 'claude-sonnet-4-6'

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

    // POST /draft-dm
    // Body: { username, bio, hashtags, sampleCaptions, campaignBrief }
    // Returns: { draft }  — HK Traditional Chinese DM draft
    if (pathname === '/draft-dm' && request.method === 'POST') {
      const ANTHROPIC_KEY = env.ANTHROPIC_API_KEY
      if (!ANTHROPIC_KEY) return json({ error: 'ANTHROPIC_API_KEY not configured' }, 500, origin)

      const { username, bio, hashtags = [], sampleCaptions = [], campaignBrief = '' } = await request.json()
      if (!username) return json({ error: 'username required' }, 400, origin)

      const bioText = bio ? `個人簡介：${bio}` : ''
      const hashtagText = hashtags.slice(0, 10).join(' ')
      const captionText = sampleCaptions.slice(0, 3).join('\n---\n').slice(0, 600)
      const briefText = campaignBrief || '美妝 / 護膚品牌合作邀請'

      const prompt = `你是一位香港美妝品牌的市場推廣助理，負責以輕鬆、真誠的語氣向 Instagram KOL 發送私訊邀請合作。
請用香港慣用的繁體中文書寫，可適當夾雜英文詞彙（例如品牌名、collab、DM 等），語氣要自然親切，像朋友傳訊息一樣，不要太正式或像範本。

以下是這位 KOL 的資料：
帳號：@${username}
${bioText}
近期 hashtags：${hashtagText || '—'}
近期帖文摘要：
${captionText || '—'}

品牌合作背景：${briefText}

請寫一段 DM 草稿（100–160字），包含：
1. 簡短問候，提及你留意到對方的內容（具體提一個真實的特點）
2. 一句介紹品牌合作機會
3. 邀請對方有興趣可以回覆繼續了解詳情

只需輸出 DM 內文，不要任何解釋、標題或格式符號。`

      const res = await fetch(ANTHROPIC_API, {
        method: 'POST',
        headers: {
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: CLAUDE_MODEL,
          max_tokens: 512,
          messages: [{ role: 'user', content: prompt }],
        }),
      })

      if (!res.ok) {
        const errBody = await res.text()
        return json({ error: `Anthropic error ${res.status}: ${errBody}` }, 502, origin)
      }

      const aiRes = await res.json()
      const draft = aiRes.content?.[0]?.text?.trim() || ''
      return json({ draft }, 200, origin)
    }

    return new Response('Not found', { status: 404, headers: corsHeaders(origin) })
  },
}
