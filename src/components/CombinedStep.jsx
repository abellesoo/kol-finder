import { useState, useRef, useEffect, useCallback } from 'react'
import { CheckCircle2, Database, SlidersHorizontal, Save, Trash2, Loader2 } from 'lucide-react'
import UploadStep from './UploadStep'
import ConfigStep from './ConfigStep'
import { loadDatabank, saveDatabankEntry, deleteDatabankEntry } from '../lib/inputDatabank'

// Seeder set-up on one page: "Get Data" and "Configure" sit side by side instead
// of being two separate wizard steps. Left column is the data source (upload /
// scrape); once a dataset exists it collapses to a green summary. Right column is
// the scoring config — dimmed until data exists, then live. ConfigStep owns the
// single primary "Start scoring" button at the bottom of its column.
//
// A shared input databank sits across the top: load a saved brand/campaign to
// prefill BOTH steps, or save the current inputs for next time.
function TwoStepProgress({ current }) {
  const steps = [
    { num: 1, label: 'Set up' },
    { num: 2, label: 'Results' },
  ]
  return (
    <div className="flex items-center mb-8">
      {steps.map((s, i) => (
        <div key={s.num} className="flex items-center">
          <div className="flex items-center gap-2">
            <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-mono font-semibold flex-shrink-0 ${
              s.num === current ? 'bg-accent text-white' : s.num < current ? 'bg-mist text-body' : 'bg-mist text-faint'
            }`}>{s.num}</span>
            <span className={`text-[12.5px] font-medium whitespace-nowrap ${s.num === current ? 'text-ink' : 'text-faint'}`}>{s.label}</span>
          </div>
          {i < steps.length - 1 && <div className="w-8 h-px bg-mist mx-3 flex-shrink-0" />}
        </div>
      ))}
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

// Shared, team-wide store of past run inputs. Loading an entry prefills the
// scrape fields (step 1) and the full scoring form (step 2).
function DatabankBar({ configRef, scrapeSnapshotRef, onLoadStep1, currentBrandName }) {
  const [entries, setEntries] = useState([])
  const [selectedId, setSelectedId] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null) // { kind: 'ok' | 'err', text }

  useEffect(() => { loadDatabank().then(setEntries).catch(() => {}) }, [])

  const flash = (kind, text) => { setMsg({ kind, text }); setTimeout(() => setMsg(null), 3000) }

  const handleLoad = (id) => {
    setSelectedId(id)
    const entry = entries.find((e) => e.id === id)
    if (!entry) return
    configRef.current?.applyConfig(entry.step2 || {})
    onLoadStep1({ ...(entry.step1 || {}) })
    setName(entry.name)
    flash('ok', `Loaded "${entry.name}" into both steps`)
  }

  const handleSave = async () => {
    const entryName = name.trim() || currentBrandName?.() || ''
    if (!entryName) { flash('err', 'Name this entry first (usually the brand)'); return }
    setBusy(true)
    try {
      const step1 = scrapeSnapshotRef.current || {}
      const step2 = configRef.current?.getConfig() || {}
      const next = await saveDatabankEntry(entryName, { step1, step2 })
      setEntries(next)
      const saved = next.find((e) => e.name.toLowerCase() === entryName.toLowerCase())
      if (saved) setSelectedId(saved.id)
      flash('ok', `Saved "${entryName}" to the databank`)
    } catch (e) {
      flash('err', e.message)
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async () => {
    if (!selectedId) return
    const entry = entries.find((e) => e.id === selectedId)
    if (!entry || !window.confirm(`Delete "${entry.name}" from the databank?`)) return
    setBusy(true)
    try {
      setEntries(await deleteDatabankEntry(selectedId))
      setSelectedId('')
      flash('ok', 'Deleted')
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
      {entries.length > 0 ? (
        <select
          value={selectedId}
          onChange={(e) => handleLoad(e.target.value)}
          className="px-2.5 py-1.5 border border-mist rounded-[8px] text-[12.5px] text-ink bg-white focus:outline-none focus:border-ink/30"
        >
          <option value="">Load saved inputs…</option>
          {entries.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      ) : (
        <span className="text-[12px] text-faint">Nothing saved yet — fill in your run and save it to reuse next time.</span>
      )}
      {selectedId && (
        <button type="button" onClick={handleDelete} title="Delete selected entry" className="text-faint hover:text-red-500 transition-colors">
          <Trash2 size={14} />
        </button>
      )}

      <div className="flex items-center gap-2 ml-auto">
        {msg && (
          <span className={`text-[11px] ${msg.kind === 'ok' ? 'text-sage' : 'text-rose'}`}>{msg.text}</span>
        )}
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name (e.g. brand)"
          className="px-2.5 py-1.5 w-40 border border-mist rounded-[8px] text-[12.5px] text-ink bg-white focus:outline-none focus:border-ink/30"
        />
        <button
          type="button"
          onClick={handleSave}
          disabled={busy}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-ink text-white rounded-[8px] text-[12px] hover:bg-ink/80 transition-all disabled:opacity-50"
        >
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save inputs
        </button>
      </div>
    </div>
  )
}

export default function CombinedStep({ influencers, fileNames, onFiles, onScrapedItems, onStart }) {
  const hasData = influencers.length > 0
  const configRef = useRef(null)
  // Latest scrape inputs reported by UploadStep, kept in a ref so a snapshot
  // survives even after the step collapses (once data exists). A ref avoids
  // re-rendering the heavy config form on every keystroke.
  const scrapeSnapshotRef = useRef(null)
  const onScrapeChange = useCallback((s) => { scrapeSnapshotRef.current = s }, [])
  // Object pushed into UploadStep to prefill it when a databank entry loads.
  const [scrapePrefill, setScrapePrefill] = useState(null)
  const currentBrandName = useCallback(() => configRef.current?.getConfig()?.brandName || '', [])

  return (
    <div className="px-8 py-8">
      <div className="max-w-[1240px] mx-auto">
        <TwoStepProgress current={1} />
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
          currentBrandName={currentBrandName}
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
