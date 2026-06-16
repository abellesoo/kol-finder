export const EXPORT_COLUMNS = [
  { id: 'username',        label: 'username',         getValue: (r)       => r.username },
  { id: 'fullName',        label: 'fullName',         getValue: (r, inf)  => inf.fullName || '' },
  { id: 'instagram_url',   label: 'instagram_url',    getValue: (r)       => `https://instagram.com/${r.username}` },
  { id: 'overall',         label: 'overall',          getValue: (r)       => r.overall ?? '' },
  { id: 'niche_score',     label: 'niche_score',      getValue: (r)       => r.scores?.niche ?? '' },
  { id: 'location_score',  label: 'location_score',   getValue: (r)       => r.scores?.location ?? '' },
  { id: 'format_score',    label: 'format_score',     getValue: (r)       => r.scores?.contentFormat ?? '' },
  { id: 'bot_risk_score',  label: 'bot_risk_score',   getValue: (r)       => r.scores?.botRisk ?? '' },
  { id: 'avg_likes',       label: 'avg_likes',        getValue: (r, inf)  => inf.avgLikes ?? '' },
  { id: 'avg_comments',    label: 'avg_comments',     getValue: (r, inf)  => inf.avgComments ?? '' },
  { id: 'post_count',      label: 'post_count',       getValue: (r, inf)  => inf.postCount ?? '' },
  { id: 'video_ratio',     label: 'video_ratio_%',    getValue: (r, inf)  => inf.videoRatio ?? '' },
  { id: 'verdict',         label: 'verdict',          getValue: (r)       => `"${(r.verdict || '').replace(/"/g, "'")}"` },
  { id: 'flags',           label: 'flags',            getValue: (r)       => `"${(r.flags || []).join(', ')}"` },
  { id: 'location_signals',  label: 'location_signals',  getValue: (r)            => `"${(r.locationSignals || []).join(', ')}"` },
  { id: 'niche_signals',     label: 'niche_signals',     getValue: (r)            => `"${(r.nicheSignals || []).join(', ')}"` },
  { id: 'live_median_likes', label: 'live_median_likes', getValue: (r, inf, live) => live?.medianLikes ?? '' },
  { id: 'live_median_views', label: 'live_median_views', getValue: (r, inf, live) => live?.medianViews ?? '' },
  { id: 'live_hidden_likes', label: 'live_hidden_likes', getValue: (r, inf, live) => live?.hiddenCount ?? '' },
]

export const DEFAULT_COLUMNS = EXPORT_COLUMNS.map((c) => c.id)

export function exportToCsv(results, influencers, selectedColumnIds = null, liveStats = {}) {
  const map = {}
  for (const inf of influencers) map[inf.username] = inf

  const cols = selectedColumnIds
    ? EXPORT_COLUMNS.filter((c) => selectedColumnIds.includes(c.id))
    : EXPORT_COLUMNS

  const headers = cols.map((c) => c.label)
  const rows = results.map((r) => {
    const inf = map[r.username] || {}
    const live = liveStats[r.username]
    return cols.map((c) => c.getValue(r, inf, live))
  })

  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `seeding-results-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
