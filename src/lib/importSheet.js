// Parse an uploaded spreadsheet (CSV / XLSX) into campaign-import rows.
// Reusable across campaigns; tuned for the "marketing plan" layout where each
// KOL is one row carrying Handle / Budget / Status / Launch date / Launch link.
// Pure logic — the DB write lives in campaigns.js (importCampaignKols).

import { normalizeHandle } from './campaigns'

// Single-word labels that live in the Handle column but are section headers or
// non-KOL budget lines, not real KOLs.
const SECTION_WORDS = new Set([
  'reels', 'reel', 'media', 'ad', 'ads', 'seeding', 'thread', 'threads',
  'stories', 'story', 'tiktok', 'youtube', 'kol', 'kols', 'koc', 'total', 'ig',
])

export const IMPORT_FIELDS = ['handle', 'budget', 'status', 'launch_date', 'launch_link', 'format', 'remarks']
export const IMPORT_FIELD_LABELS = {
  handle: 'Handle', budget: 'Budget', status: 'Status',
  launch_date: 'Launch date', launch_link: 'Launch link', format: 'Format', remarks: 'Remarks',
}
export const REQUIRED_FIELDS = ['handle']

// Header aliases, tried in order. More specific patterns first so "Launch date"
// and "Launch link" don't collide on the generic /date/ or /link/ fallbacks.
const COLUMN_ALIASES = {
  handle:      [/handle/i, /influencer/i, /account/i, /^kol/i, /^ig\b/i],
  budget:      [/budget/i, /\bfee\b/i, /\bcost\b/i, /amount/i, /spend/i],
  status:      [/status/i, /stage/i],
  launch_date: [/launch\s*dat/i, /post(ed)?\s*date/i, /\bdate\b/i],
  launch_link: [/launch\s*link/i, /post\s*link/i, /\blink\b/i, /\burl\b/i],
  format:      [/format/i, /deliverable/i, /content\s*type/i, /\btype\b/i],
  remarks:     [/remark/i, /\bnote/i, /comment/i],
}

// Sheet Status → pipeline state. Order matters: "ready-to-launch" must be tested
// before "launched" (both contain "launch"). Confirmed defaults with Annabelle.
const STATUS_RULES = [
  { test: /ready.*launch|awaiting|to\s*launch/i, state: 'awaiting_post' },
  { test: /product\s*sent|shipped|sent/i,         state: 'shipped' },
  { test: /launched|posted|live|done/i,           state: 'posted' },
  { test: /overdue|late/i,                         state: 'overdue' },
  { test: /opted?\s*out|declined|dropped/i,        state: 'opted_out' },
  { test: /wip|progress|pending|negoti|confirm/i,  state: 'approved' },
]

export function mapStatus(raw) {
  const s = String(raw ?? '').trim()
  if (!s) return 'approved'
  for (const { test, state } of STATUS_RULES) if (test.test(s)) return state
  return 'approved'
}

export function extractShortcode(url) {
  if (!url) return null
  const m = String(url).match(/instagram\.com\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/i)
  return m ? m[1] : null
}

function extractHandle(cell) {
  const s = String(cell ?? '').trim()
  if (!s) return ''
  const at = s.match(/@\s*([A-Za-z0-9._]+)/) // "Emma Wong @rwy___" → rwy___
  if (at) {
    const h = normalizeHandle(at[1])
    return SECTION_WORDS.has(h) ? '' : h   // "@total", "@ig" → section label, not a handle
  }
  if (/^[A-Za-z0-9._]+$/.test(s)) {           // bare single-token username
    const h = normalizeHandle(s)
    return SECTION_WORDS.has(h) ? '' : h
  }
  return '' // has spaces and no @ → a label/header, not a handle
}

function parseMoney(cell) {
  if (cell == null || cell === '') return 0
  if (typeof cell === 'number') return isNaN(cell) ? 0 : cell
  // Take the first numeric token so ranges ("1000-2000" → 1000) don't collapse
  // to NaN→0, and strip thousands separators. (EU decimal-comma is not handled;
  // the sheets in use are US/English-formatted.)
  const m = String(cell).replace(/,/g, '').match(/\d+(?:\.\d+)?/)
  return m ? Number(m[0]) : 0
}

function toISODate(cell) {
  if (!cell) return null
  if (cell instanceof Date && !isNaN(cell)) return cell.toISOString().slice(0, 10)
  const s = String(cell).trim()
  // HK/EU day-month-year (matching utils.js formatDate). If read as day-month
  // the month lands > 12, fall back to month-day; reject anything still invalid
  // instead of emitting a bogus "2026-13-04".
  const m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/)
  if (m) {
    let [, a, b, y] = m
    if (y.length === 2) y = '20' + y
    let day = Number(a), mo = Number(b)
    if (mo > 12 && day <= 12) { [day, mo] = [mo, day] } // sheet was month/day
    if (mo < 1 || mo > 12 || day < 1 || day > 31) return null
    return `${y}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }
  const parsed = new Date(s)
  return isNaN(parsed) ? null : parsed.toISOString().slice(0, 10)
}

// Read a File into { sheetNames, grids } where each grid is an array-of-arrays.
export async function readWorkbook(file) {
  const XLSX = await import('xlsx')
  const buf = await file.arrayBuffer()
  const wb = XLSX.read(new Uint8Array(buf), { type: 'array', cellDates: true })
  const grids = {}
  for (const name of wb.SheetNames) {
    grids[name] = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '', blankrows: false })
  }
  return { sheetNames: wb.SheetNames, grids }
}

// First row (within the first 30) that looks like a header — contains a cell
// matching a Handle-ish alias.
export function detectHeaderRow(grid) {
  for (let i = 0; i < Math.min(grid.length, 30); i++) {
    const row = grid[i] || []
    if (row.some((c) => /handle|influencer|account/i.test(String(c)))) return i
  }
  return 0
}

// Map each import field → a column index, by matching the header row.
export function detectColumns(headerRow) {
  const map = {}
  const used = new Set()
  for (const field of IMPORT_FIELDS) {
    for (const rx of COLUMN_ALIASES[field]) {
      let found = -1
      for (let ci = 0; ci < headerRow.length; ci++) {
        if (used.has(ci)) continue
        if (rx.test(String(headerRow[ci] || ''))) { found = ci; break }
      }
      if (found >= 0) { map[field] = found; used.add(found); break }
    }
  }
  return map
}

// Build import rows from a grid + header index + column map. Rows without a
// real handle are skipped (section headers, empty rows, ad/media budget lines).
export function buildRows(grid, headerIndex, colMap) {
  const rows = []
  let skipped = 0
  const cell = (row, field) => (colMap[field] != null ? row[colMap[field]] : '')
  for (let i = headerIndex + 1; i < grid.length; i++) {
    const row = grid[i] || []
    const handle = extractHandle(cell(row, 'handle'))
    if (!handle) {
      if (String(cell(row, 'handle') ?? '').trim()) skipped++
      continue
    }
    const budget = parseMoney(cell(row, 'budget'))
    const rawStatus = String(cell(row, 'status') ?? '').trim()
    const state = mapStatus(rawStatus)
    const dateISO = toISODate(cell(row, 'launch_date'))
    const link = String(cell(row, 'launch_link') ?? '').trim()
    const notes = [String(cell(row, 'format') ?? '').trim(), String(cell(row, 'remarks') ?? '').trim()]
      .filter(Boolean).join(' · ') || null
    rows.push({
      handle,
      raw_status: rawStatus,
      state,
      agreed_fee: budget,
      tier: budget > 0 ? 'B' : 'A',
      posted_at: state === 'posted' ? dateISO : null,
      shipped_at: ['shipped', 'awaiting_post', 'overdue'].includes(state) ? dateISO : null,
      post_url: link || null,
      post_shortcode: extractShortcode(link),
      notes,
      sheetRow: i + 1,
      include: true,
    })
  }
  return { rows, skipped }
}

// Convenience: whole pipeline for the default sheet, used to preview on upload.
export function parseGrid(grid) {
  const headerIndex = detectHeaderRow(grid)
  const colMap = detectColumns(grid[headerIndex] || [])
  const { rows, skipped } = buildRows(grid, headerIndex, colMap)
  return { headerIndex, colMap, rows, skipped }
}
