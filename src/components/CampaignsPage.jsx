import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  Loader2, RefreshCw, ArrowRight, Rocket, Plus, X, Upload, Search,
  FileSpreadsheet, Trash2, AlertTriangle, Pencil, Check,
} from 'lucide-react'
import { listCampaigns, createCampaign, getOrCreateBrand, getApprovedKolsForRun, attachKols, deleteCampaign, updateCampaignSetup, setCampaignAssignees, listAssignableUsers } from '../lib/campaigns'
import { BRAND_CATALOG } from '../lib/brandCatalog'
import { formatDate, campaignMetrics, money } from '../lib/utils'
import { useFocusTrap } from '../hooks/useFocusTrap'
import ImportCampaignModal from './ImportCampaignModal'
import AssigneePicker from './core/AssigneePicker'
import PageHeader from './core/PageHeader'
import EmptyState from './core/EmptyState'
import Loading from './core/Loading'
import Toast, { useAutoDismissToast } from './core/Toast'

// Opens the campaign's live Google Sheet. Disabled until the sheet exists so it
// never dead-ends.
function OpenSheetButton({ url }) {
  if (!url) {
    return (
      <span title="Created automatically once the campaign's list is approved"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] border border-mist rounded-[9px] text-faint/70 cursor-not-allowed whitespace-nowrap">
        <FileSpreadsheet size={13} /> Sheet
      </span>
    )
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
      title="Open the campaign's Google Sheet"
      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] border border-mist rounded-[9px] text-body hover:border-ink/40 hover:bg-surface transition-all whitespace-nowrap">
      <FileSpreadsheet size={13} /> Sheet
    </a>
  )
}

// Counts we surface on a campaign panel, in pipeline order. `bar` is the
// segmented-progress-bar colour; `sw`/`text` drive the legend swatch + label.
const COUNT_ORDER = [
  { key: 'approved', label: 'approved', bar: 'bg-faint', sw: 'bg-faint', text: 'text-muted' },
  { key: 'shipped', label: 'shipped', bar: 'bg-info', sw: 'bg-info', text: 'text-muted' },
  { key: 'awaiting_post', label: 'awaiting', bar: 'bg-[#8A6A22]', sw: 'bg-[#8A6A22]', text: 'text-muted' },
  { key: 'overdue', label: 'overdue', bar: 'bg-rose', sw: 'bg-rose', text: 'text-rose-strong' },
  { key: 'posted', label: 'posted', bar: 'bg-sage', sw: 'bg-sage', text: 'text-muted' },
  { key: 'opted_out', label: 'opted out', bar: 'bg-faint/40', sw: 'bg-faint/40', text: 'text-faint' },
]

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'attention', label: 'Needs attention' },
  { id: 'completed', label: 'Completed' },
]

// Days until a deadline (null if none / already past-counted elsewhere).
function daysUntil(iso) {
  if (!iso) return null
  const ms = new Date(iso).getTime() - Date.now()
  return Math.ceil(ms / 86400000)
}

// A single campaign panel: identity + status, a fulfillment ring, a segmented
// pipeline bar, a count legend, and the action footer. Overdue campaigns get a
// warning tint so what needs attention reads at a glance.
function CampaignPanel({
  c, assignees, editingId, editingName, onStartRename, onEditingNameChange,
  onCommitRename, onCancelRename, onRenameKeyDown, onAssign, onOpen, onDelete,
}) {
  const m = campaignMetrics(c)
  const counts = c.counts || {}
  const hasKols = m.total > 0
  const overdue = counts.overdue || 0
  const dLeft = daysUntil(c.posting_deadline)
  const isDone = c.status !== 'active'
  const segments = COUNT_ORDER.filter(({ key }) => counts[key])

  const meta = [
    c.brand,
    c.market,
    c.campaign_type,
    c.posting_deadline && `deadline ${formatDate(c.posting_deadline)}`,
    `${c.sessionCount || 0} session${c.sessionCount === 1 ? '' : 's'}`,
  ].filter(Boolean)

  return (
    <div className={`group/card flex flex-col gap-3.5 rounded-[16px] border p-5 transition-all hover:-translate-y-0.5 hover:shadow-[0_8px_22px_rgba(34,30,24,0.06)] ${
      overdue > 0 ? 'border-[#E7D3A8] bg-gradient-to-b from-[#FDFAF2] to-white' : 'border-card-edge bg-white hover:border-accent'
    }`}>
      {/* Identity */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {editingId === c.id ? (
            <span className="flex items-center gap-1.5">
              <input autoFocus value={editingName} onChange={(e) => onEditingNameChange(e.target.value)}
                onKeyDown={onRenameKeyDown} onBlur={onCommitRename}
                className="font-serif font-bold text-[17px] text-ink bg-transparent border-b border-ink/40 outline-none max-w-[220px]" />
              <button onClick={onCommitRename} title="Save" className="text-sage hover:text-sage/70"><Check size={15} /></button>
              <button onMouseDown={(e) => { e.preventDefault(); onCancelRename(e) }} title="Cancel" className="text-faint hover:text-ink"><X size={15} /></button>
            </span>
          ) : (
            <span className="group/name flex items-center gap-1.5 min-w-0">
              <h2 className="font-serif font-bold text-[17px] leading-tight text-ink truncate">{c.name}</h2>
              <button onClick={(e) => onStartRename(e, c)} title="Rename"
                className="text-faint hover:text-ink transition-colors opacity-0 group-hover/name:opacity-100 flex-shrink-0">
                <Pencil size={12} />
              </button>
            </span>
          )}
          <p className="text-[11.5px] text-faint mt-1 leading-snug">
            {meta.map((part, i) => (
              <span key={i}>{i > 0 && <span className="text-card-edge mx-1.5">·</span>}{part}</span>
            ))}
          </p>
        </div>
        <span className={`flex-shrink-0 text-[9.5px] font-semibold uppercase tracking-[.05em] px-2.5 py-1 rounded-full ${
          isDone ? 'bg-ink/5 text-faint' : 'bg-sage/12 text-sage'
        }`}>{c.status}</span>
      </div>

      {/* Fulfillment ring + segmented pipeline bar */}
      <div className="flex items-center gap-4">
        <div
          className="relative w-14 h-14 rounded-full grid place-items-center flex-shrink-0"
          style={{ background: hasKols
            ? `conic-gradient(var(--ring) ${m.fulfilled}%, #E1DCD0 0)`
            : '#E1DCD0', '--ring': overdue > 0 ? '#8A6A22' : '#4A7C59' }}
        >
          <span className="w-[42px] h-[42px] bg-white rounded-full grid place-items-center text-[12.5px] font-bold text-ink tabular-nums">
            {hasKols ? `${m.fulfilled}%` : '—'}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between text-[10.5px] mb-1.5">
            {overdue > 0 ? (
              <span className="font-semibold text-rose-strong">
                {overdue} overdue{dLeft != null && dLeft >= 0 ? ` · deadline in ${dLeft}d` : ''}
              </span>
            ) : (
              <span className="text-muted">{hasKols ? 'Fulfilled' : 'Not started'}</span>
            )}
            <span className="text-muted tabular-nums">
              {hasKols ? <><b className="text-ink font-semibold">{m.posted}</b> of {m.total} posted</> : <span className="text-faint">no KOLs attached</span>}
            </span>
          </div>
          {hasKols ? (
            <div className="flex h-2.5 rounded-full overflow-hidden bg-mist">
              {segments.map(({ key, bar }) => (
                <span key={key} className={bar} style={{ width: `${(counts[key] / m.total) * 100}%` }} />
              ))}
            </div>
          ) : (
            <div className="h-2.5 rounded-full" style={{ background: 'repeating-linear-gradient(45deg,#FAF8F3,#FAF8F3 5px,#E1DCD0 5px,#E1DCD0 10px)' }} />
          )}
        </div>
      </div>

      {/* Count legend / empty prompt */}
      {hasKols ? (
        <div className="flex flex-wrap gap-x-3.5 gap-y-1">
          {segments.map(({ key, label, sw, text }) => (
            <span key={key} className={`inline-flex items-center gap-1.5 text-[11px] tabular-nums ${text}`}>
              <span className={`w-2 h-2 rounded-sm flex-shrink-0 ${sw}`} />
              <b className="text-ink font-semibold">{counts[key]}</b> {label}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-[11.5px] text-faint">Attach approved KOLs from the Review Queue, or run a seeding session to get started.</p>
      )}

      {/* Budget vs committed spend — only when a budget is set on the campaign */}
      {m.budget != null && (
        <div>
          <div className="flex items-center justify-between text-[10.5px] mb-1.5">
            <span className={`font-semibold ${m.budgetUsed != null && m.budgetUsed > 100 ? 'text-rose-strong' : 'text-muted'}`}>
              {m.budgetUsed != null && m.budgetUsed > 100 ? 'Over budget' : 'Budget'}
              {m.targetKols ? <span className="text-faint font-normal"> · {m.total}/{m.targetKols} creators</span> : null}
            </span>
            <span className="text-muted tabular-nums">
              <b className="text-ink font-semibold">{money(m.spent)}</b> of {money(m.budget)}
            </span>
          </div>
          <div className="flex h-2.5 rounded-full overflow-hidden bg-mist">
            <span
              className={m.budgetUsed != null && m.budgetUsed > 100 ? 'bg-rose-strong' : 'bg-sage'}
              style={{ width: `${Math.min(100, m.budgetUsed || 0)}%` }}
            />
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center gap-2 pt-3 border-t border-surface mt-auto">
        <div className="mr-auto" onClick={(e) => e.stopPropagation()}>
          <AssigneePicker users={assignees} value={c.assigned_to || []} onChange={(ids) => onAssign(c, ids)} align="left" />
        </div>
        <OpenSheetButton url={c.sheet_url} />
        <button onClick={() => onOpen(c.id)}
          className="flex items-center gap-1.5 px-3.5 py-1.5 bg-ink text-white rounded-[9px] text-[12px] hover:bg-ink/80 transition-all">
          {hasKols ? 'Open' : 'Set up'} <ArrowRight size={13} />
        </button>
        <button onClick={() => onDelete(c)} title="Delete campaign"
          className="flex items-center justify-center w-8 h-8 rounded-[9px] border border-card-edge text-faint hover:text-rose hover:border-rose/30 hover:bg-rose/5 transition-all flex-shrink-0">
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  )
}

// Minimal create: name + brand only. Everything else (audience, keywords, brief,
// location, scrape targets) is set on the campaign page the user lands on next —
// one editor, no duplicate form here.
function NewCampaignModal({ onClose, onCreated, initialName = '', seededCount = 0 }) {
  const [name, setName] = useState(initialName)
  const [brand, setBrand] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const dialogRef = useFocusTrap(true)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !saving) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, saving])

  const submit = async () => {
    setError(null)
    if (!name.trim()) return setError('Campaign name is required')
    if (!brand.trim()) return setError('Pick a brand')
    setSaving(true)
    try {
      const b = await getOrCreateBrand(brand.trim())
      const created = await createCampaign({ name: name.trim(), brand: b.name, brand_id: b.id })
      onCreated(created)
    } catch (e) {
      setError(e.message)
      setSaving(false)
    }
  }

  const inputCls = 'w-full px-3 py-2 border border-mist rounded-[10px] text-[13px] text-ink bg-white focus:outline-none focus:border-ink/40 transition-colors'
  const labelCls = 'block text-[10px] font-mono text-faint uppercase tracking-[.14em] mb-1.5'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-[2px] px-4"
      onClick={() => !saving && onClose()}>
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Create a campaign"
        className="w-full max-w-[460px] bg-white rounded-[16px] shadow-xl p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-5">
          <div>
            <p className="font-mono text-[10px] tracking-[.16em] text-faint uppercase mb-1">New campaign</p>
            <h2 className="text-[18px] font-semibold text-ink">Create a campaign</h2>
            {seededCount > 0 && (
              <p className="text-[12px] text-sage mt-1">
                {seededCount} approved KOL{seededCount === 1 ? '' : 's'} from this run will be attached automatically.
              </p>
            )}
          </div>
          <button onClick={() => !saving && onClose()} className="text-faint hover:text-ink transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className={labelCls}>Name</label>
            <input className={inputCls} value={name} placeholder="HK Autumn Repair"
              onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div>
            <label className={labelCls}>Brand</label>
            <select className={inputCls} value={brand} onChange={(e) => setBrand(e.target.value)}>
              <option value="">Select a brand…</option>
              {BRAND_CATALOG.map((b) => <option key={b.id} value={b.name}>{b.name}</option>)}
            </select>
          </div>
          <p className="text-[12px] text-faint">
            You'll set the audience, keywords, brief, location and Instagram/Threads scrape targets on the next screen.
          </p>
        </div>

        {error && (
          <div className="mt-4 px-3 py-2 bg-rose/5 border border-rose/20 rounded-[10px] text-[12px] text-rose">{error}</div>
        )}

        <div className="flex items-center justify-end gap-2 mt-6">
          <button onClick={() => !saving && onClose()} disabled={saving}
            className="px-4 py-2 rounded-[10px] text-[13px] font-medium text-ink hover:bg-surface transition-colors disabled:opacity-50">
            Cancel
          </button>
          <button onClick={submit} disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-[10px] bg-ink text-white text-[13px] font-medium hover:bg-ink/80 transition-colors disabled:opacity-60">
            {saving && <Loader2 size={13} className="animate-spin" />}
            {saving ? 'Creating…' : 'Create & set up'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function CampaignsPage({ onOpenCampaign, seed, onSeedConsumed, onCampaignDeleted }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [campaigns, setCampaigns] = useState([])
  const [showNew, setShowNew] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [filter, setFilter] = useState('all') // all | active | attention | completed
  const [query, setQuery] = useState('')
  const [seedState, setSeedState] = useState(null) // { runId, name, count }
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editingName, setEditingName] = useState('')
  const [assignees, setAssignees] = useState([])
  const [toast, setToast] = useState(null)
  useAutoDismissToast(toast, setToast)
  const seedRunRef = useRef(null)
  const deleteDialogRef = useFocusTrap(!!deleteTarget)

  useEffect(() => {
    listAssignableUsers().then(setAssignees).catch(() => setAssignees([]))
  }, [])

  // Optimistic assignee change — revert on failure. `ids` is the full next list.
  const handleAssign = async (campaign, ids) => {
    const prev = campaign.assigned_to || []
    setCampaigns((cs) => cs.map((c) => (c.id === campaign.id ? { ...c, assigned_to: ids } : c)))
    try {
      await setCampaignAssignees(campaign.id, ids)
    } catch (e) {
      console.error('Assign campaign failed', e)
      setCampaigns((cs) => cs.map((c) => (c.id === campaign.id ? { ...c, assigned_to: prev } : c)))
      setToast({ type: 'error', message: e.message || 'Failed to change the owners — please try again.' })
    }
  }

  const load = useCallback(async () => {
    if (!supabaseConfigured()) { setLoading(false); return }
    setLoading(true)
    setError(null)
    try {
      setCampaigns(await listCampaigns())
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  // A seed arriving from "Start campaign" (Review Queue) opens the create form
  // pre-filled; its approved KOLs get attached on create.
  useEffect(() => {
    if (!seed) return
    seedRunRef.current = seed.runId || null
    setSeedState({ runId: seed.runId, name: seed.name || '', count: seed.count || 0 })
    setShowNew(true)
  }, [seed])

  const closeNew = useCallback(() => {
    setShowNew(false)
    const hadSeed = Boolean(seedRunRef.current)
    seedRunRef.current = null
    setSeedState(null)
    if (hadSeed) onSeedConsumed?.()
  }, [onSeedConsumed])

  const handleCreated = useCallback(async (created) => {
    setShowNew(false)
    const runId = seedRunRef.current
    seedRunRef.current = null
    setSeedState(null)
    if (runId) {
      try {
        const kols = await getApprovedKolsForRun(runId)
        await attachKols(created.id, kols)
      } catch (e) {
        // Non-fatal — the campaign exists; the user can attach manually.
        console.error('Auto-attach from run failed:', e)
      }
      onSeedConsumed?.()
    }
    onOpenCampaign(created.id)
  }, [onOpenCampaign, onSeedConsumed])

  const startRename = (e, c) => {
    e.stopPropagation()
    setEditingId(c.id)
    setEditingName(c.name || '')
  }
  const cancelRename = (e) => {
    e?.stopPropagation()
    setEditingId(null)
    setEditingName('')
  }
  const commitRename = async (e) => {
    e?.stopPropagation()
    const id = editingId
    const name = editingName.trim()
    const current = campaigns.find((c) => c.id === id)
    setEditingId(null)
    setEditingName('')
    if (!name || !current || name === current.name) return
    setCampaigns((prev) => prev.map((c) => (c.id === id ? { ...c, name } : c)))
    try {
      await updateCampaignSetup(id, { name })
    } catch (err) {
      console.error('Rename campaign failed', err)
      setCampaigns((prev) => prev.map((c) => (c.id === id ? { ...c, name: current.name } : c)))
      setToast({ type: 'error', message: err.message || 'Failed to rename campaign — please try again.' })
    }
  }
  const renameKeyDown = (e) => {
    if (e.key === 'Enter') commitRename(e)
    if (e.key === 'Escape') cancelRename(e)
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteCampaign(deleteTarget.id)
      setCampaigns((prev) => prev.filter((c) => c.id !== deleteTarget.id))
      onCampaignDeleted?.(deleteTarget.id)
      setDeleteTarget(null)
    } catch (e) {
      console.error('Delete campaign failed', e)
      setToast({ type: 'error', message: e.message || 'Failed to delete campaign — please try again.' })
    } finally {
      setDeleting(false)
    }
  }

  useEffect(() => {
    if (!deleteTarget) return
    const onKey = (e) => { if (e.key === 'Escape' && !deleting) setDeleteTarget(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [deleteTarget, deleting])

  if (loading) return <Loading label="Loading campaigns…" />

  const active = campaigns.filter((c) => c.status === 'active').length
  const attentionCount = campaigns.filter((c) => (c.counts?.overdue || 0) > 0).length
  const completedCount = campaigns.filter((c) => c.status !== 'active').length
  const filterCounts = { all: campaigns.length, active, attention: attentionCount, completed: completedCount }

  const q = query.trim().toLowerCase()
  const filtered = campaigns.filter((c) => {
    if (q && !`${c.name || ''} ${c.brand || ''} ${c.market || ''}`.toLowerCase().includes(q)) return false
    if (filter === 'active') return c.status === 'active'
    if (filter === 'completed') return c.status !== 'active'
    if (filter === 'attention') return (c.counts?.overdue || 0) > 0
    return true
  })

  const panelHandlers = {
    assignees, editingId, editingName,
    onStartRename: startRename, onEditingNameChange: setEditingName,
    onCommitRename: commitRename, onCancelRename: cancelRename, onRenameKeyDown: renameKeyDown,
    onAssign: handleAssign, onOpen: onOpenCampaign, onDelete: setDeleteTarget,
  }

  return (
    <div className="min-h-screen px-[48px] py-[40px] max-w-6xl mx-auto">
      <PageHeader
        className="mb-6"
        label="Campaigns"
        title={`${campaigns.length} ${campaigns.length === 1 ? 'campaign' : 'campaigns'}`}
        subtitle={`${active} active · seeding operations from shipped to posted.`}
        actions={
          <>
            <button onClick={() => setShowImport(true)}
              className="flex items-center gap-2 px-4 py-2 border border-mist rounded-[10px] text-[13px] text-muted hover:border-ink/30 hover:text-ink transition-all bg-white whitespace-nowrap">
              <Upload size={14} /> Import
            </button>
            <button onClick={() => setShowNew(true)}
              className="flex items-center gap-2 px-4 py-2 bg-ink text-white rounded-[10px] text-[13px] hover:bg-ink/80 transition-all whitespace-nowrap">
              <Plus size={14} /> New campaign
            </button>
            <button onClick={load} title="Refresh"
              className="flex items-center gap-2 px-3 py-2 border border-mist rounded-[10px] text-[13px] text-muted hover:border-ink/30 hover:text-ink transition-all bg-white">
              <RefreshCw size={13} />
            </button>
          </>
        }
      />

      {/* Filter rail + search — replaces the old card/table toggle */}
      {campaigns.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap mb-6">
          {FILTERS.map((f) => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              className={`text-[12px] px-3 py-1.5 rounded-full border transition-all ${
                filter === f.id ? 'bg-ink text-white border-ink' : 'bg-white border-mist text-muted hover:border-ink/25 hover:text-ink'
              }`}>
              {f.label}
              <span className={`ml-1.5 tabular-nums ${filter === f.id ? 'opacity-70' : 'opacity-55'}`}>{filterCounts[f.id]}</span>
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2 border border-mist rounded-[10px] bg-white px-3 py-2 min-w-[200px]">
            <Search size={13} className="text-faint flex-shrink-0" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search campaigns…"
              className="w-full bg-transparent outline-none text-[12.5px] text-ink placeholder:text-faint" />
          </div>
        </div>
      )}

      {error && (
        <div className="mb-6 px-4 py-3 bg-rose/5 border border-rose/20 rounded-[12px] text-[12px] text-rose">{error}</div>
      )}

      {campaigns.length === 0 && !error && (
        <EmptyState
          icon={Rocket}
          title="No campaigns yet"
          description="Create a campaign, then attach approved KOLs from the Review Queue."
          action={
            <button onClick={() => setShowNew(true)}
              className="flex items-center gap-2 px-4 py-2 bg-ink text-white rounded-[10px] text-[13px] hover:bg-ink/80 transition-all">
              <Plus size={14} /> New campaign
            </button>
          }
        />
      )}

      {campaigns.length > 0 && filtered.length === 0 && (
        <p className="text-[13px] text-muted text-center py-16 border border-dashed border-mist rounded-[14px]">
          No campaigns match {query ? `“${query}”` : 'this filter'}.
        </p>
      )}

      {filtered.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
          {filtered.map((c) => (
            <CampaignPanel key={c.id} c={c} {...panelHandlers} />
          ))}
        </div>
      )}


      {showNew && (
        <NewCampaignModal
          initialName={seedState?.name || ''}
          seededCount={seedState?.count || 0}
          onClose={closeNew}
          onCreated={handleCreated}
        />
      )}

      {showImport && (
        <ImportCampaignModal
          onClose={() => setShowImport(false)}
          onImported={(campaignId) => { setShowImport(false); onOpenCampaign(campaignId) }}
        />
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-[2px] px-4"
          onClick={() => !deleting && setDeleteTarget(null)}>
          <div ref={deleteDialogRef} role="dialog" aria-modal="true" aria-label="Delete campaign"
            className="w-full max-w-[400px] bg-white rounded-[16px] shadow-xl p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-rose/10 mb-4">
              <AlertTriangle size={18} className="text-rose" />
            </div>
            <h2 className="text-[16px] font-semibold text-ink mb-1.5">Delete “{deleteTarget.name}”?</h2>
            <p className="text-[13px] text-muted mb-2 leading-relaxed">
              This removes the campaign and its attached KOL pipeline
              {Object.values(deleteTarget.counts || {}).reduce((a, b) => a + b, 0) > 0
                ? ` (${Object.values(deleteTarget.counts).reduce((a, b) => a + b, 0)} KOL${Object.values(deleteTarget.counts).reduce((a, b) => a + b, 0) === 1 ? '' : 's'})`
                : ''}. This can’t be undone.
            </p>
            <p className="text-[12px] text-faint mb-6 leading-relaxed">
              Its {deleteTarget.sessionCount || 0} seeding session{deleteTarget.sessionCount === 1 ? '' : 's'} and any review submissions are kept — they just move back to “Unassigned.”
            </p>
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setDeleteTarget(null)} disabled={deleting}
                className="px-4 py-2 rounded-[10px] text-[13px] font-medium text-ink hover:bg-surface transition-colors disabled:opacity-50">
                Cancel
              </button>
              <button onClick={confirmDelete} disabled={deleting}
                className="flex items-center gap-2 px-4 py-2 rounded-[10px] bg-rose text-white text-[13px] font-medium hover:bg-rose/90 transition-colors disabled:opacity-60">
                {deleting && <Loader2 size={13} className="animate-spin" />}
                {deleting ? 'Deleting…' : 'Delete campaign'}
              </button>
            </div>
          </div>
        </div>
      )}
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  )
}

// Local mirror of the supabase-null guard the other pages inline. Keeps the
// "local dev without Supabase" path from throwing before load() short-circuits.
function supabaseConfigured() {
  return Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY)
}
