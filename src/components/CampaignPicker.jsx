import { useState, useRef, useEffect } from 'react'
import { Rocket, Plus, Loader2 } from 'lucide-react'
import { listCampaigns, createCampaign, getOrCreateBrand } from '../lib/campaigns'
import { BRAND_CATALOG } from '../lib/brandCatalog'

// ── Step 1 campaign chooser ──────────────────────────────────────────────────
// A run belongs to a campaign. Pick an existing one (everything is already set on
// it — just run) or start a new one, which creates it and opens its page to set
// up. No config/scrape editing happens here.
//
// This reads the SAME flat listCampaigns() the Campaigns tab uses, so every
// campaign that exists there is runnable here — including brand-less ones created
// inline from the "Move to campaign" menu. (The old brand-nested query hid those,
// showing brands with "0 campaigns".)

function timeAgo(iso) {
  const t = Date.parse(iso || '')
  if (!t) return null
  const days = Math.floor((Date.now() - t) / 86400000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days}d ago`
  if (days < 35) return `${Math.floor(days / 7)}w ago`
  return new Date(t).toLocaleDateString('en', { month: 'short', year: 'numeric' })
}

// A campaign is "ready to run" once it has either scrape targets or a scoring
// config saved. Bare campaigns (created inline for grouping) can still be picked,
// but we hint that they need set-up first so a run doesn't dead-end.
function needsSetup(c) {
  const s1 = c.default_step1 || {}
  const s2 = c.default_step2 || {}
  const hasScrape = s1.scrapeInput || s1.painpointInput || s1.genreInput
  const hasConfig = s2.targetAudience || s2.targetKeywords || s2.locationTarget
  return !hasScrape && !hasConfig
}

export default function CampaignPicker({ onPick, onCreated }) {
  const [campaigns, setCampaigns] = useState([])
  const [loading, setLoading] = useState(true)
  const [mode, setMode] = useState('existing') // 'existing' | 'new'
  const [newName, setNewName] = useState('')
  const [newBrand, setNewBrand] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null) // { kind: 'ok' | 'err', text }
  const flashTimerRef = useRef(null)

  useEffect(() => {
    listCampaigns()
      .then(setCampaigns)
      .catch((e) => flash('err', e.message))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => () => clearTimeout(flashTimerRef.current), [])

  const flash = (kind, text) => {
    clearTimeout(flashTimerRef.current)
    setMsg({ kind, text })
    flashTimerRef.current = setTimeout(() => setMsg(null), 3500)
  }

  const handleCreate = async () => {
    const name = newName.trim()
    const brandName = newBrand.trim()
    if (!name) { flash('err', 'Give the campaign a name'); return }
    if (!brandName) { flash('err', 'Pick a brand'); return }
    setBusy(true)
    try {
      const brand = await getOrCreateBrand(brandName)
      const campaign = await createCampaign({ name, brand: brand.name, brand_id: brand.id })
      onCreated(campaign)
    } catch (e) {
      flash('err', e.message)
    } finally {
      setBusy(false)
    }
  }

  const label = (
    <span className="flex items-center gap-1.5 font-mono text-[10px] tracking-[.14em] text-faint uppercase flex-shrink-0">
      <Rocket size={13} /> Campaign
    </span>
  )
  const msgEl = msg && (
    <span role="status" aria-live="polite"
      className={`text-[11px] anim-rise ${msg.kind === 'ok' ? 'text-sage' : 'text-rose-strong'}`}>
      {msg.text}
    </span>
  )

  return (
    <div className="px-5 py-4 bg-surface border border-card-edge rounded-[14px]">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        {label}
        <div className="inline-flex bg-white border border-card-edge rounded-[10px] p-[3px]">
          {[
            { id: 'existing', label: 'Choose an existing campaign' },
            { id: 'new', label: 'Start a new campaign' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setMode(t.id)}
              className={`text-[12.5px] px-3.5 py-1.5 rounded-[8px] transition-colors ${
                mode === t.id ? 'bg-ink text-white font-medium' : 'text-body hover:text-ink'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="ml-auto">{msgEl}</div>
      </div>

      {/* Existing */}
      {mode === 'existing' && (
        loading ? (
          <div className="flex items-center gap-2 text-faint py-6">
            <Loader2 size={14} className="animate-spin" /> <span className="text-[13px]">Loading campaigns…</span>
          </div>
        ) : campaigns.length === 0 ? (
          <p className="text-[13px] text-body">
            No campaigns yet —{' '}
            <button type="button" onClick={() => setMode('new')} className="underline underline-offset-2 hover:text-ink">
              start a new one
            </button>.
          </p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {campaigns.map((c) => {
              const setup = needsSetup(c)
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onPick(c)}
                  className="text-left px-4 py-3 rounded-[12px] border border-card-edge bg-white transition-all hover:border-ink/40 hover:shadow-sm"
                >
                  <p className="text-[13.5px] font-semibold text-ink truncate">{c.name}</p>
                  <p className="text-[11.5px] text-faint truncate mt-0.5">{c.brand || 'No brand set'}</p>
                  <p className="font-mono text-[10px] text-faint mt-2 flex items-center gap-1.5 flex-wrap">
                    {c.sessionCount > 0 && <span>{c.sessionCount} run{c.sessionCount === 1 ? '' : 's'}</span>}
                    {timeAgo(c.created_at) && <span>· {timeAgo(c.created_at)}</span>}
                    {setup && <span className="text-rose-strong">· needs set-up</span>}
                  </p>
                </button>
              )
            })}
          </div>
        )
      )}

      {/* New */}
      {mode === 'new' && (
        <div>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_240px_auto] gap-3 items-end">
            <div>
              <label className="block text-[11px] text-muted mb-1 font-medium">Campaign name</label>
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. HK Autumn Repair"
                className="w-full text-[13px] px-3 py-2.5 border border-card-edge rounded-[9px] bg-white focus:outline-none focus:border-ink/30"
              />
            </div>
            <div>
              <label className="block text-[11px] text-muted mb-1 font-medium">Brand</label>
              <select
                value={newBrand}
                onChange={(e) => setNewBrand(e.target.value)}
                className="w-full text-[13px] px-3 py-2.5 border border-card-edge rounded-[9px] bg-white focus:outline-none focus:border-ink/30"
              >
                <option value="">Select a brand…</option>
                {BRAND_CATALOG.map((b) => <option key={b.id} value={b.name}>{b.name}</option>)}
              </select>
            </div>
            <button
              type="button"
              onClick={handleCreate}
              disabled={busy}
              className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-ink text-white rounded-[10px] text-[13px] font-semibold hover:bg-ink/80 transition-colors disabled:opacity-40"
            >
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Create & set up
            </button>
          </div>
          <p className="text-[11.5px] text-faint mt-2.5">
            Creating a campaign opens its page, where you set the audience, in/out-niche keywords, brief, location and the
            Instagram/Threads scrape targets — once. After that, just pick it here and run.
          </p>
        </div>
      )}
    </div>
  )
}
