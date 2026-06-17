const NICHE_KEYWORDS = {
  beauty: ['makeup', 'lipstick', 'foundation', 'eyeshadow', 'blush', 'mascara', 'concealer', 'beauty', '化妝', '唇膏', '眼影', '粉底'],
  skincare: ['skincare', 'serum', 'moisturizer', 'spf', 'sunscreen', 'toner', 'retinol', 'acne', 'skin', '護膚', '精華', '保濕', '防曬'],
  lifestyle: ['lifestyle', 'daily', 'vlog', 'ootd', 'life', '生活', '日常', '分享'],
  fashion: ['fashion', 'style', 'outfit', 'ootd', 'wear', '穿搭', '時尚', '造型'],
  health: ['health', 'wellness', 'yoga', 'gym', 'fitness', 'workout', 'nutrition', '健康', '健身', '瑜伽'],
  food: ['food', 'eat', 'restaurant', 'recipe', 'cooking', 'foodie', '美食', '食物', '餐廳', '食'],
}

const HK_SIGNALS = [
  '香港', 'hk', 'hong kong', 'hongkong', '萬寧', '屈臣氏', '莎莎', 'sasa', 'watsons', 'mannings',
  'causeway bay', 'mong kok', 'tsim sha tsui', 'central', 'admiralty', 'tst', 'cwb',
  '銅鑼灣', '旺角', '尖沙咀', '中環', '灣仔', 'cantonese', '廣東話', '粵語',
]
const TW_SIGNALS = ['台灣', 'taiwan', '台北', 'taipei', '高雄', '台中', 'nt$', '國語', '台語', '繁體', '正體']
const TW_PUTONGHUA_SIGNALS = ['普通話', 'putonghua', '普通話配音', '國語配音', 'mandarin voiceover', '配音', '旁白']
const SG_SIGNALS = ['singapore', '新加坡', 'sg', 'sgd', 'orchard', 'sentosa']
const MO_SIGNALS = ['macau', 'macao', '澳門', 'mo']

const LOCATION_SIGNAL_MAP = {
  'Hong Kong': HK_SIGNALS,
  'Taiwan': TW_SIGNALS,
  'Singapore': SG_SIGNALS,
  'Macau': MO_SIGNALS,
}

function textContainsAny(text, keywords) {
  const lower = text.toLowerCase()
  return keywords.filter((kw) => lower.includes(kw.toLowerCase()))
}

// Engagement Score: log(1 + Likes + Replies×3 + Reposts×2)
// Instagram has no native repost metric — avgComments used as Replies, reposts treated as 0
function scoreEngagement(inf) {
  const likes = inf.avgLikes || 0
  const comments = inf.avgComments || 0
  const raw = Math.log(1 + likes + comments * 3)
  return { score: parseFloat(Math.min(10, raw).toFixed(2)) }
}

// Relevancy Score: baseline 5, +1 per keyword hit in target niches, -1 per off-niche category match
function scoreRelevancy(inf, targetNiches) {
  const allText = [
    ...inf.hashtags,
    ...inf.sampleCaptions,
    inf.fullName || '',
  ].join(' ')

  const targetLabels = new Set(
    targetNiches.map((n) => n.replace(/^[^\w]+ /, '').toLowerCase().split(' ')[0])
  )

  let hits = 0
  let deductions = 0
  const signals = []

  for (const [nicheLabel, keywords] of Object.entries(NICHE_KEYWORDS)) {
    const found = textContainsAny(allText, keywords)
    if (targetLabels.has(nicheLabel)) {
      hits += found.length
      signals.push(...found)
    } else if (found.length > 0) {
      deductions += 1
    }
  }

  const score = Math.max(0, Math.min(10, 5 + hits - deductions))
  return { score, signals: [...new Set(signals)].slice(0, 5) }
}

function scoreLocation(inf, locationTarget) {
  const signals = LOCATION_SIGNAL_MAP[locationTarget] || []
  const allText = [
    ...inf.hashtags,
    ...inf.sampleCaptions,
    ...(inf.locationNames || []),
  ].join(' ')

  const found = textContainsAny(allText, signals)
  let score = Math.min(10, found.length * 2.5)

  if (locationTarget === 'Taiwan') {
    const hasTraditional = textContainsAny(allText, ['繁體', '正體', '國語', '台語']).length > 0
    const hasPutonghua = textContainsAny(allText, TW_PUTONGHUA_SIGNALS).length > 0
    if (hasTraditional && hasPutonghua) {
      score = Math.min(10, score + 4)
    }
  }

  return {
    score,
    signals: [...new Set(found)].slice(0, 5),
  }
}

function scoreBotRisk(inf) {
  const likes = inf.avgLikes || 0
  const comments = inf.avgComments || 0
  const ratio = likes > 0 ? comments / likes : 0

  if (likes > 5000 && ratio < 0.005) return { score: 2 }
  if (ratio < 0.01 && likes > 1000) return { score: 4 }
  if (ratio >= 0.02) return { score: 9 }
  if (ratio >= 0.01) return { score: 7 }
  return { score: 5 }
}

function buildFlags(inf, relevancyScore, locationScore, botScore, config) {
  const flags = []
  if (locationScore.score >= 5) flags.push(`${config.locationTarget.toLowerCase().replace(' ', '-')}-based`)
  if ((inf.videoRatio || 0) >= 0.5) flags.push('video-creator')
  if (relevancyScore.score >= 7) {
    const niches = config.niches.map((n) => n.replace(/^[^\w]+ /, '').toLowerCase().split(' ')[0])
    if (niches.some((n) => ['beauty', 'makeup'].includes(n))) flags.push('beauty-niche')
    if (niches.some((n) => n === 'skincare')) flags.push('skincare-niche')
    if (niches.some((n) => n === 'lifestyle')) flags.push('lifestyle-niche')
  }
  if ((inf.paidCount || 0) > 0) flags.push('paid-collab-history')
  if (botScore.score <= 3) flags.push('bot-risk')
  if ((inf.avgLikes || 0) / Math.max(inf.postCount || 1, 1) < 50) flags.push('low-engagement')

  const allText = [...inf.hashtags, ...inf.sampleCaptions].join(' ').toLowerCase()
  if (textContainsAny(allText, ['廣東', 'cantonese', '廣東話', '粵語']).length) flags.push('cantonese-speaker')
  if (textContainsAny(allText, ['mandarin', '普通話', '國語']).length) flags.push('mandarin-speaker')

  return flags
}

export async function scoreInfluencers(influencers, config) {
  return influencers.map((inf) => {
    const engagement = scoreEngagement(inf)
    const relevancy = scoreRelevancy(inf, config.niches)
    const location = scoreLocation(inf, config.locationTarget)
    const botRisk = scoreBotRisk(inf)

    // Overall = 50% Engagement Score + 50% Relevancy Score (each 0–10, total 0–100)
    const overall = Math.round((engagement.score + relevancy.score) * 5)

    const flags = buildFlags(inf, relevancy, location, botRisk, config)

    const verdictParts = []
    if (location.score >= 6) verdictParts.push(`Strong ${config.locationTarget} signals`)
    else if (location.score >= 3) verdictParts.push(`Some ${config.locationTarget} signals`)
    else verdictParts.push(`Weak ${config.locationTarget} presence`)
    if (relevancy.score >= 7) verdictParts.push('strong niche fit')
    else if (relevancy.score >= 5) verdictParts.push('some niche relevancy')
    if (botRisk.score <= 3) verdictParts.push('possible bot activity')

    return {
      username: inf.username,
      scores: {
        relevancy: parseFloat(relevancy.score.toFixed(1)),
        engagement: engagement.score,
        location: Math.round(location.score),
        botRisk: Math.round(botRisk.score),
      },
      overall,
      verdict: verdictParts.join(', ') + '.',
      flags,
      locationSignals: location.signals,
      nicheSignals: relevancy.signals,
    }
  })
}
