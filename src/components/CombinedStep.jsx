import { useState, useEffect, useRef } from 'react'
import { CheckCircle2, Pencil, Upload, FileSpreadsheet, X } from 'lucide-react'
import CampaignPicker from './CampaignPicker'
import StepProgress from './core/StepProgress'
import { TextEffect } from './core/text-effect'
import { getCampaign } from '../lib/campaigns'

// Step 1 — "Run a campaign". A run belongs to a campaign, and the campaign
// already holds everything (audience / keywords / brief / location + the
// Instagram/Threads scrape targets), edited on the campaign detail page. So this
// screen is just: pick a campaign → read-only summary → run (scrape the
// campaign's targets, or upload an export). Max results is the one per-run knob.

const RESULT_LIMITS = [100, 200, 500, 1000]

function Toks({ text }) {
  const parts = String(text || '').split(/[\n,]+/).map((s) => s.trim()).filter(Boolean)
  if (!parts.length) return <span className="text-faint">—</span>
  return <div className="flex flex-wrap gap-1.5">{parts.map((p, i) => <span key={i} className="tag">{p}</span>)}</div>
}

function KV({ label, children, wide }) {
  return (
    <div className={wide ? 'sm:col-span-2' : ''}>
      <p className="font-mono text-[9px] tracking-[.1em] uppercase text-faint mb-1">{label}</p>
      <div className="text-[13px] text-ink">{children ?? <span className="text-faint">—</span>}</div>
    </div>
  )
}

export default function CombinedStep({
  activeCampaign, onSelectCampaign, onNewCampaign, onEditCampaign, onRunCampaign, onViewResults,
}) {
  const s1 = activeCampaign?.default_step1 || {}
  const s2 = activeCampaign?.default_step2 || {}
  const [dataMode, setDataMode] = useState('scrape') // 'scrape' | 'upload'
  const [limit, setLimit] = useState(s1.resultsLimit || 200)
  const [files, setFiles] = useState([])
  const fileRef = useRef(null)

  // Reset the per-run knobs whenever the active campaign changes.
  useEffect(() => {
    setLimit(activeCampaign?.default_step1?.resultsLimit || 200)
    setDataMode('scrape')
    setFiles([])
  }, [activeCampaign?.id])

  // Refetch the campaign by id so the summary reflects the latest saved config
  // (it may have been edited on the detail page since it was picked/created).
  useEffect(() => {
    if (!activeCampaign?.id) return
    getCampaign(activeCampaign.id)
      .then((c) => { onSelectCampaign(c || null) }) // null → campaign was deleted; fall back to picker
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCampaign?.id])

  const igOn = !!s1.platforms?.instagram
  const thOn = !!s1.platforms?.threads
  const platformLabel = [igOn && 'Instagram', thOn && 'Threads'].filter(Boolean).join(' · ') || '—'
  const hasTargets = (igOn && String(s1.scrapeInput || '').trim()) || (thOn && (String(s1.painpointInput || '').trim() || String(s1.genreInput || '').trim()))

  const addFiles = (incoming) => {
    const valid = Array.from(incoming).filter((f) => f.name.endsWith('.xlsx'))
    setFiles((prev) => {
      const names = new Set(prev.map((f) => f.name))
      return [...prev, ...valid.filter((f) => !names.has(f.name))]
    })
  }

  const canRun = dataMode === 'upload' ? files.length > 0 : hasTargets
  const run = () => {
    if (!canRun) return
    onRunCampaign({ mode: dataMode, files, resultsLimit: limit })
  }

  return (
    <div className="px-8 py-8">
      <div className="max-w-[1000px] mx-auto">
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
            Run a campaign
          </TextEffect>
          <p className="text-muted text-[14px] anim-rise anim-d2">
            Pick a campaign — its audience, keywords, brief and scrape targets are already set on it. Then run.
          </p>
        </div>

        {/* No campaign yet → the picker leads. */}
        {!activeCampaign ? (
          <div className="anim-rise anim-d3">
            <CampaignPicker onPick={onSelectCampaign} onCreated={onNewCampaign} />
          </div>
        ) : (
          <>
            {/* Active campaign banner */}
            <div className="mb-6 px-4 py-3 bg-sage/8 border border-sage/25 rounded-[12px] flex flex-wrap items-center gap-3 anim-rise anim-d3">
              <span className="w-6 h-6 rounded-full bg-sage text-white flex items-center justify-center flex-shrink-0">
                <CheckCircle2 size={14} />
              </span>
              <p className="text-[13px] text-body">
                Running: <span className="font-semibold text-ink">{activeCampaign.name}</span>
              </p>
              <button
                onClick={() => onSelectCampaign(null)}
                className="ml-auto text-[12px] text-faint hover:text-ink underline underline-offset-2"
              >
                Change campaign
              </button>
            </div>

            {/* Campaign summary (read-only; edit lives on the campaign) */}
            <div className="mb-6 px-5 py-4 bg-surface border border-card-edge rounded-[14px] anim-rise anim-d4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[14px] font-semibold text-ink">Campaign summary</h3>
                <button
                  onClick={() => onEditCampaign?.(activeCampaign.id)}
                  className="flex items-center gap-1.5 text-[12.5px] font-medium text-ink hover:text-accent transition-colors"
                >
                  <Pencil size={13} /> Edit campaign
                </button>
              </div>
              <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
                <KV label="Brand">{activeCampaign.brand}</KV>
                <KV label="Target location">{s2.locationTarget}</KV>
                <KV label="Target audience" wide>{s2.targetAudience}</KV>
                <KV label="In-niche keywords"><Toks text={s2.targetKeywords} /></KV>
                <KV label="Out-niche keywords"><Toks text={s2.excludeKeywords} /></KV>
              </div>
              <div className="mt-4 pt-4 border-t border-mist/70 grid sm:grid-cols-2 gap-x-6 gap-y-3">
                <KV label="Scrape — platforms">{platformLabel}</KV>
                <div />
                {igOn && <KV label="Instagram — targets" wide><Toks text={s1.scrapeInput} /></KV>}
                {thOn && <KV label="Threads — keywords" wide><Toks text={[s1.painpointInput, s1.genreInput].filter(Boolean).join('\n')} /></KV>}
              </div>
              {!hasTargets && (
                <p className="mt-3 text-[12px] text-rose-strong">
                  No scrape targets set yet — <button onClick={() => onEditCampaign?.(activeCampaign.id)} className="underline underline-offset-2">add Instagram/Threads targets on the campaign</button>, or upload an export below.
                </p>
              )}
            </div>

            {/* Run this session */}
            <div className="anim-rise anim-d5">
              <div className="flex items-center gap-3 mb-4">
                <span className="w-7 h-7 rounded-full bg-ink text-white flex items-center justify-center flex-shrink-0 text-[13px]">▶</span>
                <div>
                  <h2 className="text-[16px] font-semibold text-ink leading-tight">Run this session</h2>
                  <p className="text-[12px] text-faint">Scrapes the campaign's targets, then scores — nothing to fill in.</p>
                </div>
              </div>

              <div className="border border-card-edge rounded-[14px] bg-surface px-5 py-2 divide-y divide-mist/70">
                {/* Scrape option */}
                <label className="flex items-center gap-3 py-3.5 cursor-pointer">
                  <input type="radio" name="datasrc" checked={dataMode === 'scrape'} onChange={() => setDataMode('scrape')} className="w-4 h-4 accent-ink" />
                  <span className="text-[13.5px] text-body font-medium">Scrape using the campaign's targets</span>
                </label>
                {dataMode === 'scrape' && (
                  <div className="py-3.5 pl-7 flex items-center flex-wrap gap-2">
                    <span className="font-mono text-[10px] tracking-[.14em] text-faint uppercase">Max results this run</span>
                    {RESULT_LIMITS.map((n) => (
                      <button
                        key={n}
                        onClick={() => setLimit(n)}
                        className={`px-3 py-1 rounded-[8px] text-[12px] font-mono border transition-all ${
                          limit === n ? 'bg-ink text-white border-ink' : 'border-mist text-muted hover:border-ink/30'
                        }`}
                      >
                        {n}
                      </button>
                    ))}
                    <span className="text-[11px] text-faint ml-1">~${(limit * 0.005).toFixed(2)} per target</span>
                  </div>
                )}

                {/* Upload option */}
                <label className="flex items-center gap-3 py-3.5 cursor-pointer">
                  <input type="radio" name="datasrc" checked={dataMode === 'upload'} onChange={() => setDataMode('upload')} className="w-4 h-4 accent-ink" />
                  <span className="text-[13.5px] text-body">Upload an Apify export instead</span>
                </label>
                {dataMode === 'upload' && (
                  <div className="py-3.5 pl-7">
                    <div
                      onClick={() => fileRef.current?.click()}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files) }}
                      className="border-2 border-dashed border-[#DDD6C7] bg-[#FBF9F4] rounded-[14px] p-6 text-center cursor-pointer hover:border-ink/40 transition-all"
                    >
                      <Upload size={22} className="text-faint mx-auto mb-2" />
                      <p className="text-[13px] text-muted">Click or drag .xlsx files here</p>
                    </div>
                    <input ref={fileRef} type="file" accept=".xlsx" multiple className="hidden" onChange={(e) => addFiles(e.target.files)} />
                    {files.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {files.map((f) => (
                          <div key={f.name} className="flex items-center justify-between px-3 py-2 bg-white border border-card-edge rounded-[10px]">
                            <span className="flex items-center gap-2 min-w-0">
                              <FileSpreadsheet size={14} className="text-muted flex-shrink-0" />
                              <span className="font-mono text-[12px] text-body truncate">{f.name}</span>
                            </span>
                            <button onClick={() => setFiles((prev) => prev.filter((x) => x.name !== f.name))} className="text-faint hover:text-ink flex-shrink-0 ml-2">
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <button
                onClick={run}
                disabled={!canRun}
                className="w-full mt-6 py-3.5 rounded-[12px] font-semibold text-[15px] bg-ink text-white hover:bg-ink/80 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {dataMode === 'upload' ? 'Score the uploaded export' : 'Start scraping & scoring'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
