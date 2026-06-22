import ExcelJS from 'exceljs'
import { saveAs } from 'file-saver'

export const EXPORT_COLUMNS = [
  { id: 'brand',             label: 'Brand',              getValue: (r, inf)       => inf.sourceBrand || '' },
  { id: 'username',          label: 'username',           getValue: (r)            => r.username },
  { id: 'fullName',          label: 'fullName',           getValue: (r, inf)       => inf.fullName || '' },
  { id: 'instagram_url',     label: 'instagram_url',      getValue: (r)            => `https://instagram.com/${r.username}` },
  { id: 'account_location',  label: 'location',           getValue: (r, inf)       => inf.accountLocation || '' },
  { id: 'follower_count',    label: 'follower_count',     getValue: (r, inf, live) => live?.followerCount ?? inf.followerCount ?? '' },
  { id: 'live_median_likes', label: 'median_likes',       getValue: (r, inf, live) => live?.medianLikes ?? '' },
  { id: 'live_median_views', label: 'median_views',       getValue: (r, inf, live) => live?.medianViews ?? '' },
  { id: 'approve',           label: 'Approve Yes/No',     getValue: (r, inf, live, rs)      => rs?.status === 'approved' ? 'Yes' : rs?.status === 'rejected' ? 'No' : '' },
  { id: 'reachout_status',   label: 'Reach-out Status',   getValue: ()                      => 'Not sent' },
  { id: 'remarks',           label: 'Remarks',            getValue: ()                      => '' },
  { id: 'dm_status',         label: 'DM Status',          getValue: (r, inf, live, rs)      => rs?.dm_status ? { not_sent: 'Not sent', sent: 'Sent', replied: 'Replied', no_response: 'No response' }[rs.dm_status] || rs.dm_status : '' },
  { id: 'dm_draft',          label: 'DM Draft',           getValue: (r, inf, live, rs)      => rs?.dm_draft || '' },
  { id: 'overall',           label: 'overall',            getValue: (r)            => r.overall ?? '' },
  { id: 'relevancy_score',   label: 'relevancy_score',    getValue: (r)            => r.scores?.relevancy ?? '' },
  { id: 'engagement_score',  label: 'engagement_score',   getValue: (r)            => r.scores?.engagement ?? '' },
  { id: 'bot_risk_score',    label: 'bot_risk_score',     getValue: (r)            => r.scores?.botRisk ?? '' },
  { id: 'avg_likes',         label: 'avg_likes',          getValue: (r, inf)       => inf.avgLikes ?? '' },
  { id: 'avg_comments',      label: 'avg_comments',       getValue: (r, inf)       => inf.avgComments ?? '' },
  { id: 'post_count',        label: 'post_count',         getValue: (r, inf)       => inf.postCount ?? '' },
  { id: 'video_ratio',       label: 'video_ratio_%',      getValue: (r, inf)       => inf.videoRatio ?? '' },
  { id: 'verdict',           label: 'verdict',            getValue: (r)            => r.verdict || '' },
  { id: 'flags',             label: 'flags',              getValue: (r)            => (r.flags || []).join(', ') },
  { id: 'niche_signals',     label: 'niche_signals',      getValue: (r)            => (r.nicheSignals || []).join(', ') },
  { id: 'live_hidden_likes', label: 'hidden_likes',       getValue: (r, inf, live) => live?.hiddenCount ?? '' },
  { id: 'sample_post_url',   label: 'scraped_post',       getValue: (r, inf)       => inf.samplePostUrl || '' },
  { id: 'scraped_post_likes',    label: 'scraped_post_likes',    getValue: (r, inf) => inf.samplePostLikes ?? '' },
  { id: 'scraped_post_comments', label: 'scraped_post_comments', getValue: (r, inf) => inf.samplePostComments ?? '' },
  { id: 'scraped_post_plays',    label: 'scraped_post_plays',    getValue: (r, inf) => inf.samplePostPlays ?? '' },
  { id: 'bio',               label: 'bio',                getValue: (r, inf)       => inf.bio || '' },
  { id: 'sample_caption',    label: 'scraped_caption',    getValue: (r, inf)       => inf.sampleCaption || '' },
  { id: 'engagement_rate',   label: 'engagement_rate',    getValue: (r, inf)       => inf.engagementRate != null ? `${inf.engagementRate}%` : (inf.avgLikes ?? '') },
]

export const DEFAULT_COLUMNS = EXPORT_COLUMNS.map((c) => c.id)

const APPROVE_OPTIONS    = ['Yes', 'No']
const REACHOUT_OPTIONS   = ['Not sent', 'Sent', 'Accept', 'Reject', 'Waiting for reply', 'To Review', 'Posted', 'Shipped', 'no reply after follow-up']
const HEADER_FILL        = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD9D9D9' } }
const HEADER_FONT        = { bold: true }

// Conditional formatting colors for each reach-out status (bgColor for CF rules)
const REACHOUT_COLORS = {
  'Sent':                    'FFE0E0E0',
  'Accept':                  'FF93C47D',
  'Reject':                  'FFE06666',
  'Waiting for reply':       'FF9FC5E8',
  'To Review':               'FF4A86C8',
  'Posted':                  'FFFFD966',
  'Shipped':                 'FF8E7CC3',
  'no reply after follow-up':'FFD9D2E9',
  'Not sent':                'FF434343',
}

function colIndexToLetter(n) {
  let s = ''
  while (n > 0) {
    const r = (n - 1) % 26
    s = String.fromCharCode(65 + r) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

// Soft color palette for brand column — cycles if more than 5 brands
const BRAND_COLORS = ['FFFCE5CF', 'FFD5E8D4', 'FFDAE8FC', 'FFE1D5E7', 'FFFFD7D7']

export async function exportToCsv(results, influencers, selectedColumnIds = null, liveStats = {}, reviewState = {}) {
  const map = {}
  for (const inf of influencers) map[inf.username] = inf

  const cols = selectedColumnIds
    ? EXPORT_COLUMNS.filter((c) => selectedColumnIds.includes(c.id))
    : EXPORT_COLUMNS

  const brandColIndex    = cols.findIndex((c) => c.id === 'brand') + 1
  const urlColIndex      = cols.findIndex((c) => c.id === 'instagram_url') + 1
  const samplePostColIndex = cols.findIndex((c) => c.id === 'sample_post_url') + 1
  const approveColIndex  = cols.findIndex((c) => c.id === 'approve') + 1
  const reachoutColIndex = cols.findIndex((c) => c.id === 'reachout_status') + 1

  // Derive unique brands from the influencer list for the dropdown + color map
  const uniqueBrands = [...new Set(influencers.map((inf) => inf.sourceBrand).filter(Boolean))]
  const brandColorMap = {}
  uniqueBrands.forEach((b, i) => { brandColorMap[b] = BRAND_COLORS[i % BRAND_COLORS.length] })

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Results')

  // Header row
  ws.addRow(cols.map((c) => c.label))

  // Data rows
  results.forEach((r) => {
    const inf = map[r.username] || {}
    const live = liveStats[r.username]
    const rs = reviewState[r.username]
    ws.addRow(cols.map((c) => c.getValue(r, inf, live, rs)))
  })

  // Style header row
  const headerRow = ws.getRow(1)
  headerRow.eachCell((cell) => {
    cell.fill = HEADER_FILL
    cell.font = HEADER_FONT
  })

  // Freeze first row
  ws.views = [{ state: 'frozen', ySplit: 1 }]

  // Brand column: dropdown + per-brand color
  if (brandColIndex > 0 && uniqueBrands.length > 0) {
    for (let i = 2; i <= results.length + 1; i++) {
      const cell = ws.getCell(i, brandColIndex)
      const brand = cell.value
      const color = brandColorMap[brand] || BRAND_COLORS[0]
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } }
      cell.dataValidation = {
        type: 'list',
        allowBlank: true,
        formulae: [`"${uniqueBrands.join(',')}"`],
      }
    }
  }

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

  // Hyperlinks in sample_post_url column
  if (samplePostColIndex > 0) {
    for (let i = 2; i <= results.length + 1; i++) {
      const cell = ws.getCell(i, samplePostColIndex)
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
    // Conditional formatting so colours update automatically when user picks a status
    const col = colIndexToLetter(reachoutColIndex)
    const ref = `${col}2:${col}${results.length + 1}`
    REACHOUT_OPTIONS.forEach((status, priority) => {
      const argb = REACHOUT_COLORS[status]
      if (!argb) return
      ws.addConditionalFormatting({
        ref,
        rules: [{
          priority: priority + 1,
          type: 'cellIs',
          operator: 'equal',
          formulae: [`"${status}"`],
          style: {
            fill: { type: 'pattern', pattern: 'solid', bgColor: { argb } },
            font: status === 'Not sent' ? { color: { argb: 'FFFFFFFF' } } : {},
          },
        }],
      })
    })
  }

  const buffer = await wb.xlsx.writeBuffer()
  saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `seeding-results-${new Date().toISOString().slice(0, 10)}.xlsx`)
}
