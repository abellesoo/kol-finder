import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { ExternalLink, Copy, Check, RefreshCw, Download, SendHorizonal, FolderOpen, ChevronRight } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { listCampaigns, createCampaign } from '../lib/campaigns'
import { exportToCsv } from '../lib/exportCsv'
import { mergeReviewEntry, reviewKey, campaignDmDraft, setResultCampaign, loadReviewSubmissions, isAccountApproved } from '../lib/reviewState'
import { profileUrl } from '../lib/platforms'
import { TABLE_COLUMNS, ALWAYS_EXPORT_IDS } from '../lib/columnDefs'
import { loadColumnPrefs, saveColumnPrefs } from '../lib/columnPrefs'
import { formatDate, groupByCampaign } from '../lib/utils'
import ColumnPicker from './table/ColumnPicker'
import CampaignMoveMenu from './core/CampaignMoveMenu'
import PageHeader from './core/PageHeader'
import Loading from './core/Loading'
import EmptyState from './core/EmptyState'

const DM_STATUS_OPTIONS = ['not_sent', 'sent', 'replied', 'no_response']
const DM_STATUS_LABELS = { not_sent: 'Not sent', sent: 'Sent', replied: 'Replied', no_response: 'No response' }
const DM_STATUS_STYLES = {
  not_sent:    'bg-ink/10 text-ink/50',
  sent:        'bg-info-tint text-info',
  replied:     'bg-sage/12 text-sage',
  no_response: 'bg-rose/10 text-rose/70',
}

export default function ReadyToSendPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [items, setItems] = useState([])
  const [sessionMeta, setSessionMeta] = useState({})
  const [campaigns, setCampaigns] = useState([])
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
      const data = await loadReviewSubmissions()

      const metaMap = {}
      const ready = []
      for (const row of data || []) {
        metaMap[row.id] = { campaignBrief: row.campaign_brief || '', createdAt: row.created_at, campaignId: row.campaign_id || null }
        // One DM draft per campaign, reused for every approved account in it.
        const campaignDraft = campaignDmDraft(row.review_state)
        for (const account of row.accounts || []) {
          const entry = row.review_state?.[reviewKey(account)]
          if (isAccountApproved(account, row.review_state)) {
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

  // Approved accounts → one subgroup per review submission (keeps the shared
  // per-submission DM draft intact) …
  const submissionGroups = useMemo(() => {
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

  // … then those submissions bucket under their campaign (campaigns in listing
  // order, only those with approvals) plus a trailing "Unassigned" group.
  const campaignGroups = useMemo(
    () => groupByCampaign(submissionGroups, campaigns, (s) => s.campaignId),
    [submissionGroups, campaigns]
  )

  // Accordion state: which campaign groups are expanded. Collapsed by default so
  // the page is scannable — click a campaign header to reveal its approved
  // creators. The first group starts open so the page never lands fully empty.
  const [openGroups, setOpenGroups] = useState(() => new Set())
  const didInitOpen = useRef(false)
  useEffect(() => {
    if (!didInitOpen.current && campaignGroups.length > 0) {
      didInitOpen.current = true
      setOpenGroups(new Set([campaignGroups[0].id ?? '__unassigned__']))
    }
  }, [campaignGroups])
  const groupKey = (id) => id ?? '__unassigned__'
  const toggleGroup = (id) =>
    setOpenGroups((prev) => {
      const next = new Set(prev)
      const k = groupKey(id)
      next.has(k) ? next.delete(k) : next.add(k)
      return next
    })

  useEffect(() => { load() }, [load])
  useEffect(() => { listCampaigns().then(setCampaigns).catch((e) => console.error('Failed to load campaigns', e)) }, [])

  const moveSubmission = async (rowId, campaignId) => {
    await setResultCampaign(rowId, campaignId)
    setSessionMeta((prev) => ({ ...prev, [rowId]: { ...(prev[rowId] || {}), campaignId: campaignId || null } }))
  }

  const createCampaignInline = async (name) => {
    const c = await createCampaign({ name })
    setCampaigns((prev) => [c, ...prev])
    return c.id
  }

  const persistStatus = useCallback(async (item, newStatus) => {
    const prevStatus = item.dmStatus
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
      // Roll the pill back so the UI never claims a status the DB didn't accept.
      setItems((prev) => prev.map((i) =>
        i.rowId === item.rowId && i.stateKey === item.stateKey
          ? { ...i, dmStatus: prevStatus, reviewEntry: { ...i.reviewEntry, dm_status: prevStatus } }
          : i
      ))
      window.alert('Couldn’t save the DM status — please try again.')
    }
  }, [])

  const handleCopyAndOpen = useCallback(async (item) => {
    if (item.dm_draft) {
      await navigator.clipboard.writeText(item.dm_draft).catch(() => {})
      setCopiedUser(`${item.rowId}-${item.stateKey}`) // unique per card; a handle can appear in >1 group
      setTimeout(() => setCopiedUser(null), 2000)
    }
    window.open(profileUrl(item), '_blank')
    if (item.dm_draft) await persistStatus(item, 'sent')
  }, [persistStatus])

  if (loading) return <Loading label="Loading approved accounts…" />

  const exportXlsx = () => {
    const results = items.map((item) => item.accountData || { username: item.username })
    const influencers = items.map((item) => item.accountData || { username: item.username, fullName: item.fullName })
    // The DM draft is campaign-level now; fold it onto each account's entry so
    // the exporter's per-row dm_draft column stays populated.
    const reviewState = Object.fromEntries(items.map((item) => [item.stateKey, { ...item.reviewEntry, dm_draft: item.dm_draft }]))
    const exportIds = [
      ...ALWAYS_EXPORT_IDS,
      ...TABLE_COLUMNS.filter((c) => selectedColumns.includes(c.id)).flatMap((c) => c.exportIds),
    ]
    exportToCsv(results, influencers, exportIds, {}, reviewState, { reachoutDefault: 'Sent' }).catch(console.error)
  }

  return (
    <div className="min-h-screen px-[48px] py-[40px] max-w-3xl mx-auto">
      <PageHeader
        className="mb-8"
        label="Ready to Send"
        title={`${items.length} ${items.length === 1 ? 'account' : 'accounts'} approved`}
        subtitle="Copy each DM draft and open the Instagram profile to send."
        actions={
          <>
            <ColumnPicker selected={selectedColumns} onChange={handleColumnsChange} label="Export columns" />
            <button
              onClick={exportXlsx}
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
          </>
        }
      />

      {error && (
        <div className="mb-6 px-4 py-3 bg-rose/5 border border-rose/20 rounded-[12px] text-[12px] text-rose">{error}</div>
      )}

      {items.length === 0 && !error && (
        <EmptyState
          icon={SendHorizonal}
          tone="sage"
          title="Nothing ready to send"
          description="Approved accounts will appear here with their drafted DMs."
        />
      )}

      <div className="space-y-3">
        {campaignGroups.map((cg) => {
          const approvedCount = cg.items.reduce((n, s) => n + s.items.length, 0)
          const isOpen = openGroups.has(groupKey(cg.id))
          return (
          <div key={cg.id || 'unassigned'} className="border border-card-edge rounded-[14px] bg-white overflow-hidden">
            <button
              onClick={() => toggleGroup(cg.id)}
              aria-expanded={isOpen}
              className="w-full flex items-center gap-2.5 px-5 py-4 text-left hover:bg-surface transition-colors"
            >
              <ChevronRight
                size={16}
                className={`flex-shrink-0 text-faint transition-transform ${isOpen ? 'rotate-90' : ''}`}
              />
              <FolderOpen size={15} className={cg.id ? 'text-sage' : 'text-faint'} />
              <h2 className="text-[16px] font-serif font-bold text-ink flex-1 min-w-0 truncate">{cg.name}</h2>
              <span className="font-mono text-[11px] text-faint tabular-nums flex-shrink-0">
                {approvedCount} approved
              </span>
            </button>
            {isOpen && (
            <div className="space-y-8 px-5 pb-6 pt-1 border-t border-mist">
        {cg.items.map((group) => (
          <div key={group.rowId}>
            <div className="flex items-center gap-3 mb-3 pb-3 border-b border-mist">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-[13.5px] text-ink truncate">
                  {(group.campaignBrief || '').length > 90 ? group.campaignBrief.slice(0, 90) + '…' : group.campaignBrief || '(no brief)'}
                </p>
                <p className="text-[11px] text-faint font-mono mt-0.5">
                  {formatDate(group.createdAt)} · {group.items.length} {group.items.length === 1 ? 'account' : 'accounts'} approved
                </p>
              </div>
              <CampaignMoveMenu
                campaigns={campaigns}
                value={group.campaignId || null}
                onMove={(cid) => moveSubmission(group.rowId, cid)}
                onCreate={createCampaignInline}
                label="Move to campaign"
              />
            </div>
            <div className="space-y-3">
              {group.items.map((item) => (
                <div
                  key={`${item.rowId}-${item.stateKey}`}
                  className="border border-sage/30 bg-sage/[0.06] rounded-[14px] px-5 py-4"
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
                      {copiedUser === `${item.rowId}-${item.stateKey}` ? <Check size={12} /> : <Copy size={12} />}
                      {copiedUser === `${item.rowId}-${item.stateKey}` ? 'Copied!' : 'Copy & open profile'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
            </div>
            )}
          </div>
          )
        })}
      </div>
    </div>
  )
}
