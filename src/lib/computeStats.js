function median(arr) {
  if (arr.length === 0) return null
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid]
}

/**
 * Compute engagement stats from an array of Apify post items.
 * Hidden likes (likesCount === -1) are treated as 0.
 */
export function computeStats(items) {
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - 3)

  const recent = items.filter(
    (item) => item.timestamp && new Date(item.timestamp) >= cutoff
  )

  // Hidden count across ALL scraped posts (not date-filtered) for full account picture
  const hiddenCount = items.filter(
    (p) => p.likesCount === -1 || p.likesCount == null
  ).length

  const postsForMedian = recent.length > 0 ? recent : items
  const withLikes = postsForMedian.filter((p) => typeof p.likesCount === 'number')
  const medianLikes = median(withLikes.map((p) => Math.max(p.likesCount, 0)))

  const withViews = postsForMedian.filter(
    (p) => typeof p.videoViewCount === 'number' && p.videoViewCount > 0
  )
  const medianViews = median(withViews.map((p) => p.videoViewCount))

  // Follower count — take first non-zero value across items
  const followerCount =
    items.map((p) => Number(p.ownerFollowersCount ?? p.followersCount ?? 0)).find((f) => f > 0) ?? null

  return {
    total: recent.length,
    totalScraped: items.length,
    hiddenCount,
    medianLikes,
    medianViews,
    followerCount,
    posts: [...recent]
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 20),
  }
}
