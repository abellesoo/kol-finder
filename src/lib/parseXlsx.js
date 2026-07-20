// Signal lists for location inference when structured city/country fields are absent.
// Keyed by display name; the entry with the most keyword hits wins.
const LOCATION_SIGNALS = {
  'Hong Kong': [
    '香港', 'hong kong', 'hongkong', 'hkig', 'hkgirl', 'hkboy',
    '萬寧', '屈臣氏', '莎莎', 'sasa', 'watsons', 'mannings',
    'causeway bay', 'mong kok', 'tsim sha tsui', 'admiralty', 'tst', 'cwb',
    '銅鑼灣', '旺角', '尖沙咀', '中環', '灣仔',
    'cantonese', '廣東話', '粵語',
  ],
  'Taiwan': [
    '台灣', 'taiwan', '台北', 'taipei', '高雄', '台中',
    'nt$', '國語', '台語', '繁體', '正體',
  ],
  'Singapore': ['singapore', '新加坡', 'sgig', 'sgfashion', 'sgbeauty', 'sgd', 'orchard', 'sentosa'],
  'Macau': ['macau', 'macao', '澳門'],
}

// Score `searchText` (already-joined hashtags/captions/bio/etc.) against each
// LOCATION_SIGNALS entry and return the name with the most keyword hits, or ''
// if nothing matches. Shared by IG (structured-field fallback) and Threads
// (only signal available — Threads posts carry no city/country/locationName).
function matchLocationSignals(searchText) {
  const lower = searchText.toLowerCase()
  let bestLocation = ''
  let bestCount = 0
  for (const [loc, signals] of Object.entries(LOCATION_SIGNALS)) {
    const count = signals.filter((kw) => lower.includes(kw.toLowerCase())).length
    if (count > bestCount) {
      bestCount = count
      bestLocation = loc
    }
  }
  return bestLocation
}

// Handle hashtags from both xlsx rows (hashtags/0, hashtags/1…) and raw API items (array)
function getRowHashtags(row) {
  if (Array.isArray(row.hashtags)) return row.hashtags.map((h) => String(h).toLowerCase())
  const tags = []
  for (let i = 0; i <= 29; i++) {
    const tag = row[`hashtags/${i}`]
    if (tag) tags.push(String(tag).toLowerCase())
  }
  return tags
}

function getVideoViews(row) {
  const v = Number(
    row['videoViewCount'] ?? row['videoPlayCount'] ?? row['igPlayCount'] ?? row['playsCount'] ?? row['views']
  )
  return isNaN(v) ? 0 : v
}

/**
 * Aggregate an array of post-level items (from xlsx or direct Apify API) into
 * one influencer object per unique ownerUsername. Works with both data sources.
 */
export function aggregatePostItems(rows, brandName = '') {
  const byOwner = {}
  for (const row of rows) {
    const username = row['ownerUsername']
    if (!username) continue
    if (!byOwner[username]) {
      byOwner[username] = {
        username,
        fullName: row['ownerFullName'] || '',
        posts: [],
      }
    }
    byOwner[username].posts.push(row)
  }

  const influencers = Object.values(byOwner).map((inf) => {
    const posts = inf.posts
    const n = posts.length

    // Engagement — hidden likes (likesCount === -1 / null) are EXCLUDED from the
    // average, not counted as 0, so a few hidden posts don't deflate avgLikes.
    const visibleLikePosts = posts.filter((p) => {
      const v = Number(p.likesCount)
      return !isNaN(v) && v >= 0
    })
    const totalLikes = visibleLikePosts.reduce((s, p) => s + Number(p.likesCount), 0)
    const avgLikes = visibleLikePosts.length ? Math.round(totalLikes / visibleLikePosts.length) : 0

    // Comments — likewise exclude hidden/negative counts (a -1 would subtract).
    const visibleCommentPosts = posts.filter((p) => Number(p.commentsCount) >= 0)
    const totalComments = visibleCommentPosts.reduce((s, p) => s + Number(p.commentsCount), 0)
    const avgComments = visibleCommentPosts.length ? Math.round(totalComments / visibleCommentPosts.length) : 0

    // Follower count — take first non-zero value across posts
    const followerCount =
      posts.map((p) => Number(p['ownerFollowersCount'])).find((f) => f > 0) ?? null

    // Engagement rate = (avgLikes + avgComments) / followers × 100
    const engagementRate =
      followerCount ? parseFloat(((avgLikes + avgComments) / followerCount * 100).toFixed(2)) : null

    // Content format
    const videoTypes = ['video', 'clip', 'reel']
    const videoPosts = posts.filter((p) =>
      videoTypes.includes((p['type'] || p['productType'] || '').toLowerCase())
    )
    const videoRatio = videoPosts.length / n

    // Collect all captions
    const captions = posts.map((p) => p['caption'] || '').filter(Boolean).join(' ')

    // Collect all hashtags (handles xlsx and API formats)
    const hashtags = posts.flatMap(getRowHashtags)
    const uniqueHashtags = [...new Set(hashtags)]

    // Location signals
    const locationNames = posts
      .map((p) => p['locationName'])
      .filter(Boolean)
      .map((l) => l.toLowerCase())

    // Paid partnership count
    const paidCount = posts.filter(
      (p) => p['paidPartnership'] === true || p['paidPartnership'] === 'TRUE'
    ).length

    // Export-derived median stats (no date filter; user controls period in Apify).
    // Hidden/invalid likes are EXCLUDED from the median rather than counted as 0.
    const xlsxLikeValues = posts
      .map((p) => Number(p['likesCount']))
      .filter((v) => !isNaN(v) && v >= 0)
    const xlsxViewValues = posts.map(getVideoViews).filter((v) => v > 0)
    const xlsxHiddenCount = posts.filter(
      (p) => p['likesCount'] === -1 || p['likesCount'] == null
    ).length

    const xlsxSortedLikes = [...xlsxLikeValues].sort((a, b) => a - b)
    const xlsxMidL = Math.floor(xlsxSortedLikes.length / 2)
    const xlsxMedianLikes = xlsxSortedLikes.length === 0 ? null
      : xlsxSortedLikes.length % 2 === 0
        ? Math.round((xlsxSortedLikes[xlsxMidL - 1] + xlsxSortedLikes[xlsxMidL]) / 2)
        : xlsxSortedLikes[xlsxMidL]

    const xlsxSortedViews = [...xlsxViewValues].sort((a, b) => a - b)
    const xlsxMidV = Math.floor(xlsxSortedViews.length / 2)
    const xlsxMedianViews = xlsxSortedViews.length === 0 ? null
      : xlsxSortedViews.length % 2 === 0
        ? Math.round((xlsxSortedViews[xlsxMidV - 1] + xlsxSortedViews[xlsxMidV]) / 2)
        : xlsxSortedViews[xlsxMidV]

    // Bio — take first non-empty value across posts
    const bio = posts.map((p) => p['ownerBiography'] || p['biography'] || '').find(Boolean) || ''

    // Profile location — prefer structured fields; fall back to signal matching
    let accountLocation = posts
      .map((p) => p['city'] || p['ownerCity'] || p['profileCity'] || p['locationCity'] || p['country'] || p['ownerCountry'] || '')
      .find(Boolean) || ''

    if (!accountLocation) {
      accountLocation = matchLocationSignals([...uniqueHashtags, captions, ...locationNames, bio].join(' '))
    }

    // Most recent post URL
    const samplePost = posts[0] || null
    const samplePostUrl = posts
      .map((p) => p['url'] || (p['shortCode'] ? `https://www.instagram.com/p/${p['shortCode']}/` : null))
      .find(Boolean) || ''

    const sampleCaption = posts.map((p) => p['caption'] || '').find(Boolean) || ''

    const samplePostLikes = samplePost
      ? (() => { const v = Number(samplePost['likesCount']); return isNaN(v) || v < 0 ? null : v })()
      : null
    const samplePostComments = samplePost ? (Number(samplePost['commentsCount']) || null) : null
    const samplePostPlays = samplePost
      ? (() => { const v = getVideoViews(samplePost); return v === 0 ? null : v })()
      : null

    return {
      username: inf.username,
      fullName: inf.fullName,
      bio,
      platform: 'instagram',
      sourceBrand: brandName,
      accountLocation,
      postCount: n,
      avgLikes,
      avgComments,
      totalEngagement: avgLikes + avgComments,
      followerCount,
      engagementRate,
      xlsxMedianLikes,
      xlsxMedianViews,
      xlsxHiddenCount,
      xlsxRecentCount: posts.length,
      videoRatio: Math.round(videoRatio * 100),
      hasVideos: videoRatio > 0,
      captions,
      hashtags: uniqueHashtags.slice(0, 40),
      locationNames,
      paidCount,
      samplePostUrl,
      sampleCaption,
      samplePostLikes,
      samplePostComments,
      samplePostPlays,
      sampleCaptions: posts.slice(0, 5).map((p) => p['caption'] || '').filter(Boolean),
    }
  })

  influencers.sort((a, b) => b.totalEngagement - a.totalEngagement)
  return influencers
}

// Map the Threads actor's post language to our location labels. `language` is
// a strong signal (zh_TW ≈ Taiwan audience) — fall back to LOCATION_SIGNALS
// text matching when it's absent or ambiguous.
const THREADS_LANGUAGE_LOCATIONS = { zh_TW: 'Taiwan', zh_HK: 'Hong Kong' }

// Written-Cantonese markers — characters used in Hong Kong vernacular writing
// that essentially never appear in Taiwan / standard-Mandarin posts. Threads
// skews heavily Taiwanese and its search actor has NO geo filter, so any
// Traditional-Chinese query returns a TW-dominated feed. A Cantonese caption is
// the strongest available signal that an account is actually Hong Kong — far
// stronger than Meta's `language` tag, which labels most HK creators zh_TW or
// leaves them blank. Ambiguous characters that also occur in Mandarin compounds
// (係 in 關係, 邊 in 旁邊, 點 in 地點, 度 in 溫度) are deliberately EXCLUDED — only
// high-confidence markers are listed, to avoid false-positive HK labels.
const CANTONESE_MARKERS = /[嘅唔咗喺啲嗰冇佢嘢嚟諗咩㗎睇攞靚咁乜攰嘥嗌畀嘞]/
export function isCantoneseText(text) {
  return CANTONESE_MARKERS.test(String(text || ''))
}

// Pull every URL a Threads item exposes (post links + bio/external links + link
// previews) into a flat string list — buildFlags scans these for affiliate-link
// patterns. Handles both actor shapes: futurizerush (urls/bio_links/
// external_links, string or {url}) and igview-owner (linkPreviewUrl/…).
function threadsItemLinks(row) {
  const out = []
  for (const list of [row.urls, row.bio_links, row.external_links]) {
    for (const entry of list || []) {
      const url = typeof entry === 'string' ? entry : entry?.url
      if (url) out.push(String(url))
    }
  }
  for (const u of [row.linkPreviewUrl, row.linkPreviewDisplayUrl, row.link_preview_url]) {
    if (u) out.push(String(u))
  }
  return out
}

// Field readers that bridge the two Threads actors' naming conventions:
// igview-owner uses camelCase (likeCount, captionText, postUrl…), futurizerush
// uses snake_case (like_count, text_content, post_url…).
const tLikes   = (p) => Number(p.like_count ?? p.likeCount)
const tReplies = (p) => Number(p.reply_count ?? p.directReplyCount)
const tViews   = (p) => Number(p.view_count ?? NaN)
const tCaption = (p) => p.text_content ?? p.captionText ?? ''
const tPostUrl = (p) => p.post_url ?? p.postUrl ?? ''
const tPaid    = (p) => p.is_paid_partnership === true || p.isPaidPartnership === true
const tName    = (p) => p.display_name ?? p.fullName ?? ''
const tIsVideo = (p) =>
  (p.media_type || '').toLowerCase() === 'video' || !!p.videoUrl || (p.allVideos || []).length > 0

/**
 * Aggregate Threads search items into influencer objects with the SAME shape
 * aggregatePostItems produces, so the whole scoring/review pipeline works
 * unchanged. Handles both actor shapes (see the tXxx field readers above).
 *  - engagement: likes / replies (as comments) / views (futurizerush only)
 *  - follower count + bio: igview-owner search doesn't return them, so they
 *    come from `enrichByUser` (a username→{followerCount,bio} map built from a
 *    futurizerush user-mode enrichment run). Falls back to inline fields if the
 *    items are from futurizerush search. Blank if enrichment was skipped/failed.
 *  - provenance: the orchestrator stamps each item with `search_keyword` (the
 *    query that surfaced it) → sourceBrand; trackByTerm maps it to the track.
 *  - reshared content is skipped (the author didn't create it).
 */
export function aggregateThreadsPostItems(rows, trackByTerm = {}, enrichByUser = {}) {
  const byOwner = {}
  for (const row of rows) {
    if (row.record_type && row.record_type !== 'post') continue
    if (row.is_repost === true) continue
    const username = row.username
    if (!username) continue
    if (!byOwner[username]) byOwner[username] = { username, posts: [] }
    byOwner[username].posts.push(row)
  }

  const influencers = Object.values(byOwner).map((inf) => {
    const posts = inf.posts
    const n = posts.length
    const first = (pick) => posts.map(pick).find(Boolean) || ''

    const likeValues = posts.map(tLikes).filter((v) => !isNaN(v) && v >= 0)
    const replyValues = posts.map(tReplies).filter((v) => !isNaN(v) && v >= 0)
    const viewValues = posts.map(tViews).filter((v) => v > 0)
    const avg = (vals) => (vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : 0)
    const median = (vals) => {
      if (!vals.length) return null
      const sorted = [...vals].sort((a, b) => a - b)
      const mid = Math.floor(sorted.length / 2)
      return sorted.length % 2 === 0 ? Math.round((sorted[mid - 1] + sorted[mid]) / 2) : sorted[mid]
    }

    const avgLikes = avg(likeValues)
    const avgComments = avg(replyValues)
    // Enrichment (futurizerush user mode) wins; fall back to inline follower
    // counts if the items came from futurizerush search; else null (blank).
    const enrich = enrichByUser[inf.username] || {}
    const followerCount =
      (enrich.followerCount > 0 ? enrich.followerCount : null) ??
      (posts.map((p) => Number(p.followers_count)).find((f) => f > 0) ?? null)
    const engagementRate = followerCount
      ? parseFloat((((avgLikes + avgComments) / followerCount) * 100).toFixed(2))
      : null

    const videoPosts = posts.filter(tIsVideo)
    const videoRatio = n ? videoPosts.length / n : 0

    const captionsList = posts.map(tCaption).filter(Boolean)
    // igview-owner search items have no hashtag array — pull them from caption
    // text (works for CJK tags like #掉髮). futurizerush provides hashtags[].
    const hashtags = [
      ...new Set(
        posts.flatMap((p) =>
          (p.hashtags || (tCaption(p).match(/#[^\s#]+/g) || [])).map((h) =>
            String(h).replace(/^#/, '').toLowerCase()
          )
        )
      ),
    ]
    const bio = enrich.bio || first((p) => p.bio)
    const paidCount = posts.filter(tPaid).length

    // Which search terms surfaced this account (usually one, can be several).
    const terms = [...new Set(posts.map((p) => p.search_keyword).filter(Boolean))]
    const sourceTrack = trackByTerm[terms[0]] || null

    // Location signal, strongest first. Threads posts carry no city/country/
    // locationName field (unlike IG), so text signals are all we have:
    //  1. Written Cantonese in caption/bio — highest confidence, overrides below.
    //  2. Brand/district/keyword matching (same LOCATION_SIGNALS list IG uses)
    //     over hashtags+captions+bio — catches HK (and TW/SG/Macau) accounts
    //     that don't happen to use a Cantonese-only character.
    //  3. Meta's `language` tag — weakest; defaults most HK creators to zh_TW.
    const writesCantonese =
      isCantoneseText(captionsList.join(' ')) || isCantoneseText(bio)
    const accountLocation = writesCantonese
      ? 'Hong Kong'
      : matchLocationSignals([...hashtags, captionsList.join(' '), bio].join(' ')) ||
        (enrich.accountLocation || '') || first((p) => THREADS_LANGUAGE_LOCATIONS[p.language])

    const samplePost = posts[0] || null
    const sampleLikes = samplePost ? tLikes(samplePost) : NaN
    const sampleViews = samplePost ? tViews(samplePost) : NaN

    return {
      username: inf.username,
      fullName: first(tName),
      bio,
      platform: 'threads',
      sourceBrand: terms.join(', '),
      sourceTrack,
      // How many distinct search terms surfaced this account — cross-term hits
      // are a strong creator signal (scoring gives them a relevancy bonus).
      discoveryTermCount: terms.length,
      accountLocation,
      postCount: n,
      avgLikes,
      avgComments,
      totalEngagement: avgLikes + avgComments,
      followerCount,
      engagementRate,
      // Prefer enrichment medians (futurizerush user mode) — they include views
      // and cover the account's recent posts. Fall back to the search items'
      // medians (igview-owner: likes/replies only, no views) if enrichment was
      // skipped or failed.
      xlsxMedianLikes: enrich.medianLikes ?? median(likeValues),
      xlsxMedianViews: enrich.medianViews ?? median(viewValues),
      xlsxMedianComments: enrich.medianComments ?? median(replyValues),
      xlsxHiddenCount: 0,
      xlsxRecentCount: n,
      videoRatio: Math.round(videoRatio * 100),
      hasVideos: videoRatio > 0,
      captions: captionsList.join(' '),
      hashtags: hashtags.slice(0, 40),
      locationNames: [],
      paidCount,
      linkUrls: [...new Set(posts.flatMap(threadsItemLinks))].slice(0, 20),
      samplePostUrl: first(tPostUrl),
      sampleCaption: captionsList[0] || '',
      samplePostLikes: isNaN(sampleLikes) || sampleLikes < 0 ? null : sampleLikes,
      samplePostComments: samplePost ? tReplies(samplePost) || null : null,
      samplePostPlays: isNaN(sampleViews) || sampleViews <= 0 ? null : sampleViews,
      sampleCaptions: captionsList.slice(0, 5),
    }
  })

  influencers.sort((a, b) => b.totalEngagement - a.totalEngagement)
  return influencers
}

/**
 * Build a username→{followerCount,bio,accountLocation,medianLikes,
 * medianComments,medianViews} map from the raw items of a futurizerush
 * user-mode enrichment run. The search actor (igview-owner) returns none of
 * these; user mode returns follower_count/bio/language plus per-post
 * like_count/reply_count/view_count, so we compute the medians here. For
 * Threads this enrichment IS the "live" data (same-session, freshest), so the
 * results table treats these medians as live. Reshared posts are excluded from
 * the medians (the account didn't author that content). Views are only counted
 * when Threads actually exposed them (view_count_status !== 'not_available').
 */
export function buildThreadsEnrichment(rows) {
  const acc = {}
  for (const row of rows || []) {
    const u = row.username
    if (!u) continue
    if (!acc[u]) acc[u] = { followerCount: null, bio: '', accountLocation: '', likes: [], replies: [], views: [] }
    const a = acc[u]
    const followers = Number(row.followers_count)
    if (!isNaN(followers) && followers > 0 && !(a.followerCount > 0)) a.followerCount = followers
    if (!a.bio && row.bio) a.bio = row.bio
    if (!a.accountLocation && THREADS_LANGUAGE_LOCATIONS[row.language]) {
      a.accountLocation = THREADS_LANGUAGE_LOCATIONS[row.language]
    }
    if (row.is_repost === true) continue
    const lk = Number(row.like_count)
    if (!isNaN(lk) && lk >= 0) a.likes.push(lk)
    const rp = Number(row.reply_count)
    if (!isNaN(rp) && rp >= 0) a.replies.push(rp)
    const vw = Number(row.view_count)
    if (row.view_count_status !== 'not_available' && !isNaN(vw) && vw > 0) a.views.push(vw)
  }
  const median = (vals) => {
    if (!vals.length) return null
    const s = [...vals].sort((x, y) => x - y)
    const m = Math.floor(s.length / 2)
    return s.length % 2 === 0 ? Math.round((s[m - 1] + s[m]) / 2) : s[m]
  }
  const out = {}
  for (const [u, a] of Object.entries(acc)) {
    out[u] = {
      followerCount: a.followerCount,
      bio: a.bio,
      accountLocation: a.accountLocation,
      medianLikes: median(a.likes),
      medianComments: median(a.replies),
      medianViews: median(a.views),
    }
  }
  return out
}

/**
 * Infer brand name from post rows by finding the most-mentioned @account
 * in captions, excluding the posters themselves (they're the influencers,
 * not the brand). Works well for tagged-page scrapes where 80%+ of posts
 * mention the brand.
 */
function detectBrandFromRows(rows) {
  const ownerUsernames = new Set(rows.map((r) => (r['ownerUsername'] || '').toLowerCase()))
  const counts = {}
  for (const row of rows) {
    const caption = (row['caption'] || '').toLowerCase()
    const mentions = caption.match(/@([\w.]+)/g) || []
    for (const m of mentions) {
      const handle = m.slice(1)
      if (!ownerUsernames.has(handle)) {
        counts[handle] = (counts[handle] || 0) + 1
      }
    }
  }
  if (!Object.keys(counts).length) return ''
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0]
}

/**
 * Parse Apify Instagram scraper xlsx.
 * Returns an array of influencer objects, one per unique ownerUsername.
 */
export function parseApifyXlsx(file, brandName = null) {
  const brand = brandName || null
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const XLSX = await import('xlsx')
        const data = new Uint8Array(e.target.result)
        const wb = XLSX.read(data, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws, { defval: null })
        const resolvedBrand = brand || detectBrandFromRows(rows)
        resolve(aggregatePostItems(rows, resolvedBrand))
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = () => reject(new Error(`Failed to read file: ${file?.name || 'unknown'}`))
    reader.readAsArrayBuffer(file)
  })
}
