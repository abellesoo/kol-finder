import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Loader2, RefreshCw, ArrowRight, Rocket, Plus, X, Upload,
  LayoutGrid, Table2, FileSpreadsheet,
} from 'lucide-react'
import { listCampaigns, createCampaign, getOrCreateBrand, getApprovedKolsForRun, attachKols } from '../lib/campaigns'
import { BRAND_CATALOG } from '../lib/brandCatalog'
import { useUrlParam } from '../lib/useUrlParam'
import ImportCampaignModal from './ImportCampaignModal'

// Roll a campaign's per-state counts up to the numbers the table view shows.
function campaignMetrics(c) {
  const counts = c.counts || {}
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  const posted = counts.posted || 0
  const overdue = counts.overdue || 0
  return { total, posted, overdue, fulfilled: total ? Math.round((posted / total) * 100) : 0 }
}

// Opens the campaign's live Google Sheet (created in Phase 4). Disabled until the
// sheet exists so it never dead-ends.
function OpenSheetButton({ url, size = 'sm' }) {
  const cls = size === 'sm'
    ? 'px-2.5 py-1.5 text-[12px]'
    : 'px-4 py-2 text-[13px]'
  if (!url) {
    return (
      <span title="Created automatically once the campaign's list is approved (Phase 4)"
        className={`inline-flex items-center gap-1.5 ${cls} border border-mist rounded-[10px] text-faint/70 cursor-not-allowed whitespace-nowrap`}>
        <FileSpreadsheet size={13} /> Sheet
      </span>
    )
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
      title="Open the campaign's Google Sheet"
      className={`inline-flex items-center gap-1.5 ${cls} border border-mist rounded-[10px] text-ink hover:border-ink/40 hover:bg-surface transition-all whitespace-nowrap`}>
      <FileSpreadsheet size={13} /> Sheet
    </a>
  )
}

function formatDate(isoStr) {
  if (!isoStr) return '—'
  return new Date(isoStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

// Counts we surface on a campaign card, in pipeline order.
const COUNT_ORDER = [
  { key: 'approved', label: 'approved', cls: 'text-faint' },
  { key: 'shipped', label: 'shipped', cls: 'text-blue-700' },
  { key: 'awaiting_post', label: 'awaiting', cls: 'text-[#8A6A22]' },
  { key: 'overdue', label: 'overdue', cls: 'text-rose/80' },
  { key: 'posted', label: 'posted', cls: 'text-sage font-medium' },
  { key: 'opted_out', label: 'opted out', cls: 'text-faint/70' },
]

// Minimal create: name + brand only. Everything else (audience, keywords, brief,
// location, scrape targets) is set on the campaign page the user lands on next —
// one editor, no duplicate form here.
function NewCampaignModal({ onClose, onCreated, initialName = '', seededCount = 0 }) {
  const [name, setName] = useState(initialName)
  const [brand, setBrand] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

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
      <div className="w-full max-w-[460px] bg-white rounded-[16px] shadow-xl p-6" onClick={(e) => e.stopPropagation()}>
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

export default function CampaignsPage({ onOpenCampaign, seed, onSeedConsumed }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [campaigns, setCampaigns] = useState([])
  const [showNew, setShowNew] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [view, setView] = useUrlParam('campaigns_view', 'cards') // 'cards' | 'table' (shareable via URL)
  const [seedState, setSeedState] = useState(null) // { runId, name, count }
  const seedRunRef = useRef(null)

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

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-faint" />
      </div>
    )
  }

  const active = campaigns.filter((c) => c.status === 'active').length

  return (
    <div className="min-h-screen px-[48px] py-[40px] max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="font-mono text-[10px] tracking-[.18em] text-faint uppercase mb-[8px]">Campaigns</p>
          <h1 className="text-[34px] font-serif font-bold tracking-[0.02em] text-ink mb-1">
            {campaigns.length} {campaigns.length === 1 ? 'campaign' : 'campaigns'}
          </h1>
          <p className="text-[14px] text-muted">
            {active} active · seeding operations from shipped to posted.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {campaigns.length > 0 && (
            <div className="flex items-center border border-mist rounded-[10px] bg-white p-0.5 mr-1">
              <button onClick={() => setView('cards')} title="Card view"
                className={`flex items-center justify-center w-8 h-8 rounded-[8px] transition-colors ${
                  view === 'cards' ? 'bg-ink text-white' : 'text-faint hover:text-ink'}`}>
                <LayoutGrid size={14} />
              </button>
              <button onClick={() => setView('table')} title="Table view"
                className={`flex items-center justify-center w-8 h-8 rounded-[8px] transition-colors ${
                  view === 'table' ? 'bg-ink text-white' : 'text-faint hover:text-ink'}`}>
                <Table2 size={14} />
              </button>
            </div>
          )}
          <button onClick={() => setShowImport(true)}
            className="flex items-center gap-2 px-4 py-2 border border-mist rounded-[10px] text-[13px] text-muted hover:border-ink/30 hover:text-ink transition-all bg-white whitespace-nowrap">
            <Upload size={14} /> Import
          </button>
          <button onClick={() => setShowNew(true)}
            className="flex items-center gap-2 px-4 py-2 bg-ink text-white rounded-[10px] text-[13px] hover:bg-ink/80 transition-all whitespace-nowrap">
            <Plus size={14} /> New campaign
          </button>
          <button onClick={load}
            className="flex items-center gap-2 px-3 py-2 border border-mist rounded-[10px] text-[13px] text-muted hover:border-ink/30 hover:text-ink transition-all bg-white">
            <RefreshCw size={13} /> Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 px-4 py-3 bg-rose/5 border border-rose/20 rounded-[12px] text-[12px] text-rose">{error}</div>
      )}

      {campaigns.length === 0 && !error && (
        <div className="flex flex-col items-center py-24">
          <Rocket size={32} className="text-faint mb-4" />
          <h2 className="text-[17px] font-semibold text-ink mb-2">No campaigns yet</h2>
          <p className="text-[13.5px] text-muted text-center mb-5">Create a campaign, then attach approved KOLs from the Review Queue.</p>
          <button onClick={() => setShowNew(true)}
            className="flex items-center gap-2 px-4 py-2 bg-ink text-white rounded-[10px] text-[13px] hover:bg-ink/80 transition-all">
            <Plus size={14} /> New campaign
          </button>
        </div>
      )}

      {view === 'table' && campaigns.length > 0 ? (
        <div className="overflow-x-auto border border-card-edge rounded-[14px] bg-white">
          <table className="w-full text-[12.5px] border-collapse">
            <thead>
              <tr className="text-left font-mono text-[10px] uppercase tracking-[.12em] text-faint border-b border-mist">
                <th className="px-4 py-3 font-normal">Campaign</th>
                <th className="px-3 py-3 font-normal">Brand</th>
                <th className="px-3 py-3 font-normal">Market</th>
                <th className="px-3 py-3 font-normal">Deadline</th>
                <th className="px-3 py-3 font-normal text-right">Sessions</th>
                <th className="px-3 py-3 font-normal text-right">KOLs</th>
                <th className="px-3 py-3 font-normal text-right">Posted</th>
                <th className="px-3 py-3 font-normal text-right">Overdue</th>
                <th className="px-3 py-3 font-normal text-right">Fulfilled</th>
                <th className="px-3 py-3 font-normal">Status</th>
                <th className="px-4 py-3 font-normal"></th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => {
                const m = campaignMetrics(c)
                return (
                  <tr key={c.id} onClick={() => onOpenCampaign(c.id)}
                    className="border-b border-mist/60 last:border-0 hover:bg-surface cursor-pointer transition-colors">
                    <td className="px-4 py-2.5 font-medium text-ink max-w-[220px] truncate">{c.name}</td>
                    <td className="px-3 py-2.5 text-body">{c.brand}</td>
                    <td className="px-3 py-2.5 text-body font-mono">{c.market}</td>
                    <td className="px-3 py-2.5 text-body font-mono whitespace-nowrap">{formatDate(c.posting_deadline)}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-body">{c.sessionCount || '—'}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-body">{m.total || '—'}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-sage">{m.posted || '—'}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-rose/80">{m.overdue || '—'}</td>
                    <td className="px-3 py-2.5 text-right font-mono text-body">{m.total ? `${m.fulfilled}%` : '—'}</td>
                    <td className="px-3 py-2.5">
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                        c.status === 'active' ? 'bg-sage/10 text-sage' : 'bg-ink/5 text-faint'}`}>{c.status}</span>
                    </td>
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <span onClick={(e) => e.stopPropagation()}><OpenSheetButton url={c.sheet_url} /></span>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map((c) => {
            const total = Object.values(c.counts).reduce((a, b) => a + b, 0)
            return (
              <div key={c.id}
                className="border border-card-edge rounded-[14px] px-5 py-4 bg-white hover:border-[#D6CEBD] transition-all">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <p className="font-semibold text-[14px] text-ink truncate">{c.name}</p>
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
                        c.status === 'active' ? 'bg-sage/10 text-sage' : 'bg-ink/5 text-faint'
                      }`}>{c.status}</span>
                    </div>
                    <p className="text-[11px] text-faint font-mono">
                      {[
                        c.brand,
                        c.market,
                        c.campaign_type,
                        c.posting_deadline && `deadline ${formatDate(c.posting_deadline)}`,
                        `${c.sessionCount || 0} session${c.sessionCount === 1 ? '' : 's'}`,
                      ].filter(Boolean).join(' · ')}
                    </p>
                    <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-2">
                      {total === 0 && <span className="text-[11px] font-mono text-faint">no KOLs attached</span>}
                      {COUNT_ORDER.map(({ key, label, cls }) => (
                        c.counts[key] ? (
                          <span key={key} className={`text-[11px] font-mono ${cls}`}>{c.counts[key]} {label}</span>
                        ) : null
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <OpenSheetButton url={c.sheet_url} size="lg" />
                    <button onClick={() => onOpenCampaign(c.id)}
                      className="flex items-center gap-1.5 px-4 py-2 bg-ink text-white rounded-[10px] text-[13px] hover:bg-ink/80 transition-all">
                      Open <ArrowRight size={13} />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
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
    </div>
  )
}

// Local mirror of the supabase-null guard the other pages inline. Keeps the
// "local dev without Supabase" path from throwing before load() short-circuits.
function supabaseConfigured() {
  return Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY)
}
