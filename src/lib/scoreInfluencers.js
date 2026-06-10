/**
 * Score a batch of influencers using Claude API.
 * Returns scored influencers with AI-generated verdicts.
 */
export async function scoreInfluencers(influencers, config, apiKey) {
  const results = []

  // Process in batches of 5 to avoid token limits
  const batchSize = 5
  for (let i = 0; i < influencers.length; i += batchSize) {
    const batch = influencers.slice(i, i + batchSize)
    const scored = await scoreBatch(batch, config, apiKey)
    results.push(...scored)
  }

  return results
}

async function scoreBatch(batch, config, apiKey) {
  const prompt = buildPrompt(batch, config)

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    }),
  })

  if (!response.ok) {
    const err = await response.text()
    throw new Error(`Claude API error: ${response.status} - ${err}`)
  }

  const data = await response.json()
  const text = data.content[0].text

  try {
    const clean = text.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(clean)
    return parsed
  } catch {
    console.error('Failed to parse Claude response:', text)
    // Return batch with error scores
    return batch.map((inf) => ({
      username: inf.username,
      scores: { niche: 0, location: 0, contentFormat: 0, botRisk: 0, overall: 0 },
      verdict: 'Parse error',
      flags: ['error'],
    }))
  }
}

function buildPrompt(batch, config) {
  const nicheList = config.niches.join(', ')
  const locationTarget = config.locationTarget || 'Hong Kong'
  const requireVideo = config.requireVideo

  const influencerData = batch.map((inf) => ({
    username: inf.username,
    fullName: inf.fullName,
    avgLikes: inf.avgLikes,
    avgComments: inf.avgComments,
    postCount: inf.postCount,
    videoRatio: inf.videoRatio,
    hashtags: inf.hashtags.slice(0, 20),
    sampleCaptions: inf.sampleCaptions.map((c) => c.slice(0, 300)),
    locationNames: inf.locationNames,
    paidCount: inf.paidCount,
  }))

  return `You are scoring Instagram influencers for a beauty/skincare brand campaign targeting ${locationTarget}.

Campaign config:
- Target niches: ${nicheList}
- Target location: ${locationTarget}
- Require video content (Reels/Stories): ${requireVideo ? 'YES — deprioritize static-only accounts' : 'NO — any format ok'}

For each influencer below, return a JSON array (no markdown, raw JSON only) with this structure:
[
  {
    "username": "string",
    "scores": {
      "niche": 0-10,
      "location": 0-10,
      "contentFormat": 0-10,
      "botRisk": 0-10
    },
    "overall": 0-100,
    "verdict": "one sentence summary",
    "flags": ["array", "of", "tags"],
    "hkSignals": ["specific HK signals found in content"],
    "nicheSignals": ["beauty/skincare keywords found"]
  }
]

Scoring guide:
- niche (0-10): Does their content match ${nicheList}? Look at hashtags, captions, product mentions.
- location (0-10): Are they based in ${locationTarget}? Look for 香港, HK, Cantonese language, HK location tags, HK brand mentions (萬寧, 屈臣氏, etc).
- contentFormat (0-10): ${requireVideo ? 'Do they post Reels/videos? High videoRatio = high score.' : 'Any format acceptable, score based on content quality signals.'}
- botRisk (0-10): 10 = definitely real, 0 = likely bot. Red flags: very high likes + zero meaningful comments, generic emoji-only captions, no brand mentions.
- overall (0-100): Weighted score: niche 35%, location 30%, contentFormat 20%, botRisk 15%.

Flags to include (use these exact strings when applicable):
"hk-based", "video-creator", "beauty-niche", "lifestyle-niche", "paid-collab-history", "bot-risk", "cantonese-speaker", "mandarin-speaker", "english-only", "low-engagement"

Influencer data:
${JSON.stringify(influencerData, null, 2)}

Return ONLY the JSON array. No explanation, no markdown.`
}
