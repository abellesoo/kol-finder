import { useState, useRef, useEffect, useCallback } from 'react'
import { CheckCircle2, ChevronRight, Database, SlidersHorizontal, Trash2, X } from 'lucide-react'
import UploadStep from './UploadStep'
import ConfigStep from './ConfigStep'
import StepProgress from './core/StepProgress'
import { TextEffect } from './core/text-effect'
import {
  loadDatabank, saveDatabankEntry, deleteBrand, deletePreset,
  brandToForm, presetToForm, presetToScrape, touchPreset,
} from '../lib/inputDatabank'

// Seeder set-up on one page: "Get Data" and "Configure" sit side by side instead
// of being two separate wizard steps. Left column is the data source (upload /
// scrape); once a dataset exists it collapses to a green summary. Right column is
// the scoring config — dimmed until data exists, then live. ConfigStep owns the
// single primary "Start scoring" button at the bottom of its column.
//
// A shared input databank sits across the top: load a saved brand/campaign to
// prefill BOTH steps, or save the current inputs for next time.

function ZoneHeader({ icon: Icon, title, hint, done }) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <span className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${done ? 'bg-sage/15 text-sage' : 'bg-ink text-white'}`}>
        {done ? <CheckCircle2 size={16} /> : <Icon size={15} />}
      </span>
      <div>
        <h2 className="text-[16px] font-semibold text-ink leading-tight">{title}</h2>
        {hint && <p className="text-[12px] text-faint">{hint}</p>}
      </div>
    </div>
  )
}

// Relative "last used" label for launcher cards and run chips.
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

// Shared, team-wide store of past run inputs, presented as a "start from"
// launcher: while there's no dataset yet it leads the page with one card per
// brand — picking a card prefills the brand info (background / products) and
// reveals its saved runs; picking a run prefills everything, scrape inputs
// included, and the launcher collapses to a thin browse strip. There is no
// manual save: CombinedStep files the inputs here automatically (under the
// session name) whenever a scoring run starts.
function DatabankLauncher({ configRef, onLoadStep1, hasData }) {
  const [brands, setBrands] = useState([])
  const [activeBrandId, setActiveBrandId] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null) // { kind: 'ok' | 'err', text }
  const flashTimerRef = useRef(null)
  // null = automatic (open while there's no dataset yet); boolean = user choice.
  const [userOpen, setUserOpen] = useState(null)

  useEffect(() => { loadDatabank().then(setBrands).catch(() => {}) }, [])
  useEffect(() => () => clearTimeout(flashTimerRef.current), [])

  // Clear the previous timer so a rapid second message gets its full 3 seconds
  // instead of being wiped by the first message's stale timeout.
  const flash = (kind, text) => {
    clearTimeout(flashTimerRef.current)
    setMsg({ kind, text })
    flashTimerRef.current = setTimeout(() => setMsg(null), 3000)
  }

  const open = brands.length > 0 && (userOpen ?? !hasData)
  const activeBrand = brands.find((b) => b.id === activeBrandId)

  const handlePickBrand = (b) => {
    if (b.id === activeBrandId) { setActiveBrandId(''); return }
    setActiveBrandId(b.id)
    configRef.current?.applyConfig(brandToForm(b))
    flash('ok', b.presets?.length > 0
      ? `${b.name}'s brand info loaded — pick a run below for the rest`
      : `${b.name}'s brand info loaded`)
  }

  const handlePickRun = (preset) => {
    configRef.current?.applyConfig(presetToForm(activeBrand, preset))
    onLoadStep1(presetToScrape(preset))
    touchPreset(preset.id)
    setUserOpen(false)
    flash('ok', `Loaded "${activeBrand.name} · ${preset.name}" into both steps`)
  }

  const handleDeleteRun = async (preset) => {
    if (!window.confirm(`Delete run "${preset.name}" under ${activeBrand?.name}? The brand stays.`)) return
    setBusy(true)
    try {
      setBrands(await deletePreset(preset.id))
      flash('ok', 'Run deleted')
    } catch (e) {
      flash('err', e.message)
    } finally {
      setBusy(false)
    }
  }

  const handleDeleteBrand = async () => {
    if (!activeBrand) return
    const runs = activeBrand.presets?.length || 0
    const warning = runs > 0
      ? `Delete brand "${activeBrand.name}" and its ${runs} saved run${runs > 1 ? 's' : ''}?`
      : `Delete brand "${activeBrand.name}"?`
    if (!window.confirm(warning)) return
    setBusy(true)
    try {
      setBrands(await deleteBrand(activeBrandId))
      setActiveBrandId('')
      flash('ok', 'Brand deleted')
    } catch (e) {
      flash('err', e.message)
    } finally {
      setBusy(false)
    }
  }

  const label = (
    <span className="flex items-center gap-1.5 font-mono text-[10px] tracking-[.14em] text-faint uppercase flex-shrink-0">
      <Database size={13} /> Databank
    </span>
  )
  const msgEl = msg && (
    <span
      role="status"
      aria-live="polite"
      className={`text-[11px] anim-rise ${msg.kind === 'ok' ? 'text-sage' : 'text-rose-strong'}`}
    >
      {msg.text}
    </span>
  )

  // ── Open: the launcher leads the page ──
  if (open) {
    return (
      <div className="mb-8 px-5 py-4 bg-surface border border-card-edge rounded-[14px]">
        <div className="flex flex-wrap items-center gap-3 mb-3">
          {label}
          <p className="text-[13px] text-body">Start from a saved brand — or skip and fill everything in fresh.</p>
          <div className="flex items-center gap-3 ml-auto">
            {msgEl}
            <button
              type="button"
              onClick={() => setUserOpen(false)}
              className="flex items-center gap-1 text-[12px] text-faint hover:text-ink transition-colors"
            >
              <X size={13} /> Start blank
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {brands.map((b) => {
            const active = b.id === activeBrandId
            const runs = b.presets?.length || 0
            const used = timeAgo(b.presets?.[0]?.last_used_at || b.presets?.[0]?.updated_at || b.updated_at)
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => handlePickBrand(b)}
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
                  {runs} run{runs === 1 ? '' : 's'}{used ? ` · ${used}` : ''}
                </p>
              </button>
            )
          })}
        </div>

        {activeBrand && (
          <div className="mt-4 pt-3 border-t border-mist/70">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <p className="text-[12.5px] text-body">
                Brand info loaded. Pick a saved run to fill the scrape inputs + scoring form too:
              </p>
              <button
                type="button"
                onClick={handleDeleteBrand}
                disabled={busy}
                title={`Delete brand "${activeBrand.name}" and all its saved runs`}
                aria-label={`Delete brand "${activeBrand.name}" and all its saved runs`}
                className="ml-auto p-2 -my-1 rounded-[8px] text-faint hover:text-rose-strong hover:bg-rose-strong/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-rose-strong/60 transition-colors"
              >
                <Trash2 size={14} />
              </button>
            </div>
            {activeBrand.presets?.length > 0 ? (
              <div className="flex flex-wrap items-center gap-2">
                {activeBrand.presets.map((p) => (
                  <span key={p.id} className="flex items-center bg-white border border-card-edge rounded-[9px] pl-3 pr-1 py-1">
                    <button
                      type="button"
                      onClick={() => handlePickRun(p)}
                      className="text-[12.5px] text-ink hover:text-accent transition-colors"
                    >
                      {p.name}
                      {timeAgo(p.last_used_at || p.updated_at) && (
                        <span className="font-mono text-[10px] text-faint ml-1.5">{timeAgo(p.last_used_at || p.updated_at)}</span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteRun(p)}
                      disabled={busy}
                      title={`Delete run "${p.name}" (the brand stays)`}
                      aria-label={`Delete run "${p.name}" — the brand stays`}
                      className="p-1.5 ml-0.5 rounded-[6px] text-faint hover:text-rose-strong hover:bg-rose-strong/10 transition-colors"
                    >
                      <Trash2 size={12} />
                    </button>
                  </span>
                ))}
                <button
                  type="button"
                  onClick={() => setUserOpen(false)}
                  className="text-[12px] text-faint hover:text-ink underline underline-offset-2 ml-1"
                >
                  use brand info only →
                </button>
              </div>
            ) : (
              <p className="text-[12px] text-body">
                No saved runs for this brand yet —{' '}
                <button
                  type="button"
                  onClick={() => setUserOpen(false)}
                  className="underline underline-offset-2 hover:text-ink transition-colors"
                >
                  continue with brand info only →
                </button>
              </p>
            )}
          </div>
        )}
      </div>
    )
  }

  // ── Collapsed: a thin browse strip. Saving is automatic on score. ──
  return (
    <div className="mb-8 px-4 py-3 bg-surface border border-card-edge rounded-[12px] flex flex-wrap items-center gap-2">
      {label}
      {brands.length > 0 ? (
        <button
          type="button"
          onClick={() => setUserOpen(true)}
          className="flex items-center gap-1 text-[12.5px] text-body hover:text-ink transition-colors"
        >
          Browse {brands.length} saved brand{brands.length > 1 ? 's' : ''} <ChevronRight size={13} />
        </button>
      ) : (
        <span className="text-[12px] text-body">Nothing saved yet — your inputs file themselves here when you score.</span>
      )}
      <div className="flex items-center gap-2 ml-auto">
        {msgEl}
        {brands.length > 0 && (
          <span className="text-[11px] text-faint">Inputs save automatically when you score</span>
        )}
      </div>
    </div>
  )
}

export default function CombinedStep({ influencers, fileNames, onFiles, onScrapedItems, onStart, onViewResults }) {
  const hasData = influencers.length > 0
  const configRef = useRef(null)
  // Latest scrape inputs reported by UploadStep, kept in a ref so a snapshot
  // survives even after the step collapses (once data exists). A ref avoids
  // re-rendering the heavy config form on every keystroke.
  const scrapeSnapshotRef = useRef(null)
  const onScrapeChange = useCallback((s) => { scrapeSnapshotRef.current = s }, [])
  // Object pushed into UploadStep to prefill it when a databank entry loads.
  const [scrapePrefill, setScrapePrefill] = useState(null)

  // Scoring is the moment the inputs are final, so file them in the databank
  // automatically, keyed by the session name — this is the only way runs get
  // saved (there is no manual save button). Fire-and-forget: a save failure
  // (offline, no Supabase) must never block scoring. Skipped when the brief
  // has no brand line, since the databank files everything by brand.
  const handleStart = useCallback((cfg) => {
    const step2 = configRef.current?.getConfig() || {}
    if (String(step2.brandName || '').trim()) {
      saveDatabankEntry({
        presetName: cfg.sessionTitle || 'Default',
        step1: scrapeSnapshotRef.current || {},
        step2,
      }).catch((e) => console.error('Databank auto-save failed', e))
    }
    onStart(cfg)
  }, [onStart])

  return (
    <div className="px-8 py-8">
      <div className="max-w-[1240px] mx-auto">
        <StepProgress
          current={1}
          className="mb-8"
          steps={[
            { num: 1, label: 'Set up' },
            { num: 2, label: 'Results', onClick: onViewResults, hint: 'Back to your results — nothing is lost' },
          ]}
        />
        <div className="mb-8">
          <TextEffect
            as="h1"
            per="word"
            preset="slide"
            duration={0.3}
            staggerDelay={0.06}
            className="text-[34px] font-serif font-bold tracking-[0.02em] text-ink mb-2"
          >
            Set up your run
          </TextEffect>
          <p className="text-muted text-[14px] anim-rise anim-d2">
            Pick your data and tune the scoring — side by side. Score when you're ready.
          </p>
        </div>

        <div className="anim-rise anim-d3">
          <DatabankLauncher
            configRef={configRef}
            onLoadStep1={setScrapePrefill}
            hasData={hasData}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          {/* Left column — data source */}
          <section className="lg:sticky lg:top-6 anim-rise anim-d4">
            <ZoneHeader
              icon={Database}
              title="Your data"
              hint="Upload an Apify export or start a fresh scrape"
              done={hasData}
            />
            {hasData ? (
              <div className="flex items-center justify-between px-4 py-3 bg-sage/8 border border-sage/25 rounded-[12px]">
                <p className="text-[13px] text-body">
                  <span className="font-mono font-semibold text-ink">{influencers.length}</span> unique accounts ready
                  {fileNames.length > 0 && (
                    <span className="text-faint"> · {fileNames.length === 1 ? fileNames[0] : `${fileNames.length} sources`}</span>
                  )}
                </p>
                <button
                  onClick={() => onFiles([])}
                  className="text-[12px] text-faint hover:text-ink underline underline-offset-2 flex-shrink-0 ml-3"
                >
                  Change
                </button>
              </div>
            ) : (
              <UploadStep
                onFiles={onFiles}
                onScrapedItems={onScrapedItems}
                embedded
                initialScrape={scrapePrefill}
                onScrapeChange={onScrapeChange}
              />
            )}
          </section>

          {/* Right column — scoring config (dimmed until data exists). The
              entrance animation lives on a wrapper: riseIn's fill-mode would
              otherwise pin opacity at 1 and defeat the conditional dimming. */}
          <div className="anim-rise anim-d5">
            <section className={hasData ? '' : 'opacity-45 pointer-events-none select-none'}>
              <ZoneHeader
                icon={SlidersHorizontal}
                title="Configure scoring"
                hint={hasData ? 'Tune how accounts are ranked, then score' : 'Unlocks once you add data on the left'}
              />
              <ConfigStep
                ref={configRef}
                fileNames={fileNames}
                influencerCount={influencers.length}
                onStart={handleStart}
                embedded
              />
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
