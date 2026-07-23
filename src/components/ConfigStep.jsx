import { useState, useRef, useEffect, forwardRef, useImperativeHandle } from 'react'
import { Settings, ChevronRight, Sparkles, Loader2, Save, Trash2, Check } from 'lucide-react'
import { parseBrief } from '../lib/apifyApi'
import { loadPresets, savePreset, deletePreset } from '../lib/configPresets'
import { SCORING_PROFILES } from '../lib/scoreInfluencers'
import { BRAND_CATALOG, getBrand } from '../lib/brandCatalog'

// Portfolio-tailored niches — the verticals our 10 brands actually occupy (see
// brandCatalog.js). Each id must equal the first word of its label (minus emoji)
// so scoreRelevancy can match it back to NICHE_KEYWORDS.
const NICHE_OPTIONS = [
  { id: 'skincare', label: '🧴 Skincare' },
  { id: 'haircare', label: '💇 Haircare' },
  { id: 'bodycare', label: '🛁 Bodycare' },
  { id: 'makeup', label: '💄 Makeup' },
  { id: 'personal', label: '🧼 Personal care' },
  { id: 'supplements', label: '💊 Supplements' },
  { id: 'sports', label: '🏃 Sports' },
  { id: 'feminine', label: '🌸 Feminine wellness' },
]

// Suggest a scoring profile from the picked niches: ingestible + feminine
// wellness are the niche-critical verticals that need the relevancy-protected
// blend; topical beauty is engagement-first. Fallback only — the brand pick
// normally sets the formula directly, and the operator can always override.
function suggestProfile(nicheIds) {
  return nicheIds.some((id) => id === 'supplements' || id === 'feminine') ? 'health' : 'beauty'
}

const BRIEF_GUIDE = `Campaign Brief 點用
─────────────────────
DM 入面所有品牌／產品資料都只會用呢個箱入面嘅內容——DeepSeek 唔會自己作成分或數字。AI 相關度評分都會參考呢份 brief。

・成個 brief 一個箱搞掂：WhatsApp／文件直接貼落嚟，撳「自動整理」，DeepSeek 會執成統一格式（品牌／品牌背景／新品／合作形式／產品詳情）。
・自我介紹會自動變成「我係 [品牌] 嘅 Marketing」，唔使自己寫。
・開場係固定一句「你嘅 content style 好啱我哋品牌」，唔會逐個 KOL 個人化——一個 campaign 出一封 DM，approve 之後大家共用。
・呢步可以留空——去到 Review 頁出 DM 之前都仲可以補返。

三個提示：
1. 賣點冇寫就唔會出現喺 DM（防止作大成分／功效）。
2. 美白／醫美級字眼照官方 listing 原文寫，唔好自己加大——香港《商品說明條例》有風險。
3. 想儲入 Databank 就要有「品牌：」一行（自動整理會幫你加）。`

// Assemble structured brief fields into the labelled text the DM prompt
// expects. Empty fields are dropped so a half-filled brief stays clean.
// Selling points are one per line; each gets a ・ bullet (any existing bullet
// char is stripped first).
function assembleBrief(f) {
  const lines = []
  if ((f.brandName || '').trim()) lines.push(`品牌：${f.brandName.trim()}`)
  if ((f.brandBackground || '').trim()) lines.push(`品牌背景：${f.brandBackground.trim()}`)
  if ((f.newProduct || '').trim()) lines.push(`新品：${f.newProduct.trim()}`)
  if ((f.collabFormat || '').trim()) lines.push(`合作形式：${f.collabFormat.trim()}`)
  const blocks = (f.products || [])
    .filter((p) => (p.name || '').trim() || (p.points || '').trim())
    .map((p) => {
      const pts = (p.points || '')
        .split('\n')
        .map((s) => s.trim().replace(/^[・·•\-\s]+/, ''))
        .filter(Boolean)
        .map((s) => `・${s}`)
      return [`【${(p.name || '').trim()}】`, ...pts].join('\n')
    })
  if (blocks.length) {
    lines.push('產品詳情：')
    lines.push(blocks.join('\n'))
  }
  if ((f.briefNotes || '').trim()) lines.push(f.briefNotes.trim())
  return lines.join('\n')
}

// Inverse of assembleBrief: pull the structured fields back out of the
// labelled brief text. Presets and the brand databank still store this shape
// (the databank files entries by brand name), so the one-box UI stays
// compatible with both without touching their storage. Unlabelled lines fall
// through to briefNotes, so a freeform un-tidied brief loses nothing.
function briefToFields(text) {
  const f = { brandName: '', brandBackground: '', newProduct: '', collabFormat: '', products: [], briefNotes: '' }
  let inProducts = false
  let current = null
  const notes = []
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim()
    if (!line) continue
    let m
    if ((m = line.match(/^品牌[：:]\s*(.*)$/))) { f.brandName = m[1]; inProducts = false; continue }
    if ((m = line.match(/^品牌背景[：:]\s*(.*)$/))) { f.brandBackground = m[1]; inProducts = false; continue }
    if ((m = line.match(/^新品[：:]\s*(.*)$/))) { f.newProduct = m[1]; inProducts = false; continue }
    if ((m = line.match(/^合作形式[：:]\s*(.*)$/))) { f.collabFormat = m[1]; inProducts = false; continue }
    if (/^產品詳情[：:]?$/.test(line)) { inProducts = true; current = null; continue }
    if ((m = line.match(/^【(.+)】$/))) { current = { name: m[1], points: '' }; f.products.push(current); inProducts = true; continue }
    if (inProducts && current && /^[・·•\-]/.test(line)) {
      const pt = line.replace(/^[・·•\-\s]+/, '')
      current.points = current.points ? `${current.points}\n${pt}` : pt
      continue
    }
    notes.push(line)
  }
  f.briefNotes = notes.join('\n')
  if (!f.products.length) f.products = [{ name: '', points: '' }]
  return f
}

function StepProgress({ current }) {
  const steps = [
    { num: 1, label: 'Get Data' },
    { num: 2, label: 'Configure' },
    { num: 3, label: 'Results' },
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
          {i < steps.length - 1 && (
            <div className="w-8 h-px bg-mist mx-3 flex-shrink-0" />
          )}
        </div>
      ))}
    </div>
  )
}

// Normalize a brand name for matching a campaign's brand to a BRAND_CATALOG
// entry (handles casing + punctuation: "NE:AR" ↔ "near", "BB Lab" ↔ "BB LAB").
const normBrand = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')

function ConfigStep({ fileNames = [], influencerCount, onStart, embedded = false, lockedBrandName = '' }, ref) {
  const [sessionTitle, setSessionTitle] = useState('')
  // The operator picks a brand; the brand drives niches + scoring formula. Niches
  // are no longer hand-picked — they come from brandCatalog so the relevancy
  // scorer always rewards the right vertical for that brand.
  const [brandId, setBrandId] = useState('')
  const [niches, setNiches] = useState([])
  // Which scoring formula the run uses (see SCORING_PROFILES). Follows the niche
  // selection until the operator (or a brand pick) sets one explicitly.
  const [scoringProfile, setScoringProfile] = useState(() => suggestProfile([]))
  const profileTouched = useRef(false)
  useEffect(() => {
    if (!profileTouched.current) setScoringProfile(suggestProfile(niches))
  }, [niches])
  const chooseProfile = (id) => { profileTouched.current = true; setScoringProfile(id) }
  // Picking a brand sets its mapped niches and its default formula in one go.
  // The formula stays overridable afterward (chooseProfile pins the operator's
  // choice), so a brand is a starting point, not a lock.
  const chooseBrand = (id) => {
    setBrandId(id)
    const brand = getBrand(id)
    if (!brand) return
    setNiches(brand.niches)
    chooseProfile(brand.scoringProfile)
  }

  // When a campaign is active, its brand drives this step — so the brand picker
  // is hidden and we derive the catalog brand (niches + formula) from the
  // campaign's brand name. Only auto-picks when it differs from the current
  // brandId, so an existing campaign's own saved niches (set via applyConfig)
  // aren't clobbered by the catalog defaults.
  const lockedCatalogBrand = lockedBrandName
    ? BRAND_CATALOG.find((b) => normBrand(b.name) === normBrand(lockedBrandName)) || null
    : null
  const brandLocked = !!lockedCatalogBrand
  useEffect(() => {
    if (lockedCatalogBrand && brandId !== lockedCatalogBrand.id) chooseBrand(lockedCatalogBrand.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockedCatalogBrand?.id])
  // Per-campaign relevancy vocabulary. The six fixed niches can't express a
  // specific product (減脂 protein shake, etc.), so the operator types the
  // in-niche signals to reward and the wrong-vertical signals to penalise.
  // Both feed the rule engine (scoreRelevancy) and the AI scorer (criteria /
  // excludeNiches). targetAudience describes WHO the product is for.
  const [targetAudience, setTargetAudience] = useState('')
  const [targetKeywords, setTargetKeywords] = useState('')
  const [excludeKeywords, setExcludeKeywords] = useState('')
  const [locationTarget, setLocationTarget] = useState('Hong Kong')
  const [minEngagement, setMinEngagement] = useState(0)
  // The campaign brief is ONE freeform box. 自動整理 (handleTidyBrief) sends it
  // to DeepSeek and rewrites the box in the labelled format the DM prompt
  // expects; briefToFields() parses that format back out whenever presets or
  // the databank need the structured shape.
  const [brief, setBrief] = useState('')
  const [showBriefGuide, setShowBriefGuide] = useState(false)
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState('')
  const [parsedOk, setParsedOk] = useState(false)

  // Presets: save the whole step-2 form (browser-local) and reload it next run.
  const [presets, setPresets] = useState(() => loadPresets())
  const [selectedPreset, setSelectedPreset] = useState('')
  const [presetName, setPresetName] = useState('')
  const [saveMsg, setSaveMsg] = useState('')

  // Everything the operator fills — the shape a preset stores and restores.
  // The brief is decomposed back into structured fields so saved presets and
  // databank rows keep the schema they've always had.
  const gatherConfig = () => ({
    brandId, niches, targetAudience, targetKeywords, excludeKeywords,
    locationTarget, minEngagement, scoringProfile,
    ...briefToFields(brief),
  })

  const BRIEF_KEYS = ['brandName', 'brandBackground', 'newProduct', 'collabFormat', 'products', 'briefNotes']

  // Applies only the keys present in `c`, so callers control the granularity:
  // the databank sends just the three brand fields for a brand-only load, or a
  // complete config (defaults pre-merged in inputDatabank.js) for a full load.
  // Structured brief keys are merged over whatever the box currently parses to
  // and re-rendered as text — a brand-only load swaps the brand lines while
  // keeping the campaign half of the brief.
  const applyPreset = (c) => {
    if (!c) return
    const setters = {
      // brandId is set directly (not via chooseBrand) so a preset's own saved
      // niches/profile win over the brand defaults instead of being clobbered.
      brandId: setBrandId,
      niches: setNiches,
      targetAudience: setTargetAudience,
      targetKeywords: setTargetKeywords,
      excludeKeywords: setExcludeKeywords,
      locationTarget: setLocationTarget,
      minEngagement: setMinEngagement,
    }
    for (const [key, set] of Object.entries(setters)) {
      if (c[key] !== undefined) set(c[key])
    }
    // A preset that stored a profile pins it (counts as a manual choice); one
    // saved before this feature existed leaves the niche auto-suggest in charge.
    if (c.scoringProfile !== undefined) chooseProfile(c.scoringProfile)
    if (c.campaignBrief !== undefined) {
      setBrief(c.campaignBrief)
    } else if (BRIEF_KEYS.some((k) => c[k] !== undefined)) {
      setBrief((prev) => {
        const merged = briefToFields(prev)
        for (const k of BRIEF_KEYS) if (c[k] !== undefined) merged[k] = c[k]
        return assembleBrief(merged)
      })
    }
  }

  const handleLoadPreset = (name) => {
    setSelectedPreset(name)
    const p = presets.find((x) => x.name === name)
    if (p) applyPreset(p.config)
  }

  // Let the CombinedStep read/write the whole step-2 form for the shared input
  // databank (applyConfig reuses the same setter fan-out as preset loading).
  useImperativeHandle(ref, () => ({
    getConfig: gatherConfig,
    applyConfig: applyPreset,
  }))

  // Brand name pulled live from the brief's 品牌： line — default preset name
  // and the databank both file by it.
  const briefBrand = briefToFields(brief).brandName

  const handleSavePreset = () => {
    const name = presetName.trim() || briefBrand
    if (!name) { setSaveMsg('Name it (or fill Brand) first'); return }
    setPresets(savePreset(name, gatherConfig()))
    setPresetName('')
    setSelectedPreset(name)
    setSaveMsg(`Saved "${name}"`)
    setTimeout(() => setSaveMsg(''), 2500)
  }

  const handleDeletePreset = () => {
    if (!selectedPreset) return
    setPresets(deletePreset(selectedPreset))
    setSelectedPreset('')
  }

  // Auto-tidy: DeepSeek splits whatever's in the box into structured fields,
  // then assembleBrief renders them back as the labelled format — same box,
  // now clean. Never wipes the operator's text on a failed parse.
  const handleTidyBrief = async () => {
    if (!brief.trim()) return
    setParseError(''); setParsedOk(false); setParsing(true)
    try {
      const r = await parseBrief(brief)
      const tidied = assembleBrief(r)
      if (!tidied.trim()) throw new Error('DeepSeek 讀唔到呢份 brief — 檢查下內容再試')
      setBrief(tidied)
      setParsedOk(true)
    } catch (e) {
      setParseError(e.message || 'Could not read that brief')
    } finally {
      setParsing(false)
    }
  }


  const hasData = influencerCount > 0
  const canStart = niches.length > 0 && (!embedded || hasData)

  const handleStart = () => {
    onStart({
      sessionTitle: sessionTitle.trim(),
      brandId,
      niches: niches.map((id) => NICHE_OPTIONS.find((n) => n.id === id)?.label || id),
      targetAudience: targetAudience.trim(),
      targetKeywords: targetKeywords.trim(),
      excludeKeywords: excludeKeywords.trim(),
      locationTarget,
      minEngagement,
      scoringProfile,
      campaignBrief: brief.trim(),
    })
  }

  return (
    <div className={embedded ? '' : 'px-8 py-8'}>
      <div className={embedded ? '' : 'max-w-[720px]'}>
        {!embedded && <StepProgress current={2} />}
        {!embedded && (
          <>
            <h1 className="text-[34px] font-serif font-bold tracking-[0.02em] text-ink mb-1">Configure your search</h1>
            <p className="text-muted text-[14px] mb-8">
              Found <span className="font-mono font-semibold text-ink">{influencerCount}</span> unique accounts
              {fileNames.length > 0 && (
                <> from{' '}
                  {fileNames.length === 1
                    ? <span className="font-mono text-body">{fileNames[0]}</span>
                    : <span className="font-mono text-body">{fileNames.length} files</span>
                  }
                </>
              )}
            </p>
          </>
        )}

        {/* Presets — reuse a saved setup instead of re-typing every run. Hidden
            when embedded: the CombinedStep's shared Databank bar supersedes this
            browser-local, step-2-only picker. */}
        {!embedded && (
        <section className="mb-8 flex flex-wrap items-center gap-2 px-4 py-3 bg-surface border border-card-edge rounded-[12px]">
          <span className="font-mono text-[10px] tracking-[.14em] text-faint uppercase flex-shrink-0">Presets</span>
          {presets.length > 0 ? (
            <>
              <select
                value={selectedPreset}
                onChange={(e) => handleLoadPreset(e.target.value)}
                className="px-2.5 py-1.5 border border-mist rounded-[8px] text-[12.5px] text-ink bg-white focus:outline-none focus:border-ink/30"
              >
                <option value="">Load a saved setup…</option>
                {presets.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
              </select>
              {selectedPreset && (
                <button
                  type="button"
                  onClick={handleDeletePreset}
                  title={`Delete "${selectedPreset}"`}
                  className="text-faint hover:text-rose-strong transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </>
          ) : (
            <span className="text-[12px] text-faint">None yet — fill this in once and save it to reuse next time.</span>
          )}
          <div className="ml-auto flex items-center gap-2">
            {saveMsg && (
              <span className="flex items-center gap-1 text-[11.5px] text-sage">
                <Check size={12} /> {saveMsg}
              </span>
            )}
            <input
              type="text"
              value={presetName}
              onChange={(e) => setPresetName(e.target.value)}
              placeholder={briefBrand || 'Name (e.g. brand)'}
              className="w-[150px] px-2.5 py-1.5 border border-mist rounded-[8px] text-[12.5px] text-ink bg-white focus:outline-none focus:border-ink/30 placeholder:text-faint"
            />
            <button
              type="button"
              onClick={handleSavePreset}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] bg-ink text-white text-[12px] font-medium hover:bg-ink/80 transition-colors"
            >
              <Save size={13} /> Save current
            </button>
          </div>
        </section>
        )}

        {/* Session title */}
        <section className="mb-8">
          <label className="block font-mono text-[10px] tracking-[.14em] text-faint uppercase mb-1">
            Session name
            <span className="ml-2 normal-case text-faint/70 tracking-normal font-sans text-[11px]">helps you identify this run in the Review Queue and History</span>
          </label>
          <input
            type="text"
            value={sessionTitle}
            onChange={(e) => setSessionTitle(e.target.value)}
            placeholder="e.g. Skincare HK Q3 · Competitor A"
            className="w-full px-3 py-2.5 border border-mist rounded-[10px] text-[13.5px] text-ink bg-white focus:outline-none focus:border-ink/30 placeholder:text-faint"
          />
        </section>

        {/* Brand — the run is set up per brand. Picking one maps to its target
            niches and default scoring formula (see brandCatalog.js), so niches
            aren't hand-picked anymore. */}
        <section className="mb-8">
          <label className="block font-mono text-[10px] tracking-[.14em] text-faint uppercase mb-3">
            Brand
            <span className="ml-2 normal-case text-faint/70 tracking-normal font-sans text-[11px]">
              {brandLocked
                ? 'set by the campaign — drives the target niches and scoring formula'
                : 'sets the target niches and scoring formula for this run'}
            </span>
          </label>
          {brandLocked ? (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-ink text-white text-[13px]">
              {lockedCatalogBrand.name}
              <span className="text-white/60 text-[11px]">from campaign</span>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {BRAND_CATALOG.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => chooseBrand(b.id)}
                  className={`px-3 py-1.5 rounded-full text-[13px] border transition-all
                    ${brandId === b.id
                      ? 'bg-ink border-ink text-white'
                      : 'bg-white border-[#E1DBCD] text-[#6C6555] hover:border-ink/30'
                    }`}
                  title={b.tag}
                >
                  {b.name}
                </button>
              ))}
            </div>
          )}
          {/* The niches the picked brand maps to — shown read-only for
              transparency; the relevancy scorer uses exactly these. */}
          {niches.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[12px] text-faint">
              <span className="font-mono text-[10px] tracking-[.12em] uppercase">Target niches</span>
              {niches.map((id) => (
                <span key={id} className="px-2 py-0.5 rounded-full bg-mist text-body text-[12px]">
                  {NICHE_OPTIONS.find((n) => n.id === id)?.label || id}
                </span>
              ))}
            </div>
          )}
        </section>

        {/* Scoring formula — which formula ranks the results. Defaults from the
            brand above, overridable per run. */}
        <section className="mb-8">
          <label className="block font-mono text-[10px] tracking-[.14em] text-faint uppercase mb-1">
            Scoring formula
            <span className="ml-2 normal-case text-faint/70 tracking-normal font-sans text-[11px]">
              how the Overall score ranks accounts · suggested from your niches
            </span>
          </label>
          <div className="grid sm:grid-cols-2 gap-2 mt-2">
            {Object.values(SCORING_PROFILES).map((p) => {
              const active = scoringProfile === p.id
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => chooseProfile(p.id)}
                  className={`text-left px-3.5 py-3 rounded-[12px] border transition-all
                    ${active
                      ? 'bg-ink border-ink text-white'
                      : 'bg-white border-[#E1DBCD] text-[#6C6555] hover:border-ink/30'
                    }`}
                >
                  <div className="flex items-center gap-1.5 text-[13px] font-medium">
                    {active && <Check size={13} />}
                    {p.label}
                  </div>
                  <p className={`mt-1 text-[11.5px] leading-snug ${active ? 'text-white/75' : 'text-faint'}`}>
                    {p.blurb}
                  </p>
                </button>
              )
            })}
          </div>
        </section>

        {/* Target audience + relevancy keywords */}
        <section className="mb-8 space-y-4">
          <div>
            <label className="block font-mono text-[10px] tracking-[.14em] text-faint uppercase mb-1">
              Target audience
              <span className="ml-2 normal-case text-faint/70 tracking-normal font-sans text-[11px]">who the product is for — sharpens relevancy scoring</span>
            </label>
            <textarea
              value={targetAudience}
              onChange={(e) => setTargetAudience(e.target.value)}
              rows={2}
              placeholder="例：20–45 歲女性，注重健康、辦公室 OL、gym 女生（唔極端戒糖）、鍾意甜食但想低卡"
              className="w-full px-3 py-2 border border-mist rounded-[10px] text-[13.5px] text-ink bg-white focus:outline-none focus:border-ink/30 resize-none placeholder:text-faint"
            />
          </div>
          <div>
            <label className="block font-mono text-[10px] tracking-[.14em] text-faint uppercase mb-1">
              In-niche keywords
              <span className="ml-2 normal-case text-faint/70 tracking-normal font-sans text-[11px]">reward these — comma or new line separated</span>
            </label>
            <textarea
              value={targetKeywords}
              onChange={(e) => setTargetKeywords(e.target.value)}
              rows={2}
              placeholder="例：減脂, 高蛋白, protein, 健身, gym, 代餐, 低卡, 減脂餐, 增肌, 健康食"
              className="w-full px-3 py-2 border border-mist rounded-[10px] text-[13.5px] text-ink bg-white focus:outline-none focus:border-ink/30 resize-none placeholder:text-faint"
            />
          </div>
          <div>
            <label className="block font-mono text-[10px] tracking-[.14em] text-faint uppercase mb-1">
              Exclude keywords
              <span className="ml-2 normal-case text-faint/70 tracking-normal font-sans text-[11px]">wrong-vertical signals — strongly penalised even with high engagement</span>
            </label>
            <input
              type="text"
              value={excludeKeywords}
              onChange={(e) => setExcludeKeywords(e.target.value)}
              placeholder="例：makeup, 化妝, 美妝, cosmetic, 眼影, 唇膏"
              className="w-full px-3 py-2 border border-mist rounded-[10px] text-[13.5px] text-ink bg-white focus:outline-none focus:border-ink/30 placeholder:text-faint"
            />
          </div>
        </section>

        {/* Location */}
        <section className="mb-8">
          <label className="block font-mono text-[10px] tracking-[.14em] text-faint uppercase mb-3">
            Target location
          </label>
          <div className="flex gap-2">
            {['Hong Kong', 'Taiwan', 'Singapore', 'Macau'].map((loc) => (
              <button
                key={loc}
                onClick={() => setLocationTarget(loc)}
                className={`px-3 py-1.5 rounded-full text-[13px] border transition-all
                  ${locationTarget === loc
                    ? 'bg-ink border-ink text-white'
                    : 'bg-white border-[#E1DBCD] text-[#6C6555] hover:border-ink/30'
                  }`}
              >
                {loc}
              </button>
            ))}
          </div>
        </section>

        {/* Min engagement */}
        <section className="mb-8">
          <label className="block font-mono text-[10px] tracking-[.14em] text-faint uppercase mb-3">
            Minimum avg likes per post
          </label>
          <div className="flex items-center gap-3">
            <input
              type="number"
              value={minEngagement}
              onChange={(e) => setMinEngagement(Number(e.target.value))}
              min="0"
              className="w-28 px-3 py-2 border border-[#E1DBCD] rounded-[10px] font-mono text-[13px] bg-white focus:outline-none focus:border-ink/30"
            />
            <span className="text-[12px] text-faint">{minEngagement === 0 ? 'No minimum' : `≥ ${minEngagement.toLocaleString()} likes`}</span>
          </div>
        </section>

        {/* Campaign brief — one box; 自動整理 reformats it via DeepSeek */}
        <section className="mb-10">
          <label className="block font-mono text-[10px] tracking-[.14em] text-faint uppercase mb-1">
            Campaign brief
            <span className="ml-2 normal-case text-faint/70 tracking-normal font-sans text-[11px]">optional · feeds AI fit scoring + the DM draft · can still add or edit in Review</span>
          </label>
          <p className="text-[12px] text-faint mb-2">
            乜都貼得：WhatsApp brief、文件、自己打幾句都得。撳「自動整理」DeepSeek 會執成統一格式（品牌／新品／賣點），記得執完檢查一下。
          </p>
          <button
            type="button"
            onClick={() => setShowBriefGuide((v) => !v)}
            className="text-[12px] text-accent hover:text-accent/70 transition-colors mb-3 underline underline-offset-2"
          >
            {showBriefGuide ? 'Hide guide' : 'How to fill this in →'}
          </button>
          {showBriefGuide && (
            <div className="mb-3 px-4 py-3.5 bg-surface border border-card-edge rounded-[12px] text-[12.5px] text-body whitespace-pre-wrap leading-relaxed font-mono">
              {BRIEF_GUIDE}
            </div>
          )}

          <textarea
            value={brief}
            onChange={(e) => { setBrief(e.target.value); setParsedOk(false) }}
            rows={10}
            placeholder={'貼上或者打低品牌同產品資料，例：\n\nWellage 係韓國醫美大廠 Hugel 旗下品牌，新推出「生維 C」系列登陸萬寧，主打一夜急救煥膚。想搵 KOL 寄產品體驗，Feed／Reels feature 都可以。\n維C高效亮白七日套裝：醫美等級濃度 30% 生維 C，改善暗啞；即開即用高濃度維他命 C 膠囊，減低氧化'}
            className="w-full px-3.5 py-3 border border-mist rounded-[12px] text-[13.5px] text-ink bg-white focus:outline-none focus:border-ink/30 resize-y leading-relaxed placeholder:text-faint"
          />
          <div className="flex items-center gap-3 mt-2">
            <button
              type="button"
              onClick={handleTidyBrief}
              disabled={parsing || !brief.trim()}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-[12px] font-medium transition-colors
                ${parsing || !brief.trim()
                  ? 'bg-mist text-faint cursor-not-allowed'
                  : 'bg-accent text-white hover:bg-accent/80'
                }`}
            >
              {parsing ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
              {parsing ? '整緊…' : '自動整理 · Auto-tidy'}
            </button>
            {parseError && <span className="text-[11.5px] text-rose">{parseError}</span>}
            {parsedOk && !parseError && (
              <span className="flex items-center gap-1 text-[11.5px] text-sage">
                <Check size={12} /> 已整理好，記得檢查
              </span>
            )}
          </div>
        </section>

        <button
          onClick={handleStart}
          disabled={!canStart}
          className={`w-full flex items-center justify-center gap-2 py-3 rounded-[12px] font-semibold text-[13.5px] transition-all
            ${canStart
              ? 'bg-ink text-white hover:bg-ink/80'
              : 'bg-mist text-faint cursor-not-allowed'
            }`}
        >
          {embedded && !hasData ? 'Add your data to start' : `Start scoring ${influencerCount} accounts`}
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  )
}

export default forwardRef(ConfigStep)
