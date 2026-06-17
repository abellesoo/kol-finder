import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'

// Priority columns shown first; remaining data columns follow
const PRIORITY_IDS = [
  'username', 'fullName', 'instagram_url', 'follower_count',
  'live_median_likes', 'live_median_views',
  'approve', 'reachout_status', 'remarks',
]

export const EXPORT_COLUMNS = [
  { id: 'username',          label: 'username',          getValue: (r)            => r.username },
  { id: 'fullName',          label: 'fullName',           getValue: (r, inf)       => inf.fullName || '' },
  { id: 'instagram_url',     label: 'instagram_url',      getValue: (r)            => `https://instagram.com/${r.username}` },
  { id: 'follower_count',    label: 'follower_count',     getValue: (r, inf, live) => live?.followerCount ?? inf.followerCount ?? '' },
  { id: 'live_median_likes', label: 'median_likes',       getValue: (r, inf, live) => live?.medianLikes ?? '' },
  { id: 'live_median_views', label: 'median_views',       getValue: (r, inf, live) => live?.medianViews ?? '' },
  { id: 'approve',           label: 'Approve Yes/No',     getValue: ()             => '' },
  { id: 'reachout_status',   label: 'Reach-out Status',   getValue: ()             => 'Not sent' },
  { id: 'remarks',           label: 'Remarks',            getValue: ()             => '' },
  { id: 'overall',           label: 'overall',            getValue: (r)            => r.overall ?? '' },
  { id: 'niche_score',       label: 'niche_score',        getValue: (r)            => r.scores?.niche ?? '' },
  { id: 'location_score',    label: 'location_score',     getValue: (r)            => r.scores?.location ?? '' },
  { id: 'format_score',      label: 'format_score',       getValue: (r)            => r.scores?.contentFormat ?? '' },
  { id: 'bot_risk_score',    label: 'bot_risk_score',     getValue: (r)            => r.scores?.botRisk ?? '' },
  { id: 'avg_likes',         label: 'avg_likes',          getValue: (r, inf)       => inf.avgLikes ?? '' },
  { id: 'avg_comments',      label: 'avg_comments',       getValue: (r, inf)       => inf.avgComments ?? '' },
  { id: 'post_count',        label: 'post_count',         getValue: (r, inf)       => inf.postCount ?? '' },
  { id: 'video_ratio',       label: 'video_ratio_%',      getValue: (r, inf)       => inf.videoRatio ?? '' },
  { id: 'verdict',           label: 'verdict',            getValue: (r)            => r.verdict || '' },
  { id: 'flags',             label: 'flags',              getValue: (r)            => (r.flags || []).join(', ') },
  { id: 'location_signals',  label: 'location_signals',   getValue: (r)            => (r.locationSignals || []).join(', ') },
  { id: 'niche_signals',     label: 'niche_signals',      getValue: (r)            => (r.nicheSignals || []).join(', ') },
  { id: 'live_hidden_likes', label: 'hidden_likes',        getValue: (r, inf, live) => live?.hiddenCount ?? '' },
]

export const DEFAULT_COLUMNS = EXPORT_COLUMNS.map((c) => c.id)

const APPROVE_OPTIONS    = ['Yes', 'No']
const REACHOUT_OPTIONS   = ['Not sent', 'Sent', 'To Review', 'Waiting for Reply', 'Accepted', 'Rejected', 'Shipped', 'Posted']
const HEADER_FILL        = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } }
const HEADER_FONT        = { bold: true }

export async function exportToCsv(results, influencers, selectedColumnIds = null, liveStats = {}) {
  const map = {}
  for (const inf of influencers) map[inf.username] = inf

  const cols = selectedColumnIds
    ? EXPORT_COLUMNS.filter((c) => selectedColumnIds.includes(c.id))
    : EXPORT_COLUMNS

  const urlColIndex = cols.findIndex((c) => c.id === 'instagram_url') + 1
  const approveColIndex = cols.findIndex((c) => c.id === 'approve') + 1
  const reachoutColIndex = cols.findIndex((c) => c.id === 'reachout_status') + 1

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Results')

  // Header row
  ws.addRow(cols.map((c) => c.label))

  // Data rows
  results.forEach((r) => {
    const inf = map[r.username] || {}
    const live = liveStats[r.username]
    ws.addRow(cols.map((c) => c.getValue(r, inf, live)))
  })

  // Style header row
  const headerRow = ws.getRow(1)
  headerRow.eachCell((cell) => {
    cell.fill = HEADER_FILL
    cell.font = HEADER_FONT
  })

  // Freeze first row
  ws.views = [{ state: 'frozen', ySplit: 1 }]

  // Hyperlinks in instagram_url column
  if (urlColIndex > 0) {
    for (let i = 2; i <= results.length + 1; i++) {
      const cell = ws.getCell(i, urlColIndex)
      const url = cell.value
      if (url) {
        cell.value = { text: url, hyperlink: url }
        cell.font = { color: { argb: 'FF0563C1' }, underline: true }
      }
    }
  }

  // Dropdowns for Approve and Reach-out Status
  if (approveColIndex > 0) {
    for (let i = 2; i <= results.length + 1; i++) {
      ws.getCell(i, approveColIndex).dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`"${APPROVE_OPTIONS.join(',')}"`],
      }
    }
  }

  if (reachoutColIndex > 0) {
    for (let i = 2; i <= results.length + 1; i++) {
      ws.getCell(i, reachoutColIndex).dataValidation = {
        type: 'list',
        allowBlank: false,
        formulae: [`"${REACHOUT_OPTIONS.join(',')}"`],
      }
    }
  }

  const buffer = await wb.xlsx.writeBuffer()
  saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `seeding-results-${new Date().toISOString().slice(0, 10)}.xlsx`)
}
