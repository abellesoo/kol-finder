import * as XLSX from 'xlsx'

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

    // Engagement — hidden likes (likesCount === -1) treated as 0, not excluded
    const totalLikes = posts.reduce((s, p) => {
      const v = Number(p.likesCount)
      return s + (isNaN(v) || v < 0 ? 0 : v)
    }, 0)
    const totalComments = posts.reduce((s, p) => s + (Number(p.commentsCount) || 0), 0)
    const avgLikes = Math.round(totalLikes / n)
    const avgComments = Math.round(totalComments / n)

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

    // Export-derived median stats (no date filter; user controls period in Apify)
    const xlsxLikeValues = posts.map((p) => {
      const v = Number(p['likesCount'])
      return isNaN(v) || v < 0 ? 0 : v
    })
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
      const searchText = [
        ...uniqueHashtags,
        captions,
        ...locationNames,
        bio,
      ].join(' ').toLowerCase()

      let bestLocation = ''
      let bestCount = 0
      for (const [loc, signals] of Object.entries(LOCATION_SIGNALS)) {
        const count = signals.filter((kw) => searchText.includes(kw.toLowerCase())).length
        if (count > bestCount) {
          bestCount = count
          bestLocation = loc
        }
      }
      accountLocation = bestLocation
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
  const brand = brandName || null // null triggers auto-detect inside
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
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
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
}
