const BASE = 'https://api.apify.com/v2'
const DEEPSEEK_API = 'https://api.deepseek.com/chat/completions'
const DEEPSEEK_MODEL = 'deepseek-chat'

function corsHeaders(origin) {
  const isAllowed = origin === 'https://abellesoo.github.io' || origin.startsWith('http://localhost:')
  const allowed = isAllowed ? origin : 'https://abellesoo.github.io'
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  }
}

function json(data, status, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  })
}

// --- Supabase JWT auth (HS256, dependency-free via Web Crypto) ---

// Decode a base64url string into raw bytes.
function base64UrlToBytes(b64url) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/')
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
  const binary = atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

// Decode a base64url string into a UTF-8 string.
function base64UrlToString(b64url) {
  return new TextDecoder().decode(base64UrlToBytes(b64url))
}

// Verify a Supabase-issued HS256 JWT: signature + expiry + basic claims.
// Returns the decoded payload on success, or null on any failure.
async function verifyJwt(token, secret) {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [headerB64, payloadB64, signatureB64] = parts
  try {
    const header = JSON.parse(base64UrlToString(headerB64))
    if (header.alg !== 'HS256') return null // reject alg:none and other algs

    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    )
    const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`)
    const valid = await crypto.subtle.verify('HMAC', key, base64UrlToBytes(signatureB64), data)
    if (!valid) return null

    const payload = JSON.parse(base64UrlToString(payloadB64))
    const now = Math.floor(Date.now() / 1000)
    if (payload.exp && now >= payload.exp) return null
    if (payload.nbf && now < payload.nbf) return null
    // Supabase authenticated sessions carry role/aud 'authenticated'; reject anon.
    if (payload.role === 'anon' || payload.aud === 'anon') return null
    return payload
  } catch {
    return null
  }
}

// Guard for data/action endpoints. Returns null when the request is authorised,
// or a ready-to-send Response (with CORS headers) describing the failure.
// Fails CLOSED: a missing secret rejects rather than allowing open access.
async function verifyAuth(request, env) {
  const origin = request.headers.get('Origin') || ''
  const secret = env.SUPABASE_JWT_SECRET
  if (!secret) {
    return json(
      { error: 'SUPABASE_JWT_SECRET not configured in Worker secrets — set it to enable authentication' },
      500,
      origin,
    )
  }
  const authHeader = request.headers.get('Authorization') || ''
  const match = authHeader.match(/^Bearer\s+(.+)$/i)
  if (!match) {
    return json({ error: 'Missing or malformed Authorization header (expected "Bearer <token>")' }, 401, origin)
  }
  const payload = await verifyJwt(match[1].trim(), secret)
  if (!payload) {
    return json({ error: 'Invalid or expired token' }, 401, origin)
  }
  return null
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || ''

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) })
    }

    // Every data/action endpoint below spends paid Apify/DeepSeek keys, so all
    // non-preflight requests must carry a valid Supabase JWT.
    const authError = await verifyAuth(request, env)
    if (authError) return authError

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
    // Paginates through the full dataset (Apify caps a single request at ~2000
    // items). Hard ceiling of 10000 items bounds worker memory; going over it is
    // logged and the array is returned truncated (response stays a plain array
    // so the client keeps iterating it directly).
    if (pathname.startsWith('/dataset/') && request.method === 'GET') {
      const datasetId = pathname.slice('/dataset/'.length)
      const PAGE_SIZE = 1000
      const HARD_CEILING = 10000
      const items = []
      let offset = 0
      while (true) {
        const limit = Math.min(PAGE_SIZE, HARD_CEILING - items.length)
        const res = await fetch(
          `${BASE}/datasets/${datasetId}/items?token=${KEY}&clean=true&limit=${limit}&offset=${offset}`,
        )
        if (!res.ok) {
          return json(await res.json().catch(() => ({ error: `dataset fetch failed (${res.status})` })), res.status, origin)
        }
        const page = await res.json()
        if (!Array.isArray(page)) return json(page, res.status, origin) // unexpected shape (e.g. error object)
        items.push(...page)
        if (page.length < limit) break // reached end of dataset
        if (items.length >= HARD_CEILING) {
          console.warn(`Dataset ${datasetId} exceeded ${HARD_CEILING}-item ceiling — response truncated`)
          break
        }
        offset += page.length
      }
      return json(items, 200, origin)
    }

    // POST /draft-dm
    // Body: { username, bio, hashtags, sampleCaptions, campaignBrief }
    // Returns: { draft }  — HK Traditional Chinese DM draft
    if (pathname === '/draft-dm' && request.method === 'POST') {
      const DEEPSEEK_KEY = env.DEEPSEEK_API_KEY
      if (!DEEPSEEK_KEY) return json({ error: 'DEEPSEEK_API_KEY not configured' }, 500, origin)

      const { username, bio, hashtags = [], sampleCaptions = [], campaignBrief = '' } = await request.json()
      if (!username) return json({ error: 'username required' }, 400, origin)

      // Strip control chars and lone Unicode surrogates that corrupt JSON serialisation
      const clean = (s) => String(s || '')
        .replace(/[\u0000-\u001F\u007F-\u009F]/g, ' ')
        .replace(/[\uD800-\uDFFF]/g, '')
        .trim()

      const bioText = bio ? `個人簡介：${clean(bio)}` : ''
      const hashtagText = hashtags.slice(0, 10).map(clean).join(' ')
      const captionText = sampleCaptions.slice(0, 3).map(clean).join('\n---\n').slice(0, 600)
      const briefText = clean(campaignBrief) || '美妝 / 護膚品牌合作邀請'

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

      const res = await fetch(DEEPSEEK_API, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${DEEPSEEK_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: DEEPSEEK_MODEL,
          max_tokens: 512,
          messages: [{ role: 'user', content: prompt }],
        }),
      })

      if (!res.ok) {
        const errBody = await res.text()
        return json({ error: `DeepSeek error ${res.status}: ${errBody}` }, 502, origin)
      }

      const aiRes = await res.json()
      const draft = aiRes.choices?.[0]?.message?.content?.trim() || ''
      return json({ draft }, 200, origin)
    }

    return new Response('Not found', { status: 404, headers: corsHeaders(origin) })
  },
}
