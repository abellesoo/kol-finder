import { classifyRegion } from './parseXlsx'

const NICHE_KEYWORDS = {
  beauty: ['makeup', 'lipstick', 'foundation', 'eyeshadow', 'blush', 'mascara', 'concealer', 'beauty', '化妝', '唇膏', '眼影', '粉底'],
  skincare: ['skincare', 'serum', 'moisturizer', 'spf', 'sunscreen', 'toner', 'retinol', 'acne', 'skin', '護膚', '精華', '保濕', '防曬'],
  lifestyle: ['lifestyle', 'daily', 'vlog', 'life', '生活', '日常', '分享'],
  fashion: ['fashion', 'style', 'outfit', 'ootd', 'wear', '穿搭', '時尚', '造型'],
  health: ['health', 'wellness', 'yoga', 'gym', 'fitness', 'workout', 'nutrition', '健康', '健身', '瑜伽'],
  food: ['food', 'eat', 'restaurant', 'recipe', 'cooking', 'foodie', '美食', '食物', '餐廳', '食'],
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Match keywords as whole words for Latin-script terms (so 'skin' no longer
// fires on 'skinny' or 'life' on 'lifestyle'). CJK terms have no word
// boundaries, so fall back to substring matching for them.
function textContainsAny(text, keywords) {
  const lower = text.toLowerCase()
  return keywords.filter((kw) => {
    const k = kw.toLowerCase()
    if (/[^\x00-\x7f]/.test(k)) return lower.includes(k)
    return new RegExp(`(^|[^a-z0-9])${escapeRegex(k)}([^a-z0-9]|$)`, 'i').test(lower)
  })
}

// Bounded follower "reach" boost added to the engagement score. log10 keeps it
// gentle — a 5k-follower account gets ~+1.85, a 50k account ~+2.35 — so a bigger
// audience helps but can't dominate (a high-follower / low-engagement account
// still scores low). followerCount may be null/0 (unknown) → no boost, no penalty.
function reachBoost(followerCount) {
  return Math.log10(1 + (followerCount || 0)) * 0.5
}

// Engagement Score (export data): log(1 + avgLikes + avgComments×1.5) + reach boost.
// Instagram has no native repost metric — avgComments used as Replies, reposts treated as 0
function scoreEngagement(inf) {
  const likes = inf.avgLikes || 0
  const comments = inf.avgComments || 0
  const raw = Math.log(1 + likes + comments * 1.5) + reachBoost(inf.followerCount)
  return { score: parseFloat(Math.min(10, raw).toFixed(2)) }
}

// Upgraded Engagement Score using live/enrichment Apify median data.
// Views weighted at 0.8×; comments weighted at 1.5× (photo-only accounts will
// have views=0); plus the bounded follower reach boost.
export function computeLiveEngagementScore(medianLikes, medianViews, medianComments, followerCount = 0) {
  const likes = medianLikes ?? 0
  const views = medianViews ?? 0
  const comments = medianComments ?? 0
  const raw = Math.log(1 + likes + views * 0.8 + comments * 1.5) + reachBoost(followerCount)
  return parseFloat(Math.min(10, raw).toFixed(2))
}

// Split a comma / newline separated keyword string (or array) into clean terms.
function parseKeywordList(input) {
  if (!input) return []
  const arr = Array.isArray(input) ? input : String(input).split(/[\n,]/)
  return arr.map((s) => String(s).trim().toLowerCase()).filter(Boolean)
}

// Target audience is free-form prose ("20–45 歲女性, 辦公室 OL, gym 女生…"), so it
// needs broader tokenising than the keyword parser: split on whitespace and CJK
// punctuation too, then drop noise (very short tokens, pure numbers, stopwords).
// The surviving terms are matched like campaign keywords so the audience
// description sharpens the seeding score.
const AUDIENCE_STOPWORDS = new Set(['and', 'the', 'for', 'with', '歲', '的', '同', '或', '都', '但', '想', '嘅', '啲'])
function parseAudienceTerms(input) {
  if (!input) return []
  return [...new Set(
    String(input)
      .toLowerCase()
      .split(/[\n,，、;；:：.。!！?？\s（）()【】\[\]／/|]+/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 2 && !/^\d+$/.test(s) && !AUDIENCE_STOPWORDS.has(s))
  )]
}

// Relevancy Score: baseline 3, then adjusted by niche fit. Built-in niche
// keywords give +1 per hit in target niches and -1 per off-niche category.
// The operator's own campaign keywords carry more weight than the fixed niche
// dictionary — they describe THIS product ("減脂", "高蛋白"), which the six built-in
// niches can't. Exclude keywords ("makeup", "化妝") are a hard negative: a match
// pulls the score below the off-niche floor so engagement can't rescue a
// wrong-vertical creator (a makeup account on a protein-shake campaign).
const TARGET_KEYWORD_WEIGHT = 1.5
const EXCLUDE_KEYWORD_PENALTY = 3
function scoreRelevancy(inf, config) {
  const targetNiches = config.niches || []
  const targetKeywords = parseKeywordList(config.targetKeywords)
  const excludeKeywords = parseKeywordList(config.excludeKeywords)

  const allText = [
    ...inf.hashtags,
    ...inf.sampleCaptions,
    inf.fullName || '',
    inf.bio || '',
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

  // Operator-defined campaign keywords — the precise, per-campaign signal.
  const targetFound = textContainsAny(allText, targetKeywords)
  hits += targetFound.length * TARGET_KEYWORD_WEIGHT
  signals.push(...targetFound)

  // Target audience terms — weighted the same as campaign keywords so the
  // "who it's for" description meaningfully shapes the seeding rank.
  const audienceFound = textContainsAny(allText, parseAudienceTerms(config.targetAudience))
  hits += audienceFound.length * TARGET_KEYWORD_WEIGHT
  signals.push(...audienceFound)

  // Exclude keywords: strong negative per matched term.
  const excludeFound = textContainsAny(allText, excludeKeywords)
  deductions += excludeFound.length * EXCLUDE_KEYWORD_PENALTY

  const score = Math.max(0, Math.min(10, 3 + hits - deductions))
  return { score, signals: [...new Set(signals)].slice(0, 5) }
}

// Off-niche floor + overall blend, shared so the initial score (here) and the
// live-median re-score in ResultsStep stay identical.
//
// Base overall = 50% Engagement + 50% Relevancy (each 0–10 → 0–100). Relevancy
// was only 20% before, which let a high-engagement wrong-niche creator top the
// list — the exact failure that seeded makeup accounts onto a protein campaign.
// When AI blend is on and a fit score exists: 35% Eng + 25% Rel + 40% AI fit.
//
// The floor is the safety net: a creator whose relevancy fell BELOW baseline
// (net off-niche / excluded matches) is capped, so reach alone can't lift a
// wrong-vertical account into the shortlist.
export const RELEVANCY_FLOOR = 3
export const OFF_NICHE_CAP = 40
export function computeOverall(engScore, relScore, aiScore = null, blendAi = false) {
  const raw = (blendAi && aiScore != null)
    ? engScore * 3.5 + relScore * 2.5 + aiScore * 4
    : engScore * 5 + relScore * 5
  let overall = Math.round(raw)
  if (relScore < RELEVANCY_FLOOR) overall = Math.min(overall, OFF_NICHE_CAP)
  return overall
}

// Higher score = HIGHER bot risk (matches the field name `botRisk`).
// A very low comment/like ratio on a high-like account is the classic
// bought-engagement signal; healthy conversation lowers the risk.
function scoreBotRisk(inf) {
  const likes = inf.avgLikes || 0
  const comments = inf.avgComments || 0
  const ratio = likes > 0 ? comments / likes : 0

  if (likes > 5000 && ratio < 0.005) return { score: 8 }
  if (ratio < 0.01 && likes > 1000) return { score: 6 }
  if (ratio >= 0.02) return { score: 1 }
  if (ratio >= 0.01) return { score: 3 }
  return { score: 5 }
}

// Affiliate-link domains. KOLs who funnel followers to affiliate shops (rather
// than the brand's own retail channel, e.g. Watsons Taiwan) are usually a
// no-go for seeding — flagged, not excluded, so a reviewer makes the call.
// NOTE: on Threads the link often sits in a self-reply under the main post; if
// the scrape doesn't return replies, absence of this flag is weak evidence.
const AFFILIATE_LINK_PATTERNS = ['s.shopee.tw', 'shopee.tw', 'shp.ee', 'shopee.com', 'shope.ee']

function hasAffiliateLink(inf) {
  const haystack = [
    inf.captions || '',
    ...(inf.sampleCaptions || []),
    ...(inf.linkUrls || []), // Threads items expose post/bio links directly
    inf.bio || '',
  ].join(' ').toLowerCase()
  return AFFILIATE_LINK_PATTERNS.some((d) => haystack.includes(d))
}

// Business/venue account detection. Keyword relevancy can't tell a gym's own
// marketing account from a fitness creator — the business is MAXIMALLY on-niche
// by its own vocabulary (name, bio and captions saturated with "fitness/健身"),
// which is exactly how @247fitness_hongkong scored 100 on a fitness campaign.
// So detect businesses structurally, not by niche:
//  - decisive markers (branch/opening-hours/"Ltd" in the name or bio) flag alone;
//  - otherwise TWO independent signal families must fire, so a creator with
//    "fitness" in their handle, or a personal trainer who takes bookings, isn't
//    misflagged on a single weak hit.
// Scopes are deliberately narrow: name words only against username+fullName,
// decisive markers only against name+bio — a follower's caption that merely
// MENTIONS a venue never fires.
const BUSINESS_NAME_WORDS = /(^|[^a-z0-9])(official|studio|salon|clinic|center|centre|academy|agency|company|shop|store|boutique|bakery|cafe|restaurant|hotel|gym|fitness|spa|hq)([^a-z0-9]|$)/i
const BUSINESS_NAME_WORDS_CJK = /健身中心|健身室|工作室|專門店|會所|中心|公司|門市/
const BUSINESS_DECISIVE = /分店|門市|營業時間|有限公司|opening hours|official account|官方帳號|官方账号/i
const BUSINESS_CONTACT = /whatsapp|wa\.me\/|hotline|預約|報名|查詢|book now|walk[- ]?in|免費試堂|membership|會籍/i
const BUSINESS_VOICE = /我們|我哋|our (members|team|store|studio|gym|branch|coaches)|join us/i

export function isBusinessAccount(inf) {
  const name = `${inf.username || ''} ${inf.fullName || ''}`
  const nameBio = `${name} ${inf.bio || ''}`
  const bioCaptions = [inf.bio || '', ...(inf.sampleCaptions || [])].join(' ')
  if (BUSINESS_DECISIVE.test(nameBio)) return true
  let families = 0
  if (BUSINESS_NAME_WORDS.test(name) || BUSINESS_NAME_WORDS_CJK.test(name)) families++
  if (BUSINESS_CONTACT.test(bioCaptions)) families++
  if (BUSINESS_VOICE.test(bioCaptions)) families++
  return families >= 2
}

function buildFlags(inf, relevancyScore, botScore, config) {
  const flags = []
  // videoRatio is a percentage (0–100) from parseXlsx, not a 0–1 fraction.
  if ((inf.videoRatio || 0) >= 50) flags.push('video-creator')
  if (relevancyScore.score >= 7) {
    const niches = config.niches.map((n) => n.replace(/^[^\w]+ /, '').toLowerCase().split(' ')[0])
    if (niches.some((n) => ['beauty', 'makeup'].includes(n))) flags.push('beauty-niche')
    if (niches.some((n) => n === 'skincare')) flags.push('skincare-niche')
    if (niches.some((n) => n === 'lifestyle')) flags.push('lifestyle-niche')
  }
  if ((inf.paidCount || 0) > 0) flags.push('paid-collab-history')
  // Both suspicious tiers (6 and 8) flag; healthy/neutral tiers (1,3,5) don't.
  // The comment/like ratio heuristic is calibrated for Instagram; Threads has
  // structurally fewer replies per like, and its visible view counts are direct
  // reach evidence — so a Threads account with real views isn't flagged.
  if (botScore.score >= 6 && !(inf.platform === 'threads' && (inf.xlsxMedianViews || 0) > 0)) {
    flags.push('bot-risk')
  }
  if ((inf.avgLikes || 0) < 50) flags.push('low-engagement')
  if (hasAffiliateLink(inf)) flags.push('affiliate-link')

  const allText = [...inf.hashtags, ...inf.sampleCaptions].join(' ').toLowerCase()
  if (textContainsAny(allText, ['廣東', 'cantonese', '廣東話', '粵語']).length) flags.push('cantonese-speaker')
  if (textContainsAny(allText, ['mandarin', '普通話', '國語']).length) flags.push('mandarin-speaker')

  return flags
}

export async function scoreInfluencers(influencers, config) {
  return influencers.map((inf) => {
    const engagement = scoreEngagement(inf)
    const relevancy = scoreRelevancy(inf, config)
    const botRisk = scoreBotRisk(inf)

    // Apply the location config option. Baked into the relevancy sub-score so
    // the effect survives ResultsStep's live engagement re-score (which only
    // recomputes engagement and preserves relevancy). Content format no longer
    // affects the score — it's a Results-step filter (video-creator flag) now.
    let relevancyScore = relevancy.score
    const configFlags = []
    if (config.locationTarget && inf.accountLocation) {
      // Classify the raw location the same way the Step-2 filter does, so a HK
      // account tagged "香港"/"Kowloon" still earns the match bonus. Off-region
      // accounts are normally filtered out before scoring; the flag remains for
      // any that slip through (e.g. re-scored legacy sessions).
      const region = classifyRegion(inf.accountLocation)
      if (region === config.locationTarget) {
        relevancyScore += 1
        configFlags.push('location-match')
      } else if (region) {
        configFlags.push('off-location')
      }
    }
    // Threads: an account surfaced by MULTIPLE search terms is far likelier a
    // genre creator than a one-off poster. Baked into relevancy (like the
    // config adjustments above) so it survives the live engagement re-score.
    if ((inf.discoveryTermCount || 0) > 1) {
      relevancyScore += 1
      configFlags.push('multi-keyword')
    }
    // A business/venue account isn't a seedable creator no matter how on-niche
    // its vocabulary is — it IS the niche. Pushing relevancy under the floor
    // triggers the OFF_NICHE_CAP in computeOverall, and (like the config
    // adjustments above) baking it into relevancy means the cap survives the
    // live engagement re-score in ResultsStep.
    const businessAccount = isBusinessAccount(inf)
    if (businessAccount) {
      relevancyScore = Math.min(relevancyScore, 2)
      configFlags.push('business-account')
    }
    relevancyScore = Math.max(0, Math.min(10, relevancyScore))
    const relevancyAdjusted = { score: relevancyScore, signals: relevancy.signals }

    // 50% Engagement + 50% Relevancy, with the off-niche cap (see computeOverall).
    const overall = computeOverall(engagement.score, relevancyScore)

    const flags = [...buildFlags(inf, relevancyAdjusted, botRisk, config), ...configFlags]

    const verdictParts = []
    if (businessAccount) verdictParts.push('looks like a business/venue account, not a creator')
    if (relevancyScore >= 7) verdictParts.push('strong niche fit')
    else if (relevancyScore >= 5) verdictParts.push('some niche relevancy')
    else verdictParts.push('weak niche relevancy')
    if (botRisk.score >= 6) verdictParts.push('possible bot activity')

    return {
      username: inf.username,
      // Platform + discovery provenance ride along so downstream views (results
      // table, review queue, exports) can render them without re-joining.
      platform: inf.platform || 'instagram',
      sourceTrack: inf.sourceTrack || null,
      sourceBrand: inf.sourceBrand || '',
      scores: {
        relevancy: parseFloat(relevancyScore.toFixed(1)),
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
