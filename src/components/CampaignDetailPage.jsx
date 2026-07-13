import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Loader2, ArrowLeft, ExternalLink, UserPlus, X, RefreshCw, Trash2,
  Truck, CalendarClock, Search,
} from 'lucide-react'
import {
  getCampaign, getCampaignKols, getApprovedKols, attachKols,
  updateKolState, setDeadlineOverride, detachKol,
  nextStates, effectiveDeadline,
} from '../lib/campaigns'

function formatDate(isoStr) {
  if (!isoStr) return '—'
  return new Date(isoStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function todayStr() { return new Date().toISOString().slice(0, 10) }

const STATE_META = {
  approved:      { label: 'Approved',      cls: 'bg-ink/10 text-ink/60' },
  shipped:       { label: 'Shipped',       cls: 'bg-blue-100 text-blue-700' },
  awaiting_post: { label: 'Awaiting post', cls: 'bg-accent/25 text-[#8A6A22]' },
  posted:        { label: 'Posted',        cls: 'bg-green-100 text-green-700' },
  overdue:       { label: 'Overdue',       cls: 'bg-rose/10 text-rose' },
  opted_out:     { label: 'Opted out',     cls: 'bg-ink/5 text-faint' },
}
const ACTION_LABEL = {
  shipped: 'Mark shipped',
  awaiting_post: 'Mark awaiting',
  posted: 'Mark posted',
  overdue: 'Mark overdue',
  opted_out: 'Opt out',
  approved: 'Reopen',
}
const BOARD_ORDER = ['approved', 'shipped', 'awaiting_post', 'overdue', 'posted', 'opted_out']

function AttachModal({ campaignId, existingHandles, onClose, onAttached }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [approved, setApproved] = useState([])
  const [selected, setSelected] = useState(() => new Set())
  const [query, setQuery] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !saving) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, saving])

  useEffect(() => {
    (async () => {
      try {
        setApproved(await getApprovedKols())
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const have = useMemo(() => new Set(existingHandles), [existingHandles])
  const available = useMemo(
    () => approved.filter((k) => !have.has(k.handle)),
    [approved, have]
  )
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return available
    return available.filter((k) =>
      k.handle.includes(q) || (k.fullName || '').toLowerCase().includes(q))
  }, [available, query])

  const toggle = (handle) => setSelected((prev) => {
    const next = new Set(prev)
    next.has(handle) ? next.delete(handle) : next.add(handle)
    return next
  })

  const attach = async () => {
    setSaving(true)
    setError(null)
    try {
      const picks = available.filter((k) => selected.has(k.handle))
      const n = await attachKols(campaignId, picks, existingHandles)
      onAttached(n)
    } catch (e) {
      setError(e.message)
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-[2px] px-4"
      onClick={() => !saving && onClose()}>
      <div className="w-full max-w-[540px] max-h-[86vh] flex flex-col bg-white rounded-[16px] shadow-xl"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between p-6 pb-4">
          <div>
            <p className="font-mono text-[10px] tracking-[.16em] text-faint uppercase mb-1">Attach KOLs</p>
            <h2 className="text-[18px] font-semibold text-ink">Approved from the Review Queue</h2>
          </div>
          <button onClick={() => !saving && onClose()} className="text-faint hover:text-ink transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="px-6">
          <div className="flex items-center gap-2 px-3 py-2 border border-mist rounded-[10px] bg-white mb-3">
            <Search size={14} className="text-faint" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter by handle or name"
              className="flex-1 text-[13px] text-ink bg-transparent focus:outline-none" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 min-h-[160px]">
          {loading ? (
            <div className="flex items-center justify-center py-16"><Loader2 size={20} className="animate-spin text-faint" /></div>
          ) : error ? (
            <div className="px-3 py-2 bg-rose/5 border border-rose/20 rounded-[10px] text-[12px] text-rose">{error}</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-[13px] text-muted">
                {available.length === 0
                  ? 'No approved KOLs left to attach — approve some in the Review Queue first.'
                  : 'No matches for that filter.'}
              </p>
            </div>
          ) : (
            <div className="space-y-1.5 pb-2">
              {filtered.map((k) => (
                <label key={k.handle}
                  className="flex items-center gap-3 px-3 py-2 rounded-[10px] border border-transparent hover:bg-surface cursor-pointer">
                  <input type="checkbox" checked={selected.has(k.handle)} onChange={() => toggle(k.handle)}
                    className="accent-ink w-[15px] h-[15px] rounded flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-ink truncate">@{k.handle}</p>
                    {k.fullName && <p className="text-[11px] text-faint truncate">{k.fullName}</p>}
                  </div>
                  {k.aiScore != null && (
                    <span title={k.aiReason || ''}
                      className="flex-shrink-0 font-mono text-[10px] text-body bg-surface border border-card-edge rounded-[6px] px-1.5 py-0.5">
                      AI {k.aiScore}/10
                    </span>
                  )}
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 p-6 pt-4 border-t border-mist">
          <p className="text-[12px] text-faint font-mono">{selected.size} selected</p>
          <div className="flex items-center gap-2">
            <button onClick={() => !saving && onClose()} disabled={saving}
              className="px-4 py-2 rounded-[10px] text-[13px] font-medium text-ink hover:bg-surface transition-colors disabled:opacity-50">
              Cancel
            </button>
            <button onClick={attach} disabled={saving || selected.size === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-[10px] bg-ink text-white text-[13px] font-medium hover:bg-ink/80 transition-colors disabled:opacity-40">
              {saving && <Loader2 size={13} className="animate-spin" />}
              {saving ? 'Attaching…' : `Attach ${selected.size || ''}`.trim()}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function KolRow({ kol, campaign, onStateChange, onOverride, onDetach }) {
  const [busy, setBusy] = useState(false)
  const eff = effectiveDeadline(kol, campaign)
  const pastDeadline = eff && eff < todayStr() && ['shipped', 'awaiting_post'].includes(kol.state)
  const targets = nextStates(kol.state)
  const forward = targets.find((t) => t !== 'opted_out')

  const doTransition = async (to) => {
    setBusy(true)
    try { await onStateChange(kol, to) } finally { setBusy(false) }
  }

  return (
    <div className="border border-card-edge rounded-[12px] px-4 py-3 bg-white">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <a href={`https://instagram.com/${kol.kol_handle}`} target="_blank" rel="noreferrer"
            className="font-semibold text-[13.5px] text-ink hover:text-ink/70 flex items-center gap-1">
            @{kol.kol_handle} <ExternalLink size={11} className="opacity-40" />
          </a>
          <div className="flex items-center flex-wrap gap-x-2.5 gap-y-1 mt-1 text-[11px] font-mono text-faint">
            <span>Tier {kol.tier}</span>
            {kol.shipped_at && <span className="flex items-center gap-1"><Truck size={11} /> {formatDate(kol.shipped_at)}</span>}
            <span className="flex items-center gap-1">
              <CalendarClock size={11} /> {formatDate(eff)}
              {kol.deadline_override && <span className="text-accent">(override)</span>}
            </span>
            {pastDeadline && <span className="text-rose font-medium">past deadline</span>}
          </div>
        </div>
        <span className={`flex-shrink-0 text-[10px] font-mono px-2 py-1 rounded-full ${STATE_META[kol.state]?.cls || ''}`}>
          {STATE_META[kol.state]?.label || kol.state}
        </span>
      </div>

      <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-mist/70">
        <div className="flex items-center gap-1.5">
          {forward && (
            <button onClick={() => doTransition(forward)} disabled={busy}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-ink text-white rounded-[9px] text-[12px] hover:bg-ink/80 transition-all disabled:opacity-50">
              {busy ? <Loader2 size={12} className="animate-spin" /> : (forward === 'shipped' ? <Truck size={12} /> : null)}
              {ACTION_LABEL[forward]}
            </button>
          )}
          {/* Other non-forward, non-opt-out transitions (e.g. awaiting_post → overdue) */}
          {targets.filter((t) => t !== forward && t !== 'opted_out').map((t) => (
            <button key={t} onClick={() => doTransition(t)} disabled={busy}
              className="px-3 py-1.5 border border-mist rounded-[9px] text-[12px] text-muted hover:border-ink/30 hover:text-ink transition-all disabled:opacity-50">
              {ACTION_LABEL[t]}
            </button>
          ))}
          <label className="flex items-center gap-1.5 ml-1 text-[11px] font-mono text-faint">
            <span className="hidden sm:inline">Deadline</span>
            <input type="date" value={kol.deadline_override || ''}
              onChange={(e) => onOverride(kol, e.target.value || null)}
              className="px-2 py-1 border border-mist rounded-[8px] text-[11px] text-ink bg-white focus:outline-none focus:border-ink/40" />
          </label>
        </div>
        <div className="flex items-center gap-1">
          {targets.includes('opted_out') && (
            <button onClick={() => doTransition('opted_out')} disabled={busy}
              className="px-2.5 py-1.5 text-[12px] text-faint hover:text-rose transition-colors disabled:opacity-50">
              Opt out
            </button>
          )}
          <button onClick={() => onDetach(kol)} title="Remove from campaign"
            className="flex items-center justify-center w-8 h-8 rounded-[9px] border border-card-edge text-faint hover:text-rose hover:border-rose/30 hover:bg-rose/5 transition-all">
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </div>
  )
}

export default function CampaignDetailPage({ campaignId, onBack }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [campaign, setCampaign] = useState(null)
  const [kols, setKols] = useState([])
  const [showAttach, setShowAttach] = useState(false)
  const [toast, setToast] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [c, ks] = await Promise.all([getCampaign(campaignId), getCampaignKols(campaignId)])
      setCampaign(c)
      setKols(ks)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [campaignId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])

  const handleStateChange = useCallback(async (kol, to) => {
    try {
      const updated = await updateKolState(kol, to)
      setKols((prev) => prev.map((k) => (k.id === kol.id ? updated : k)))
    } catch (e) {
      setToast({ type: 'error', message: e.message })
    }
  }, [])

  const handleOverride = useCallback(async (kol, date) => {
    // optimistic
    setKols((prev) => prev.map((k) => (k.id === kol.id ? { ...k, deadline_override: date } : k)))
    try {
      const updated = await setDeadlineOverride(kol.id, date)
      setKols((prev) => prev.map((k) => (k.id === kol.id ? updated : k)))
    } catch (e) {
      setToast({ type: 'error', message: e.message })
      load()
    }
  }, [load])

  const handleDetach = useCallback(async (kol) => {
    try {
      await detachKol(kol.id)
      setKols((prev) => prev.filter((k) => k.id !== kol.id))
      setToast({ type: 'success', message: `@${kol.kol_handle} removed` })
    } catch (e) {
      setToast({ type: 'error', message: e.message })
    }
  }, [])

  const existingHandles = useMemo(() => kols.map((k) => k.kol_handle), [kols])
  const grouped = useMemo(() => {
    const g = {}
    for (const k of kols) (g[k.state] = g[k.state] || []).push(k)
    return g
  }, [kols])

  if (loading) {
    return <div className="flex-1 flex items-center justify-center"><Loader2 size={24} className="animate-spin text-faint" /></div>
  }

  if (error && !campaign) {
    return (
      <div className="min-h-screen px-[48px] py-[40px] max-w-3xl mx-auto">
        <button onClick={onBack} className="flex items-center gap-1.5 text-[13px] text-muted hover:text-ink transition-colors mb-6">
          <ArrowLeft size={14} /> Back to campaigns
        </button>
        <div className="px-4 py-3 bg-rose/5 border border-rose/20 rounded-[12px] text-[12px] text-rose">{error}</div>
      </div>
    )
  }

  const total = kols.length
  const posted = (grouped.posted || []).length

  return (
    <div className="min-h-screen px-[48px] py-[40px] max-w-3xl mx-auto">
      <button onClick={onBack} className="flex items-center gap-1.5 text-[13px] text-muted hover:text-ink transition-colors mb-6">
        <ArrowLeft size={14} /> Back to campaigns
      </button>

      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="font-mono text-[10px] tracking-[.18em] text-faint uppercase">Campaign</p>
            <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
              campaign.status === 'active' ? 'bg-sage/10 text-sage' : 'bg-ink/5 text-faint'}`}>{campaign.status}</span>
          </div>
          <h1 className="text-[27px] font-bold tracking-[-0.02em] text-ink mb-1">{campaign.name}</h1>
          <p className="text-[13px] text-muted font-mono">
            {campaign.brand} · {campaign.market} · {campaign.campaign_type} · deadline {formatDate(campaign.posting_deadline)}
          </p>
          {(campaign.mention_handles?.length > 0 || campaign.hashtags?.length > 0) && (
            <div className="flex items-center flex-wrap gap-1.5 mt-3">
              {(campaign.mention_handles || []).map((h) => <span key={`m-${h}`} className="tag">@{h}</span>)}
              {(campaign.hashtags || []).map((h) => <span key={`h-${h}`} className="tag tag-video">#{h}</span>)}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={() => setShowAttach(true)}
            className="flex items-center gap-2 px-4 py-2 bg-ink text-white rounded-[10px] text-[13px] hover:bg-ink/80 transition-all whitespace-nowrap">
            <UserPlus size={14} /> Attach KOLs
          </button>
          <button onClick={load}
            className="flex items-center gap-2 px-3 py-2 border border-mist rounded-[10px] text-[13px] text-muted hover:border-ink/30 hover:text-ink transition-all bg-white">
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      {total > 0 && (
        <div className="flex items-center gap-4 mb-6 px-4 py-3 bg-surface border border-card-edge rounded-[12px]">
          <p className="text-[12px] font-mono text-muted">{total} {total === 1 ? 'KOL' : 'KOLs'}</p>
          <span className="text-mist">·</span>
          <p className="text-[12px] font-mono text-sage">{posted} posted</p>
          <span className="text-mist">·</span>
          <p className="text-[12px] font-mono text-muted">
            {total > 0 ? Math.round((posted / total) * 100) : 0}% fulfilled
          </p>
        </div>
      )}

      {error && (
        <div className="mb-6 px-4 py-3 bg-rose/5 border border-rose/20 rounded-[12px] text-[12px] text-rose">{error}</div>
      )}

      {total === 0 && !error && (
        <div className="flex flex-col items-center py-20">
          <UserPlus size={30} className="text-faint mb-4" />
          <h2 className="text-[16px] font-semibold text-ink mb-2">No KOLs attached yet</h2>
          <p className="text-[13px] text-muted text-center mb-5">Attach approved KOLs from the Review Queue to start tracking them.</p>
          <button onClick={() => setShowAttach(true)}
            className="flex items-center gap-2 px-4 py-2 bg-ink text-white rounded-[10px] text-[13px] hover:bg-ink/80 transition-all">
            <UserPlus size={14} /> Attach KOLs
          </button>
        </div>
      )}

      <div className="space-y-6">
        {BOARD_ORDER.map((state) => {
          const rows = grouped[state]
          if (!rows || rows.length === 0) return null
          return (
            <div key={state}>
              <div className="flex items-center gap-2 mb-2.5">
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${STATE_META[state].cls}`}>{STATE_META[state].label}</span>
                <span className="text-[11px] font-mono text-faint">{rows.length}</span>
              </div>
              <div className="space-y-2">
                {rows.map((kol) => (
                  <KolRow key={kol.id} kol={kol} campaign={campaign}
                    onStateChange={handleStateChange} onOverride={handleOverride} onDetach={handleDetach} />
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {showAttach && (
        <AttachModal
          campaignId={campaignId}
          existingHandles={existingHandles}
          onClose={() => setShowAttach(false)}
          onAttached={(n) => {
            setShowAttach(false)
            setToast({ type: 'success', message: n > 0 ? `${n} KOL${n === 1 ? '' : 's'} attached` : 'No new KOLs to attach' })
            load()
          }}
        />
      )}

      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] px-4 py-3 rounded-[12px] shadow-lg text-[13px] font-medium ${
          toast.type === 'error' ? 'bg-rose text-white' : 'bg-ink text-white'}`}>
          {toast.message}
        </div>
      )}
    </div>
  )
}
