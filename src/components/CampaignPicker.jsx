import { useState, useRef, useEffect } from 'react'
import { Rocket, Plus } from 'lucide-react'
import { loadCampaignsByBrand, createCampaign, getOrCreateBrand } from '../lib/campaigns'
import { BRAND_CATALOG } from '../lib/brandCatalog'

// ── Step 1 campaign chooser ──────────────────────────────────────────────────
// A run belongs to a campaign. Pick an existing one (everything is already set on
// it — just run) or start a new one, which creates it and opens its page to set
// up. No config/scrape editing happens here.

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

export default function CampaignPicker({ onPick, onCreated }) {
  const [brands, setBrands] = useState([])
  const [mode, setMode] = useState('existing') // 'existing' | 'new'
  const [activeBrandId, setActiveBrandId] = useState('')
  const [newName, setNewName] = useState('')
  const [newBrand, setNewBrand] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null) // { kind: 'ok' | 'err', text }
  const flashTimerRef = useRef(null)

  useEffect(() => { loadCampaignsByBrand().then(setBrands).catch(() => {}) }, [])
  useEffect(() => () => clearTimeout(flashTimerRef.current), [])

  const flash = (kind, text) => {
    clearTimeout(flashTimerRef.current)
    setMsg({ kind, text })
    flashTimerRef.current = setTimeout(() => setMsg(null), 3500)
  }

  const activeBrand = brands.find((b) => b.id === activeBrandId)

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
        brands.length === 0 ? (
          <p className="text-[13px] text-body">
            No campaigns yet —{' '}
            <button type="button" onClick={() => setMode('new')} className="underline underline-offset-2 hover:text-ink">
              start a new one
            </button>.
          </p>
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {brands.map((b) => {
                const active = b.id === activeBrandId
                const n = b.campaigns?.length || 0
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setActiveBrandId((cur) => (cur === b.id ? '' : b.id))}
                    aria-pressed={active}
                    className={`text-left px-4 py-3 rounded-[12px] border bg-white transition-all hover:shadow-sm ${
                      active ? 'border-ink ring-1 ring-ink/50' : 'border-card-edge hover:border-ink/40'
                    }`}
                  >
                    <p className="text-[13.5px] font-semibold text-ink truncate">{b.name}</p>
                    <p className="text-[11.5px] text-faint leading-snug line-clamp-2 min-h-[2.5em] mt-0.5">
                      {b.background || 'No background saved'}
                    </p>
                    <p className="font-mono text-[10px] text-faint mt-2">
                      {n} campaign{n === 1 ? '' : 's'}
                    </p>
                  </button>
                )
              })}
            </div>

            {activeBrand && (
              <div className="mt-4 pt-3 border-t border-mist/70">
                {activeBrand.campaigns?.length > 0 ? (
                  <>
                    <p className="text-[12.5px] text-body mb-2">Pick a campaign under {activeBrand.name} to run:</p>
                    <div className="flex flex-wrap items-center gap-2">
                      {activeBrand.campaigns.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => onPick(c)}
                          className="flex items-center bg-white border border-card-edge rounded-[9px] px-3 py-1.5 text-[12.5px] text-ink hover:border-ink transition-colors"
                        >
                          {c.name}
                          {timeAgo(c.created_at) && (
                            <span className="font-mono text-[10px] text-faint ml-1.5">{timeAgo(c.created_at)}</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className="text-[12px] text-body">
                    {activeBrand.name} has no campaigns yet —{' '}
                    <button type="button" onClick={() => { setNewBrand(activeBrand.name); setMode('new') }} className="underline underline-offset-2 hover:text-ink">
                      start one under it →
                    </button>
                  </p>
                )}
              </div>
            )}
          </>
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
              <Plus size={15} /> Create & set up
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
