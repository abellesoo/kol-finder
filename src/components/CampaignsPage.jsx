import { useState, useEffect, useCallback, useRef } from 'react'
import { Loader2, RefreshCw, ArrowRight, Rocket, Plus, X, Upload } from 'lucide-react'
import { listCampaigns, createCampaign, parseTokens, getApprovedKolsForRun, attachKols } from '../lib/campaigns'
import ImportCampaignModal from './ImportCampaignModal'

const MARKETS = ['HK', 'TW', 'SG', 'MY', 'Other']
const CAMPAIGN_TYPES = ['gifted', 'paid', 'mixed']

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

function NewCampaignModal({ onClose, onCreated, initialName = '', seededCount = 0 }) {
  const [form, setForm] = useState({
    name: initialName, brand: '', market: 'HK', campaign_type: 'gifted',
    start_date: '', posting_deadline: '', hashtags: '', mention_handles: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !saving) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, saving])

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const submit = async () => {
    setError(null)
    if (!form.name.trim()) return setError('Campaign name is required')
    if (!form.brand.trim()) return setError('Brand is required')
    if (!form.posting_deadline) return setError('Posting deadline is required')
    if (form.start_date && form.start_date > form.posting_deadline) {
      return setError('Start date is after the posting deadline')
    }
    setSaving(true)
    try {
      const created = await createCampaign({
        name: form.name,
        brand: form.brand,
        market: form.market,
        campaign_type: form.campaign_type,
        start_date: form.start_date || null,
        posting_deadline: form.posting_deadline,
        hashtags: parseTokens(form.hashtags, 'hashtag'),
        mention_handles: parseTokens(form.mention_handles, 'handle'),
      })
      onCreated(created)
    } catch (e) {
      setError(e.message)
      setSaving(false)
    }
  }

  const inputCls = 'w-full px-3 py-2 border border-mist rounded-[10px] text-[13px] text-ink bg-white focus:outline-none focus:border-ink/40 transition-colors'
  const labelCls = 'block text-[10px] font-mono text-faint uppercase tracking-[.14em] mb-1.5'

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-[2px] px-4"
      onClick={() => !saving && onClose()}
    >
      <div
        className="w-full max-w-[520px] max-h-[88vh] overflow-y-auto bg-white rounded-[16px] shadow-xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-5">
          <div>
            <p className="font-mono text-[10px] tracking-[.16em] text-faint uppercase mb-1">New campaign</p>
            <h2 className="text-[18px] font-semibold text-ink">Create a seeding campaign</h2>
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
            <input className={inputCls} value={form.name} placeholder="LILYEVE TW Seeding Wave 2"
              onChange={(e) => set('name', e.target.value)} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Brand</label>
              <input className={inputCls} value={form.brand} placeholder="LILYEVE"
                onChange={(e) => set('brand', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Market</label>
              <select className={inputCls} value={form.market} onChange={(e) => set('market', e.target.value)}>
                {MARKETS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Type</label>
              <select className={inputCls} value={form.campaign_type} onChange={(e) => set('campaign_type', e.target.value)}>
                {CAMPAIGN_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Start date <span className="text-faint/60 normal-case">(optional)</span></label>
              <input type="date" className={inputCls} value={form.start_date} onChange={(e) => set('start_date', e.target.value)} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Posting deadline</label>
            <input type="date" className={inputCls} value={form.posting_deadline} onChange={(e) => set('posting_deadline', e.target.value)} />
            <p className="text-[11px] text-faint mt-1">Default deadline for every KOL. Can be overridden per-KOL later.</p>
          </div>
          <div>
            <label className={labelCls}>Mention handles <span className="text-faint/60 normal-case">— post detection signal</span></label>
            <input className={inputCls} value={form.mention_handles} placeholder="lilyeve_tw, markato.hk"
              onChange={(e) => set('mention_handles', e.target.value)} />
            <p className="text-[11px] text-faint mt-1">Comma or space separated. @ optional.</p>
          </div>
          <div>
            <label className={labelCls}>Hashtags <span className="text-faint/60 normal-case">— post detection signal</span></label>
            <input className={inputCls} value={form.hashtags} placeholder="lilyevexmarkato, kbeauty"
              onChange={(e) => set('hashtags', e.target.value)} />
            <p className="text-[11px] text-faint mt-1">Comma or space separated. # optional.</p>
          </div>
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
            {saving ? 'Creating…' : 'Create campaign'}
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
          <h1 className="text-[27px] font-bold tracking-[-0.02em] text-ink mb-1">
            {campaigns.length} {campaigns.length === 1 ? 'campaign' : 'campaigns'}
          </h1>
          <p className="text-[14px] text-muted">
            {active} active · seeding operations from shipped to posted.
          </p>
        </div>
        <div className="flex items-center gap-2">
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
                    {c.brand} · {c.market} · {c.campaign_type} · deadline {formatDate(c.posting_deadline)}
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
                <button onClick={() => onOpenCampaign(c.id)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-ink text-white rounded-[10px] text-[13px] hover:bg-ink/80 transition-all flex-shrink-0">
                  Open <ArrowRight size={13} />
                </button>
              </div>
            </div>
          )
        })}
      </div>

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
