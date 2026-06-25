const NICHE_KEYWORDS = {
  beauty: ['makeup', 'lipstick', 'foundation', 'eyeshadow', 'blush', 'mascara', 'concealer', 'beauty', '化妝', '唇膏', '眼影', '粉底'],
  skincare: ['skincare', 'serum', 'moisturizer', 'spf', 'sunscreen', 'toner', 'retinol', 'acne', 'skin', '護膚', '精華', '保濕', '防曬'],
  lifestyle: ['lifestyle', 'daily', 'vlog', 'life', '生活', '日常', '分享'],
  fashion: ['fashion', 'style', 'outfit', 'ootd', 'wear', '穿搭', '時尚', '造型'],
  health: ['health', 'wellness', 'yoga', 'gym', 'fitness', 'workout', 'nutrition', '健康', '健身', '瑜伽'],
  food: ['food', 'eat', 'restaurant', 'recipe', 'cooking', 'foodie', '美食', '食物', '餐廳', '食'],
}

function textContainsAny(text, keywords) {
  const lower = text.toLowerCase()
  return keywords.filter((kw) => lower.includes(kw.toLowerCase()))
}

// Engagement Score (export data): log(1 + avgLikes + avgComments×1.5)
// Instagram has no native repost metric — avgComments used as Replies, reposts treated as 0
function scoreEngagement(inf) {
  const likes = inf.avgLikes || 0
  const comments = inf.avgComments || 0
  const raw = Math.log(1 + likes + comments * 1.5)
  return { score: parseFloat(Math.min(10, raw).toFixed(2)) }
}

// Upgraded Engagement Score using live Apify median data.
// Views weighted at 0.8×; comments weighted at 1.5× (photo-only accounts will have views=0).
export function computeLiveEngagementScore(medianLikes, medianViews, medianComments) {
  const likes = medianLikes ?? 0
  const views = medianViews ?? 0
  const comments = medianComments ?? 0
  const raw = Math.log(1 + likes + views * 0.8 + comments * 1.5)
  return parseFloat(Math.min(10, raw).toFixed(2))
}

// Relevancy Score: baseline 3, +1 per keyword hit in target niches, -1 per off-niche category match
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

  const score = Math.max(0, Math.min(10, 3 + hits - deductions))
  return { score, signals: [...new Set(signals)].slice(0, 5) }
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

function buildFlags(inf, relevancyScore, botScore, config) {
  const flags = []
  if ((inf.videoRatio || 0) >= 0.5) flags.push('video-creator')
  if (relevancyScore.score >= 7) {
    const niches = config.niches.map((n) => n.replace(/^[^\w]+ /, '').toLowerCase().split(' ')[0])
    if (niches.some((n) => ['beauty', 'makeup'].includes(n))) flags.push('beauty-niche')
    if (niches.some((n) => n === 'skincare')) flags.push('skincare-niche')
    if (niches.some((n) => n === 'lifestyle')) flags.push('lifestyle-niche')
  }
  if ((inf.paidCount || 0) > 0) flags.push('paid-collab-history')
  if (botScore.score <= 3) flags.push('bot-risk')
  if ((inf.avgLikes || 0) < 50) flags.push('low-engagement')

  const allText = [...inf.hashtags, ...inf.sampleCaptions].join(' ').toLowerCase()
  if (textContainsAny(allText, ['廣東', 'cantonese', '廣東話', '粵語']).length) flags.push('cantonese-speaker')
  if (textContainsAny(allText, ['mandarin', '普通話', '國語']).length) flags.push('mandarin-speaker')

  return flags
}

export async function scoreInfluencers(influencers, config) {
  return influencers.map((inf) => {
    const engagement = scoreEngagement(inf)
    const relevancy = scoreRelevancy(inf, config.niches)
    const botRisk = scoreBotRisk(inf)

    // Overall = 80% Engagement Score + 20% Relevancy Score (each 0–10, total 0–100)
    const overall = Math.round(engagement.score * 8 + relevancy.score * 2)

    const flags = buildFlags(inf, relevancy, botRisk, config)

    const verdictParts = []
    if (relevancy.score >= 7) verdictParts.push('strong niche fit')
    else if (relevancy.score >= 5) verdictParts.push('some niche relevancy')
    else verdictParts.push('weak niche relevancy')
    if (botRisk.score <= 3) verdictParts.push('possible bot activity')

    return {
      username: inf.username,
      scores: {
        relevancy: parseFloat(relevancy.score.toFixed(1)),
        engagement: engagement.score,
        botRisk: Math.round(botRisk.score),
      },
      overall,
      verdict: verdictParts.join(', ') + '.',
      flags,
      nicheSignals: relevancy.signals,
    }
  })
}
