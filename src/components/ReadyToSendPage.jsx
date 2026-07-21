import { useState, useEffect, useCallback, useMemo } from 'react'
import { ExternalLink, Copy, Check, Loader2, RefreshCw, Download, SendHorizonal } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { exportToCsv } from '../lib/exportCsv'
import { mergeReviewEntry, reviewKey, campaignDmDraft } from '../lib/reviewState'
import { profileUrl } from '../lib/platforms'
import { TABLE_COLUMNS, ALWAYS_EXPORT_IDS } from '../lib/columnDefs'
import { loadColumnPrefs, saveColumnPrefs } from '../lib/columnPrefs'
import ColumnPicker from './table/ColumnPicker'

const DM_STATUS_OPTIONS = ['not_sent', 'sent', 'replied', 'no_response']
const DM_STATUS_LABELS = { not_sent: 'Not sent', sent: 'Sent', replied: 'Replied', no_response: 'No response' }
const DM_STATUS_STYLES = {
  not_sent:    'bg-ink/10 text-ink/50',
  sent:        'bg-blue-100 text-blue-700',
  replied:     'bg-green-100 text-green-700',
  no_response: 'bg-rose/10 text-rose/70',
}

function formatDate(isoStr) {
  if (!isoStr) return '—'
  return new Date(isoStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function ReadyToSendPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [items, setItems] = useState([])
  const [sessionMeta, setSessionMeta] = useState({})
  const [copiedUser, setCopiedUser] = useState(null)
  // Column visibility is remembered across tabs + reloads (Phase 4).
  const [selectedColumns, setSelectedColumns] = useState(loadColumnPrefs)
  const handleColumnsChange = useCallback((next) => {
    setSelectedColumns(next)
    saveColumnPrefs(next)
  }, [])

  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); return }
    setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('shared_results')
        .select('id, campaign_brief, accounts, review_state, created_at')
        .order('created_at', { ascending: false })
      if (err) throw new Error(err.message)

      const metaMap = {}
      const ready = []
      for (const row of data || []) {
        metaMap[row.id] = { campaignBrief: row.campaign_brief || '', createdAt: row.created_at }
        // One DM draft per campaign, reused for every approved account in it.
        const campaignDraft = campaignDmDraft(row.review_state)
        for (const account of row.accounts || []) {
          const entry = row.review_state?.[reviewKey(account)]
          if (entry?.status === 'approved') {
            ready.push({
              rowId: row.id,
              username: account.username,
              stateKey: reviewKey(account), // review_state key (≠ username for Threads)
              platform: account.platform || 'instagram',
              fullName: account.fullName || '',
              dm_draft: campaignDraft,
              dmStatus: entry.dm_status || 'not_sent',
              campaignBrief: row.campaign_brief || '',
              reviewEntry: entry,
              accountData: account,
            })
          }
        }
      }
      setItems(ready)
      setSessionMeta(metaMap)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  const groups = useMemo(() => {
    const map = new Map()
    for (const item of items) {
      if (!map.has(item.rowId)) map.set(item.rowId, [])
      map.get(item.rowId).push(item)
    }
    return Array.from(map.entries()).map(([rowId, rowItems]) => ({
      rowId,
      ...(sessionMeta[rowId] || {}),
      items: rowItems,
    }))
  }, [items, sessionMeta])

  useEffect(() => { load() }, [load])

  const persistStatus = useCallback(async (item, newStatus) => {
    setItems((prev) => prev.map((i) =>
      i.rowId === item.rowId && i.stateKey === item.stateKey
        ? { ...i, dmStatus: newStatus, reviewEntry: { ...i.reviewEntry, dm_status: newStatus } }
        : i
    ))
    try {
      // Per-account merge so we don't clobber concurrent edits to other accounts.
      await mergeReviewEntry(item.rowId, item.stateKey, { ...item.reviewEntry, dm_status: newStatus })
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
    window.open(profileUrl(item), '_blank', 'noreferrer')
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
          <h1 className="text-[34px] font-serif font-bold tracking-[0.02em] text-ink mb-1">
            {items.length} {items.length === 1 ? 'account' : 'accounts'} approved
          </h1>
          <p className="text-[14px] text-muted">Copy each DM draft and open the Instagram profile to send.</p>
        </div>
        <div className="flex items-center gap-2">
          <ColumnPicker selected={selectedColumns} onChange={handleColumnsChange} label="Export columns" />
          <button
            onClick={() => {
              const results = items.map((item) => item.accountData || { username: item.username })
              const influencers = items.map((item) => item.accountData || { username: item.username, fullName: item.fullName })
              // The DM draft is campaign-level now; fold it onto each account's
              // entry so the exporter's per-row dm_draft column stays populated.
              const reviewState = Object.fromEntries(items.map((item) => [item.stateKey, { ...item.reviewEntry, dm_draft: item.dm_draft }]))
              const exportIds = [
                ...ALWAYS_EXPORT_IDS,
                ...TABLE_COLUMNS.filter((c) => selectedColumns.includes(c.id)).flatMap((c) => c.exportIds),
              ]
              exportToCsv(results, influencers, exportIds, {}, reviewState, { reachoutDefault: 'Sent' }).catch(console.error)
            }}
            className="flex items-center gap-2 px-4 py-2 border border-transparent bg-ink text-white rounded-[10px] text-[13px] hover:bg-ink/80 transition-all whitespace-nowrap"
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

      <div className="space-y-8">
        {groups.map((group) => (
          <div key={group.rowId}>
            <div className="flex items-center gap-3 mb-3 pb-3 border-b border-mist">
              <div className="min-w-0">
                <p className="font-medium text-[13.5px] text-ink truncate">
                  {(group.campaignBrief || '').length > 90 ? group.campaignBrief.slice(0, 90) + '…' : group.campaignBrief || '(no brief)'}
                </p>
                <p className="text-[11px] text-faint font-mono mt-0.5">
                  {formatDate(group.createdAt)} · {group.items.length} {group.items.length === 1 ? 'account' : 'accounts'} approved
                </p>
              </div>
            </div>
            <div className="space-y-3">
              {group.items.map((item) => (
                <div
                  key={`${item.rowId}-${item.stateKey}`}
                  className="border border-[#BFD6C4] bg-[#F5F8F4] rounded-[14px] px-5 py-4"
                >
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="min-w-0">
                      <a
                        href={profileUrl(item)}
                        target="_blank"
                        rel="noreferrer"
                        className="font-semibold text-[13.5px] text-ink hover:text-ink/70 flex items-center gap-1"
                      >
                        @{item.username} <ExternalLink size={11} className="opacity-40" />
                      </a>
                      {item.fullName && <p className="text-[12px] text-faint">{item.fullName}</p>}
                    </div>
                    {item.accountData?.aiScore != null && (
                      <span
                        title={item.accountData.aiReason || ''}
                        className="flex-shrink-0 font-mono text-[11px] text-body bg-white border border-card-edge rounded-[7px] px-2 py-1"
                      >
                        AI Fit {item.accountData.aiScore}/10
                      </span>
                    )}
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
        ))}
      </div>
    </div>
  )
}
