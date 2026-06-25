import { useState, useEffect, useCallback, useRef } from 'react'
import { ExternalLink, Copy, Check, Loader2, RefreshCw, Download, Columns, SendHorizonal } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { exportToCsv } from '../lib/exportCsv'
import { TABLE_COLUMNS, ALWAYS_EXPORT_IDS, DEFAULT_SELECTED_COLUMNS } from '../lib/columnDefs'

const DM_STATUS_OPTIONS = ['not_sent', 'sent', 'replied', 'no_response']
const DM_STATUS_LABELS = { not_sent: 'Not sent', sent: 'Sent', replied: 'Replied', no_response: 'No response' }
const DM_STATUS_STYLES = {
  not_sent:    'bg-ink/10 text-ink/50',
  sent:        'bg-blue-100 text-blue-700',
  replied:     'bg-green-100 text-green-700',
  no_response: 'bg-rose/10 text-rose/70',
}

function ColumnPicker({ selected, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const toggle = (id) => {
    if (selected.includes(id)) {
      onChange(selected.filter((c) => c !== id))
    } else {
      const order = TABLE_COLUMNS.map(c => c.id)
      onChange([...selected, id].sort((a, b) => order.indexOf(a) - order.indexOf(b)))
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-4 py-2 border border-[#E1DBCD] rounded-[10px] text-[13px] text-body hover:border-ink/30 hover:text-ink transition-all bg-white"
      >
        <Columns size={14} />
        Export columns
        {selected.length < TABLE_COLUMNS.length && (
          <span className="font-mono text-[10px] bg-ink text-white rounded-full px-1.5 py-0.5 leading-none">
            {selected.length}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 bg-white border border-card-edge rounded-[12px] shadow-lg z-10 p-3">
          <p className="text-[10px] font-mono text-faint uppercase tracking-[.14em] mb-2">Export columns</p>
          <div className="space-y-1">
            {TABLE_COLUMNS.map((col) => (
              <label key={col.id} className="flex items-center gap-2 px-2 py-1.5 rounded-[6px] hover:bg-surface cursor-pointer">
                <input type="checkbox" checked={selected.includes(col.id)} onChange={() => toggle(col.id)} className="accent-ink w-[15px] h-[15px] rounded" />
                <span className="font-mono text-[11px] text-body">{col.label}</span>
              </label>
            ))}
          </div>
          <div className="flex gap-2 mt-3 pt-2 border-t border-mist">
            <button onClick={() => onChange(TABLE_COLUMNS.map((c) => c.id))} className="text-[11px] text-faint hover:text-ink transition-colors">Select all</button>
            <button onClick={() => onChange([])} className="text-[11px] text-faint hover:text-ink transition-colors ml-auto">Clear</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ReadyToSendPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [items, setItems] = useState([])
  const [copiedUser, setCopiedUser] = useState(null)
  const [selectedColumns, setSelectedColumns] = useState(DEFAULT_SELECTED_COLUMNS)

  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); return }
    setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('shared_results')
        .select('id, campaign_brief, accounts, review_state')
        .order('created_at', { ascending: false })
      if (err) throw new Error(err.message)

      const ready = []
      for (const row of data || []) {
        for (const account of row.accounts || []) {
          const entry = row.review_state?.[account.username]
          if (entry?.status === 'approved') {
            ready.push({
              rowId: row.id,
              username: account.username,
              fullName: account.fullName || '',
              dm_draft: entry.dm_draft || '',
              dmStatus: entry.dm_status || 'not_sent',
              campaignBrief: row.campaign_brief || '',
              reviewEntry: entry,
              accountData: account,
            })
          }
        }
      }
      setItems(ready)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const persistStatus = useCallback(async (item, newStatus) => {
    setItems((prev) => prev.map((i) =>
      i.rowId === item.rowId && i.username === item.username
        ? { ...i, dmStatus: newStatus, reviewEntry: { ...i.reviewEntry, dm_status: newStatus } }
        : i
    ))
    try {
      const { data: row } = await supabase.from('shared_results').select('review_state').eq('id', item.rowId).single()
      const newState = {
        ...(row?.review_state || {}),
        [item.username]: { ...item.reviewEntry, dm_status: newStatus },
      }
      await supabase.from('shared_results').update({ review_state: newState }).eq('id', item.rowId)
    } catch (e) {
      console.error('Failed to update dm_status', e)
    }
  }, [])

  const handleCopyAndOpen = useCallback(async (item) => {
    if (item.dm_draft) {
      await navigator.clipboard.writeText(item.dm_draft).catch(() => {})
      setCopiedUser(item.username)
      setTimeout(() => setCopiedUser(null), 2000)
    }
    window.open(`https://www.instagram.com/${item.username}/`, '_blank', 'noreferrer')
    if (item.dm_draft) await persistStatus(item, 'sent')
  }, [persistStatus])

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-faint" />
      </div>
    )
  }

  return (
    <div className="min-h-screen px-[48px] py-[40px] max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="font-mono text-[10px] tracking-[.18em] text-faint uppercase mb-[8px]">Ready to Send</p>
          <h1 className="text-[27px] font-bold tracking-[-0.02em] text-ink mb-1">
            {items.length} {items.length === 1 ? 'account' : 'accounts'} approved
          </h1>
          <p className="text-[14px] text-muted">Copy each DM draft and open the Instagram profile to send.</p>
        </div>
        <div className="flex items-center gap-2">
          <ColumnPicker selected={selectedColumns} onChange={setSelectedColumns} />
          <button
            onClick={() => {
              const results = items.map((item) => item.accountData || { username: item.username })
              const influencers = items.map((item) => item.accountData || { username: item.username, fullName: item.fullName })
              const reviewState = Object.fromEntries(items.map((item) => [item.username, item.reviewEntry]))
              const exportIds = [
                ...ALWAYS_EXPORT_IDS,
                ...TABLE_COLUMNS.filter((c) => selectedColumns.includes(c.id)).flatMap((c) => c.exportIds),
              ]
              exportToCsv(results, influencers, exportIds, {}, reviewState, { reachoutDefault: 'Sent' }).catch(console.error)
            }}
            className="flex items-center gap-2 px-4 py-2 bg-ink text-white rounded-[10px] text-[13px] hover:bg-ink/80 transition-all whitespace-nowrap"
          >
            <Download size={14} /> Export XLSX
          </button>
          <button
            onClick={load}
            className="flex items-center gap-2 px-3 py-2 border border-mist rounded-[10px] text-[13px] text-muted hover:border-ink/30 hover:text-ink transition-all bg-white"
          >
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 px-4 py-3 bg-rose/5 border border-rose/20 rounded-[12px] text-[12px] text-rose">{error}</div>
      )}

      {items.length === 0 && !error && (
        <div className="flex flex-col items-center py-24">
          <SendHorizonal size={32} className="text-faint mb-4" />
          <h2 className="text-[17px] font-semibold text-ink mb-2">Nothing ready to send</h2>
          <p className="text-[13.5px] text-muted text-center">Accounts approved by your brand manager will appear here with their drafted DMs</p>
        </div>
      )}

      <div className="space-y-4">
        {items.map((item) => (
          <div
            key={`${item.rowId}-${item.username}`}
            className="border border-[#BFD6C4] bg-[#F5F8F4] rounded-[14px] px-5 py-4"
          >
            <div className="flex items-start justify-between gap-4 mb-3">
              <div className="min-w-0">
                <a
                  href={`https://instagram.com/${item.username}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-[13.5px] text-ink hover:text-ink/70 flex items-center gap-1"
                >
                  @{item.username} <ExternalLink size={11} className="opacity-40" />
                </a>
                {item.fullName && <p className="text-[12px] text-faint">{item.fullName}</p>}
                {item.campaignBrief && (
                  <p className="text-[11px] text-faint font-mono mt-1 truncate max-w-sm">{item.campaignBrief}</p>
                )}
              </div>
            </div>

            {item.dm_draft ? (
              <div className="bg-white border border-card-edge rounded-[10px] px-4 py-3 mb-3">
                <p className="text-[9.5px] font-mono text-faint uppercase tracking-[.14em] mb-2">DM Draft</p>
                <p className="text-[13px] text-body whitespace-pre-wrap">{item.dm_draft}</p>
              </div>
            ) : (
              <p className="text-[11px] text-faint font-mono mb-3">No DM draft — generate one from the Review Queue.</p>
            )}

            <div className="flex items-center justify-between">
              <div className="flex gap-1.5">
                {DM_STATUS_OPTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => persistStatus(item, s)}
                    className={`px-2 py-1 rounded-full text-[11px] border transition-all ${
                      item.dmStatus === s
                        ? DM_STATUS_STYLES[s] + ' border-current'
                        : 'border-mist text-faint hover:border-ink/30'
                    }`}
                  >
                    {DM_STATUS_LABELS[s]}
                  </button>
                ))}
              </div>
              <button
                onClick={() => handleCopyAndOpen(item)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-ink text-white rounded-[9px] text-[12px] hover:bg-ink/80 transition-all"
              >
                {copiedUser === item.username ? <Check size={12} /> : <Copy size={12} />}
                {copiedUser === item.username ? 'Copied!' : 'Copy & open profile'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
