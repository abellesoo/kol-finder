import * as XLSX from 'xlsx'

/**
 * Parse Apify Instagram scraper xlsx.
 * Returns an array of influencer objects, one per unique ownerUsername.
 */
export function parseApifyXlsx(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result)
        const wb = XLSX.read(data, { type: 'array' })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows = XLSX.utils.sheet_to_json(ws, { defval: null })

        // Group posts by ownerUsername
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

        // Aggregate per influencer
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
          const captions = posts
            .map((p) => p['caption'] || '')
            .filter(Boolean)
            .join(' ')

          // Collect all hashtags
          const hashtags = []
          for (const p of posts) {
            for (let i = 0; i <= 29; i++) {
              const tag = p[`hashtags/${i}`]
              if (tag) hashtags.push(tag.toLowerCase())
            }
          }

          // Location signals
          const locationNames = posts
            .map((p) => p['locationName'])
            .filter(Boolean)
            .map((l) => l.toLowerCase())

          // Paid partnership count
          const paidCount = posts.filter((p) => p['paidPartnership'] === true || p['paidPartnership'] === 'TRUE').length

          // Deduplicated hashtags
          const uniqueHashtags = [...new Set(hashtags)]

          // XLSX-derived median stats — computed across all posts in the file
          // (no date filter: user controls the export period in Apify)
          const xlsxLikeValues = posts.map((p) => {
            const v = Number(p['likesCount'])
            return isNaN(v) || v < 0 ? 0 : v
          })
          const xlsxViewValues = posts
            .map((p) => {
              const v = Number(
                p['videoViewCount'] ?? p['videoPlayCount'] ?? p['igPlayCount'] ?? p['playsCount'] ?? p['views']
              )
              return isNaN(v) ? 0 : v
            })
            .filter((v) => v > 0)
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

          return {
            username: inf.username,
            fullName: inf.fullName,
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
            // Raw for AI
            sampleCaptions: posts.slice(0, 5).map((p) => p['caption'] || '').filter(Boolean),
          }
        })

        // Sort by total engagement desc
        influencers.sort((a, b) => b.totalEngagement - a.totalEngagement)
        resolve(influencers)
      } catch (err) {
        reject(err)
      }
    }
    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
}
