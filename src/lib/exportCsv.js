/**
 * Export results to CSV and trigger download.
 */
export function exportToCsv(results, influencers) {
  const map = {}
  for (const inf of influencers) map[inf.username] = inf

  const headers = [
    'username',
    'fullName',
    'overall',
    'niche_score',
    'location_score',
    'format_score',
    'bot_risk_score',
    'avg_likes',
    'avg_comments',
    'post_count',
    'video_ratio_%',
    'verdict',
    'flags',
    'hk_signals',
    'niche_signals',
    'instagram_url',
  ]

  const rows = results.map((r) => {
    const inf = map[r.username] || {}
    return [
      r.username,
      inf.fullName || '',
      r.overall ?? '',
      r.scores?.niche ?? '',
      r.scores?.location ?? '',
      r.scores?.contentFormat ?? '',
      r.scores?.botRisk ?? '',
      inf.avgLikes ?? '',
      inf.avgComments ?? '',
      inf.postCount ?? '',
      inf.videoRatio ?? '',
      `"${(r.verdict || '').replace(/"/g, "'")}"`,
      `"${(r.flags || []).join(', ')}"`,
      `"${(r.hkSignals || []).join(', ')}"`,
      `"${(r.nicheSignals || []).join(', ')}"`,
      `https://instagram.com/${r.username}`,
    ]
  })

  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `kol-results-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
