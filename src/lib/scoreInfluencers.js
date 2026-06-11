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
// Putonghua/Mandarin audio or voiceover signals — when paired with traditional Chinese = Taiwan
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

function scoreNiche(inf, targetNiches) {
  const allText = [
    ...inf.hashtags,
    ...inf.sampleCaptions,
    inf.fullName || '',
  ].join(' ')

  let hits = 0
  const signals = []

  for (const niche of targetNiches) {
    const label = niche.replace(/^[^\w]+ /, '').toLowerCase().split(' ')[0]
    const keywords = NICHE_KEYWORDS[label] || []
    const found = textContainsAny(allText, keywords)
    hits += found.length
    signals.push(...found)
  }

  return {
    score: Math.min(10, hits * 1.5),
    signals: [...new Set(signals)].slice(0, 5),
  }
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

  // Taiwan: traditional Chinese + putonghua/voiceover combo strongly indicates Taiwan
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

function scoreContentFormat(inf, requireVideo) {
  if (!requireVideo) return { score: 7 }
  const ratio = inf.videoRatio || 0
  return { score: Math.round(ratio * 10) }
}

function scoreBotRisk(inf) {
  const likes = inf.avgLikes || 0
  const comments = inf.avgComments || 0
  const ratio = likes > 0 ? comments / likes : 0

  // Very high likes, near-zero comments → suspicious
  if (likes > 5000 && ratio < 0.005) return { score: 2 }
  if (ratio < 0.01 && likes > 1000) return { score: 4 }
  if (ratio >= 0.02) return { score: 9 }
  if (ratio >= 0.01) return { score: 7 }
  return { score: 5 }
}

function buildFlags(inf, nicheScore, locationScore, contentScore, botScore, config) {
  const flags = []
  if (locationScore.score >= 5) flags.push(`${config.locationTarget.toLowerCase().replace(' ', '-')}-based`)
  if ((inf.videoRatio || 0) >= 0.5) flags.push('video-creator')
  if (nicheScore.score >= 6) {
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
    const niche = scoreNiche(inf, config.niches)
    const location = scoreLocation(inf, config.locationTarget)
    const contentFormat = scoreContentFormat(inf, config.requireVideo)
    const botRisk = scoreBotRisk(inf)

    const overall = Math.round(
      niche.score * 3.5 +
      location.score * 3.0 +
      contentFormat.score * 2.0 +
      botRisk.score * 1.5
    )

    const flags = buildFlags(inf, niche, location, contentFormat, botRisk, config)

    const verdictParts = []
    if (location.score >= 6) verdictParts.push(`Strong ${config.locationTarget} signals`)
    else if (location.score >= 3) verdictParts.push(`Some ${config.locationTarget} signals`)
    else verdictParts.push(`Weak ${config.locationTarget} presence`)
    if (niche.score >= 6) verdictParts.push('good niche fit')
    if (botRisk.score <= 3) verdictParts.push('possible bot activity')

    return {
      username: inf.username,
      scores: {
        niche: Math.round(niche.score),
        location: Math.round(location.score),
        contentFormat: Math.round(contentFormat.score),
        botRisk: Math.round(botRisk.score),
      },
      overall,
      verdict: verdictParts.join(', ') + '.',
      flags,
      locationSignals: location.signals,
      nicheSignals: niche.signals,
    }
  })
}
