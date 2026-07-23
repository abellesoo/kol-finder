import { useState, useEffect, useMemo, useCallback } from 'react'
import { Loader2, X, Upload, FileSpreadsheet, ArrowRight } from 'lucide-react'
import { createCampaign, importCampaignKols, tierLabel } from '../lib/campaigns'
import {
  readWorkbook, detectHeaderRow, detectColumns, buildRows,
  IMPORT_FIELDS, IMPORT_FIELD_LABELS, REQUIRED_FIELDS,
} from '../lib/importSheet'

const MARKETS = ['HK', 'TW', 'SG', 'MY', 'Other']
const CAMPAIGN_TYPES = ['gifted', 'paid', 'mixed']
const STATE_LABEL = {
  approved: 'Approved', shipped: 'Shipped', awaiting_post: 'Awaiting', posted: 'Posted', overdue: 'Overdue', opted_out: 'Opted out',
}
const STATE_CLS = {
  approved: 'bg-ink/10 text-ink/60', shipped: 'bg-info-tint text-info',
  awaiting_post: 'bg-accent/25 text-[#8A6A22]', posted: 'bg-sage/12 text-sage',
  overdue: 'bg-rose/10 text-rose', opted_out: 'bg-ink/5 text-faint',
}

function colLabel(header, idx) {
  const h = String(header || '').trim()
  if (h) return h.length > 24 ? h.slice(0, 24) + '…' : h
  // Excel-style A, B, C… for blank headers
  let n = idx, s = ''
  do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1 } while (n >= 0)
  return `Column ${s}`
}

const inputCls = 'w-full px-3 py-2 border border-mist rounded-[10px] text-[13px] text-ink bg-white focus:outline-none focus:border-ink/40 transition-colors'
const labelCls = 'block text-[10px] font-mono text-faint uppercase tracking-[.14em] mb-1.5'

export default function ImportCampaignModal({ onClose, onImported }) {
  const [file, setFile] = useState(null)
  const [workbook, setWorkbook] = useState(null) // { sheetNames, grids }
  const [parsing, setParsing] = useState(false)
  const [error, setError] = useState(null)

  const [sheetName, setSheetName] = useState('')
  const [headerIndex, setHeaderIndex] = useState(0)
  const [colMap, setColMap] = useState({})
  const [excluded, setExcluded] = useState(() => new Set())

  const [meta, setMeta] = useState({
    name: '', brand: '', market: 'HK', campaign_type: 'mixed', start_date: '', posting_deadline: '',
  })
  const [importing, setImporting] = useState(false)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !importing && !parsing) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, importing, parsing])

  const grid = useMemo(() => (workbook && sheetName ? workbook.grids[sheetName] || [] : []), [workbook, sheetName])
  const headerRow = grid[headerIndex] || []
  const { rows, skipped } = useMemo(
    () => (grid.length ? buildRows(grid, headerIndex, colMap) : { rows: [], skipped: 0 }),
    [grid, headerIndex, colMap]
  )
  const included = useMemo(() => rows.filter((r) => !excluded.has(r.sheetRow)), [rows, excluded])

  // Suggest a deadline = latest date seen in the sheet (historical imports).
  const suggestedDeadline = useMemo(() => {
    const dates = rows.flatMap((r) => [r.posted_at, r.shipped_at]).filter(Boolean).sort()
    return dates.length ? dates[dates.length - 1] : ''
  }, [rows])

  const selectSheet = useCallback((name, wb) => {
    const g = (wb || workbook).grids[name] || []
    const hi = detectHeaderRow(g)
    setSheetName(name)
    setHeaderIndex(hi)
    setColMap(detectColumns(g[hi] || []))
    setExcluded(new Set())
  }, [workbook])

  const onFile = async (f) => {
    if (!f) return
    setFile(f)
    setParsing(true)
    setError(null)
    try {
      const wb = await readWorkbook(f)
      setWorkbook(wb)
      // Pick the sheet with the most detectable KOL rows.
      let best = wb.sheetNames[0], bestCount = -1
      for (const name of wb.sheetNames) {
        const g = wb.grids[name]
        const hi = detectHeaderRow(g)
        const { rows: r } = buildRows(g, hi, detectColumns(g[hi] || []))
        if (r.length > bestCount) { bestCount = r.length; best = name }
      }
      selectSheet(best, wb)
      setMeta((m) => ({ ...m, name: m.name || f.name.replace(/\.[^.]+$/, '') }))
    } catch (e) {
      setError('Could not read that file: ' + e.message)
    } finally {
      setParsing(false)
    }
  }

  const toggleRow = (sheetRow) => setExcluded((prev) => {
    const next = new Set(prev)
    next.has(sheetRow) ? next.delete(sheetRow) : next.add(sheetRow)
    return next
  })

  const missingRequired = REQUIRED_FIELDS.filter((f) => colMap[f] == null)

  const doImport = async () => {
    setError(null)
    if (!meta.name.trim()) return setError('Campaign name is required')
    if (!meta.brand.trim()) return setError('Brand is required')
    if (!meta.posting_deadline) return setError('Posting deadline is required')
    if (included.length === 0) return setError('No KOL rows selected to import')
    setImporting(true)
    try {
      const campaign = await createCampaign({
        name: meta.name, brand: meta.brand, market: meta.market,
        campaign_type: meta.campaign_type, start_date: meta.start_date || null,
        posting_deadline: meta.posting_deadline, hashtags: [], mention_handles: [],
      })
      const result = await importCampaignKols(campaign.id, included)
      onImported(campaign.id, result)
    } catch (e) {
      setError(e.message)
      setImporting(false)
    }
  }

  const postCount = included.filter((r) => r.post_url).length

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-[2px] px-4"
      onClick={() => !importing && !parsing && onClose()}>
      <div className="w-full max-w-[640px] max-h-[90vh] flex flex-col bg-white rounded-[16px] shadow-xl"
        onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start justify-between p-6 pb-4">
          <div>
            <p className="font-mono text-[10px] tracking-[.16em] text-faint uppercase mb-1">Import</p>
            <h2 className="text-[18px] font-semibold text-ink">Import a campaign from a spreadsheet</h2>
          </div>
          <button onClick={() => !importing && !parsing && onClose()} className="text-faint hover:text-ink transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 pb-2">
          {/* Upload zone */}
          {!workbook ? (
            <label className={`flex flex-col items-center justify-center py-14 border-2 border-dashed rounded-[14px] cursor-pointer transition-colors ${
              parsing ? 'border-mist' : 'border-card-edge hover:border-ink/30 hover:bg-surface'}`}>
              {parsing ? (
                <><Loader2 size={26} className="animate-spin text-faint mb-3" /><p className="text-[13px] text-muted">Reading {file?.name}…</p></>
              ) : (
                <>
                  <Upload size={26} className="text-faint mb-3" />
                  <p className="text-[14px] font-medium text-ink mb-1">Upload a CSV or Excel file</p>
                  <p className="text-[12px] text-muted">Export one tab of your plan (e.g. the Wellage Vita C sheet)</p>
                </>
              )}
              <input type="file" accept=".csv,.xlsx,.xls" className="hidden"
                onChange={(e) => onFile(e.target.files?.[0])} disabled={parsing} />
            </label>
          ) : (
            <div className="space-y-5">
              {/* File + sheet */}
              <div className="flex items-center gap-2 text-[12px] text-muted">
                <FileSpreadsheet size={14} className="text-faint" />
                <span className="font-medium text-ink">{file?.name}</span>
                {workbook.sheetNames.length > 1 && (
                  <select value={sheetName} onChange={(e) => selectSheet(e.target.value)}
                    className="ml-auto px-2 py-1 border border-mist rounded-[8px] text-[12px] bg-white">
                    {workbook.sheetNames.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                )}
              </div>

              {/* Column mapping */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className={labelCls + ' mb-0'}>Match your columns</p>
                  <label className="flex items-center gap-1.5 text-[11px] font-mono text-faint">
                    Header row
                    <input type="number" min={1} value={headerIndex + 1}
                      onChange={(e) => {
                        const hi = Math.max(0, (parseInt(e.target.value, 10) || 1) - 1)
                        setHeaderIndex(hi); setColMap(detectColumns(grid[hi] || []))
                      }}
                      className="w-14 px-2 py-1 border border-mist rounded-[8px] text-[11px] text-ink bg-white" />
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {IMPORT_FIELDS.map((field) => (
                    <label key={field} className="flex items-center gap-2">
                      <span className="text-[11px] font-mono text-body w-[86px] flex-shrink-0">
                        {IMPORT_FIELD_LABELS[field]}{REQUIRED_FIELDS.includes(field) && <span className="text-rose">*</span>}
                      </span>
                      <select value={colMap[field] ?? ''}
                        onChange={(e) => setColMap((m) => ({ ...m, [field]: e.target.value === '' ? undefined : Number(e.target.value) }))}
                        className="flex-1 min-w-0 px-2 py-1.5 border border-mist rounded-[8px] text-[12px] bg-white">
                        <option value="">— none —</option>
                        {headerRow.map((h, ci) => <option key={ci} value={ci}>{colLabel(h, ci)}</option>)}
                      </select>
                    </label>
                  ))}
                </div>
                {missingRequired.length > 0 && (
                  <p className="text-[11px] text-rose mt-2">Map the Handle column to preview KOLs.</p>
                )}
              </div>

              {/* Campaign details */}
              <div className="border-t border-mist pt-4">
                <p className={labelCls}>Campaign details</p>
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <input className={inputCls} value={meta.name} placeholder="Campaign name (e.g. Wellage Vita C)"
                      onChange={(e) => setMeta((m) => ({ ...m, name: e.target.value }))} />
                    <input className={inputCls} value={meta.brand} placeholder="Brand (e.g. WELLAGE)"
                      onChange={(e) => setMeta((m) => ({ ...m, brand: e.target.value }))} />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <select className={inputCls} value={meta.market} onChange={(e) => setMeta((m) => ({ ...m, market: e.target.value }))}>
                      {MARKETS.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                    <select className={inputCls} value={meta.campaign_type} onChange={(e) => setMeta((m) => ({ ...m, campaign_type: e.target.value }))}>
                      {CAMPAIGN_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <input type="date" className={inputCls} value={meta.posting_deadline}
                      onChange={(e) => setMeta((m) => ({ ...m, posting_deadline: e.target.value }))} />
                  </div>
                  {suggestedDeadline && !meta.posting_deadline && (
                    <button onClick={() => setMeta((m) => ({ ...m, posting_deadline: suggestedDeadline }))}
                      className="text-[11px] text-accent hover:underline">Use latest sheet date ({suggestedDeadline}) as deadline</button>
                  )}
                </div>
              </div>

              {/* Preview */}
              <div className="border-t border-mist pt-4">
                <div className="flex items-center justify-between mb-2">
                  <p className={labelCls + ' mb-0'}>Preview</p>
                  <p className="text-[11px] font-mono text-faint">
                    {included.length} to import · {postCount} posts · {skipped} rows skipped
                  </p>
                </div>
                {rows.length === 0 ? (
                  <p className="text-[12px] text-muted py-4 text-center">No KOL rows detected — check the Handle column mapping above.</p>
                ) : (
                  <div className="max-h-[220px] overflow-y-auto space-y-1 pr-1">
                    {rows.map((r) => {
                      const on = !excluded.has(r.sheetRow)
                      return (
                        <label key={r.sheetRow}
                          className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-[8px] cursor-pointer ${on ? 'hover:bg-surface' : 'opacity-45'}`}>
                          <input type="checkbox" checked={on} onChange={() => toggleRow(r.sheetRow)}
                            className="accent-ink w-[14px] h-[14px] rounded flex-shrink-0" />
                          <span className="text-[12.5px] font-medium text-ink flex-1 truncate">@{r.handle}</span>
                          {r.post_url && <span className="text-[10px] font-mono text-sage">post</span>}
                          {r.agreed_fee > 0 && <span className="text-[10px] font-mono text-faint">${r.agreed_fee.toLocaleString()}</span>}
                          <span className="text-[10px] font-mono text-faint">{tierLabel(r.tier)}</span>
                          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded-full ${STATE_CLS[r.state]}`} title={r.raw_status}>
                            {STATE_LABEL[r.state]}
                          </span>
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="mx-6 mb-2 px-3 py-2 bg-rose/5 border border-rose/20 rounded-[10px] text-[12px] text-rose">{error}</div>
        )}

        {/* Footer */}
        {workbook && (
          <div className="flex items-center justify-between gap-2 p-6 pt-4 border-t border-mist">
            <button onClick={() => { setWorkbook(null); setFile(null); setError(null) }} disabled={importing}
              className="text-[12px] text-faint hover:text-ink transition-colors disabled:opacity-50">
              ← Choose a different file
            </button>
            <div className="flex items-center gap-2">
              <button onClick={() => !importing && onClose()} disabled={importing}
                className="px-4 py-2 rounded-[10px] text-[13px] font-medium text-ink hover:bg-surface transition-colors disabled:opacity-50">
                Cancel
              </button>
              <button onClick={doImport} disabled={importing || included.length === 0}
                className="flex items-center gap-2 px-4 py-2 rounded-[10px] bg-ink text-white text-[13px] font-medium hover:bg-ink/80 transition-colors disabled:opacity-40">
                {importing ? <Loader2 size={13} className="animate-spin" /> : <ArrowRight size={13} />}
                {importing ? 'Importing…' : `Import ${included.length} KOL${included.length === 1 ? '' : 's'}`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
