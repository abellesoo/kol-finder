import { useState, useRef, useEffect, useCallback } from 'react'
import { CheckCircle2, Database, SlidersHorizontal, Save, Trash2, Loader2 } from 'lucide-react'
import UploadStep from './UploadStep'
import ConfigStep from './ConfigStep'
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
function TwoStepProgress({ current, onGoToResults }) {
  const steps = [
    { num: 1, label: 'Set up' },
    { num: 2, label: 'Results', onClick: onGoToResults },
  ]
  return (
    <div className="flex items-center mb-8">
      {steps.map((s, i) => {
        const clickable = Boolean(s.onClick) && s.num !== current
        return (
          <div key={s.num} className="flex items-center">
            <button
              type="button"
              onClick={clickable ? s.onClick : undefined}
              disabled={!clickable}
              title={clickable ? 'Back to your results' : undefined}
              className={`flex items-center gap-2 group ${clickable ? '' : 'cursor-default'}`}
            >
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-mono font-semibold flex-shrink-0 transition-colors ${
                s.num === current ? 'bg-accent text-white' : s.num < current ? 'bg-mist text-body' : 'bg-mist text-faint'
              } ${clickable ? 'group-hover:bg-ink group-hover:text-white' : ''}`}>{s.num}</span>
              <span className={`text-[12.5px] font-medium whitespace-nowrap transition-colors ${s.num === current ? 'text-ink' : 'text-faint'} ${clickable ? 'group-hover:text-ink' : ''}`}>{s.label}</span>
            </button>
            {i < steps.length - 1 && <div className="w-8 h-px bg-mist mx-3 flex-shrink-0" />}
          </div>
        )
      })}
    </div>
  )
}

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

// Shared, team-wide store of past run inputs, two levels deep. Picking a
// brand prefills only the brand fields (background / products); picking one
// of its saved runs prefills everything — scrape inputs and the full scoring
// form. Saving files the current inputs under the form's Brand name, as a run
// named in the text box ("Default" if left blank).
function DatabankBar({ configRef, scrapeSnapshotRef, onLoadStep1 }) {
  const [brands, setBrands] = useState([])
  const [brandId, setBrandId] = useState('')
  const [presetId, setPresetId] = useState('')
  const [runName, setRunName] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null) // { kind: 'ok' | 'err', text }

  useEffect(() => { loadDatabank().then(setBrands).catch(() => {}) }, [])

  const flash = (kind, text) => { setMsg({ kind, text }); setTimeout(() => setMsg(null), 3000) }
  const brand = brands.find((b) => b.id === brandId)

  const handleLoadBrand = (id) => {
    setBrandId(id)
    setPresetId('')
    const b = brands.find((x) => x.id === id)
    if (!b) return
    configRef.current?.applyConfig(brandToForm(b))
    const runs = b.presets?.length || 0
    flash('ok', runs > 0
      ? `Loaded ${b.name}'s brand info — pick a saved run for the rest`
      : `Loaded ${b.name}'s brand info`)
  }

  const handleLoadPreset = (id) => {
    setPresetId(id)
    const preset = brand?.presets?.find((p) => p.id === id)
    if (!preset) return
    configRef.current?.applyConfig(presetToForm(brand, preset))
    onLoadStep1(presetToScrape(preset))
    setRunName(preset.name)
    touchPreset(preset.id)
    flash('ok', `Loaded "${brand.name} · ${preset.name}" into both steps`)
  }

  const handleSave = async () => {
    setBusy(true)
    try {
      const step1 = scrapeSnapshotRef.current || {}
      const step2 = configRef.current?.getConfig() || {}
      const presetName = runName.trim() || 'Default'
      const next = await saveDatabankEntry({ presetName, step1, step2 })
      setBrands(next)
      const savedBrand = next.find((b) => b.name.toLowerCase() === (step2.brandName || '').trim().toLowerCase())
      const savedPreset = savedBrand?.presets?.find((p) => p.name.toLowerCase() === presetName.toLowerCase())
      if (savedBrand) setBrandId(savedBrand.id)
      if (savedPreset) setPresetId(savedPreset.id)
      flash('ok', `Saved "${savedBrand?.name} · ${presetName}"`)
    } catch (e) {
      flash('err', e.message)
    } finally {
      setBusy(false)
    }
  }

  const handleDeletePreset = async () => {
    const preset = brand?.presets?.find((p) => p.id === presetId)
    if (!preset || !window.confirm(`Delete run "${preset.name}" under ${brand.name}?`)) return
    setBusy(true)
    try {
      setBrands(await deletePreset(presetId))
      setPresetId('')
      flash('ok', 'Run deleted')
    } catch (e) {
      flash('err', e.message)
    } finally {
      setBusy(false)
    }
  }

  const handleDeleteBrand = async () => {
    if (!brand) return
    const runs = brand.presets?.length || 0
    const warning = runs > 0
      ? `Delete brand "${brand.name}" and its ${runs} saved run${runs > 1 ? 's' : ''}?`
      : `Delete brand "${brand.name}"?`
    if (!window.confirm(warning)) return
    setBusy(true)
    try {
      setBrands(await deleteBrand(brandId))
      setBrandId('')
      setPresetId('')
      flash('ok', 'Brand deleted')
    } catch (e) {
      flash('err', e.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mb-8 px-4 py-3 bg-surface border border-card-edge rounded-[12px] flex flex-wrap items-center gap-2">
      <span className="flex items-center gap-1.5 font-mono text-[10px] tracking-[.14em] text-faint uppercase flex-shrink-0">
        <Database size={13} /> Databank
      </span>
      {brands.length > 0 ? (
        <>
          <select
            value={brandId}
            onChange={(e) => handleLoadBrand(e.target.value)}
            className="px-2.5 py-1.5 border border-mist rounded-[8px] text-[12.5px] text-ink bg-white focus:outline-none focus:border-ink/30"
          >
            <option value="">Brand…</option>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          {brand && (
            <button type="button" onClick={handleDeleteBrand} title={`Delete brand "${brand.name}"`} className="text-faint hover:text-red-500 transition-colors">
              <Trash2 size={14} />
            </button>
          )}
          {brand && (brand.presets?.length > 0 ? (
            <>
              <select
                value={presetId}
                onChange={(e) => handleLoadPreset(e.target.value)}
                className="px-2.5 py-1.5 border border-mist rounded-[8px] text-[12.5px] text-ink bg-white focus:outline-none focus:border-ink/30"
              >
                <option value="">Saved run…</option>
                {brand.presets.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              {presetId && (
                <button type="button" onClick={handleDeletePreset} title="Delete selected run" className="text-faint hover:text-red-500 transition-colors">
                  <Trash2 size={14} />
                </button>
              )}
            </>
          ) : (
            <span className="text-[12px] text-faint">No saved runs for this brand yet.</span>
          ))}
        </>
      ) : (
        <span className="text-[12px] text-faint">Nothing saved yet — fill in your run and save it to reuse next time.</span>
      )}

      <div className="flex items-center gap-2 ml-auto">
        {msg && (
          <span className={`text-[11px] ${msg.kind === 'ok' ? 'text-sage' : 'text-rose'}`}>{msg.text}</span>
        )}
        <input
          value={runName}
          onChange={(e) => setRunName(e.target.value)}
          placeholder="Run name (e.g. campaign)"
          className="px-2.5 py-1.5 w-44 border border-mist rounded-[8px] text-[12.5px] text-ink bg-white focus:outline-none focus:border-ink/30"
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={busy}
          title="Files under the Brand name filled in the form"
          className="flex items-center gap-1.5 px-3 py-1.5 bg-ink text-white rounded-[8px] text-[12px] hover:bg-ink/80 transition-all disabled:opacity-50"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save inputs
        </button>
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

  return (
    <div className="px-8 py-8">
      <div className="max-w-[1240px] mx-auto">
        <TwoStepProgress current={1} onGoToResults={onViewResults} />
        <div className="mb-8">
          <h1 className="text-[34px] font-serif font-bold tracking-[0.02em] text-ink mb-2">Set up your run</h1>
          <p className="text-muted text-[14px]">
            Pick your data and tune the scoring — side by side. Score when you're ready.
          </p>
        </div>

        <DatabankBar
          configRef={configRef}
          scrapeSnapshotRef={scrapeSnapshotRef}
          onLoadStep1={setScrapePrefill}
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
          {/* Left column — data source */}
          <section className="lg:sticky lg:top-6">
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

          {/* Right column — scoring config (dimmed until data exists) */}
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
              onStart={onStart}
              embedded
            />
          </section>
        </div>
      </div>
    </div>
  )
}
