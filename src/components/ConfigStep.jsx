import { useState, forwardRef, useImperativeHandle } from 'react'
import { Settings, ChevronRight, Sparkles, Loader2, Save, Trash2, Check } from 'lucide-react'
import { parseBrief } from '../lib/apifyApi'
import { loadPresets, savePreset, deletePreset } from '../lib/configPresets'

const NICHE_OPTIONS = [
  { id: 'beauty', label: '💄 Beauty & Makeup' },
  { id: 'skincare', label: '🧴 Skincare' },
  { id: 'lifestyle', label: '✨ Lifestyle' },
  { id: 'fashion', label: '👗 Fashion' },
  { id: 'health', label: '🌿 Health & Wellness' },
  { id: 'food', label: '🍜 Food & Dining' },
]

const BRIEF_GUIDE = `Campaign Brief 點用
─────────────────────
DM 入面所有品牌／產品資料都只會用你喺下面填嘅內容——DeepSeek 唔會自己作成分或數字。所以每個賣點都要喺度寫齊。

・自我介紹會自動變成「我係 [品牌] 嘅 Marketing」，唔使自己寫。
・開場係固定一句「你嘅 content style 好啱我哋品牌」，唔會逐個 KOL 個人化——一個 campaign 出一封 DM，approve 之後大家共用。

三個提示：
1. 賣點冇填就唔會出現喺 DM（防止作大成分／功效）。
2. 美白／醫美級字眼照官方 listing 原文寫，唔好自己加大——香港《商品說明條例》有風險。
3. 一件或多件產品都得，撳「+ 加多件產品」加。`

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

function ConfigStep({ fileNames = [], influencerCount, onStart, embedded = false }, ref) {
  const [sessionTitle, setSessionTitle] = useState('')
  const [niches, setNiches] = useState(['beauty', 'skincare'])
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
  // Structured campaign-brief fields. They assemble into the single
  // `campaignBrief` string DeepSeek consumes (assembleBrief), so nothing
  // downstream (worker DM prompt, storage, display) has to change.
  const [brandName, setBrandName] = useState('')
  const [brandBackground, setBrandBackground] = useState('')
  const [newProduct, setNewProduct] = useState('')
  const [collabFormat, setCollabFormat] = useState('')
  const [products, setProducts] = useState([{ name: '', points: '' }])
  const [briefNotes, setBriefNotes] = useState('')
  const [showBriefGuide, setShowBriefGuide] = useState(false)

  // Paste-to-fill: paste a freeform brief, DeepSeek splits it into the fields below.
  const [pasteText, setPasteText] = useState('')
  const [parsing, setParsing] = useState(false)
  const [parseError, setParseError] = useState('')
  const [parsedOk, setParsedOk] = useState(false)

  // Presets: save the whole step-2 form (browser-local) and reload it next run.
  const [presets, setPresets] = useState(() => loadPresets())
  const [selectedPreset, setSelectedPreset] = useState('')
  const [presetName, setPresetName] = useState('')
  const [saveMsg, setSaveMsg] = useState('')

  // Everything the operator fills — the shape a preset stores and restores.
  const gatherConfig = () => ({
    niches, targetAudience, targetKeywords, excludeKeywords,
    locationTarget, minEngagement,
    brandName, brandBackground, newProduct, collabFormat, products, briefNotes,
  })

  const applyPreset = (c) => {
    if (!c) return
    setNiches(c.niches ?? [])
    setTargetAudience(c.targetAudience ?? '')
    setTargetKeywords(c.targetKeywords ?? '')
    setExcludeKeywords(c.excludeKeywords ?? '')
    setLocationTarget(c.locationTarget ?? 'Hong Kong')
    setMinEngagement(c.minEngagement ?? 0)
    setBrandName(c.brandName ?? '')
    setBrandBackground(c.brandBackground ?? '')
    setNewProduct(c.newProduct ?? '')
    setCollabFormat(c.collabFormat ?? '')
    setProducts(c.products?.length ? c.products : [{ name: '', points: '' }])
    setBriefNotes(c.briefNotes ?? '')
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

  const handleSavePreset = () => {
    const name = presetName.trim() || brandName.trim()
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

  const handleParseBrief = async () => {
    if (!pasteText.trim()) return
    setParseError(''); setParsedOk(false); setParsing(true)
    try {
      const r = await parseBrief(pasteText)
      setBrandName(r.brandName || '')
      setBrandBackground(r.brandBackground || '')
      setNewProduct(r.newProduct || '')
      setCollabFormat(r.collabFormat || '')
      setProducts(r.products?.length ? r.products : [{ name: '', points: '' }])
      setBriefNotes(r.briefNotes || '')
      setParsedOk(true)
    } catch (e) {
      setParseError(e.message || 'Could not read that brief')
    } finally {
      setParsing(false)
    }
  }

  const toggleNiche = (id) => {
    setNiches((prev) =>
      prev.includes(id) ? prev.filter((n) => n !== id) : [...prev, id]
    )
  }

  const updateProduct = (i, field, value) =>
    setProducts((prev) => prev.map((p, idx) => (idx === i ? { ...p, [field]: value } : p)))
  const addProduct = () => setProducts((prev) => [...prev, { name: '', points: '' }])
  const removeProduct = (i) => setProducts((prev) => prev.filter((_, idx) => idx !== i))

  // Re-create the labelled brief shape DeepSeek expects. Empty fields are
  // dropped so a half-filled brief stays clean. Selling points are one per
  // line; each gets a ・ bullet (any existing bullet char is stripped first).
  const assembleBrief = () => {
    const lines = []
    if (brandName.trim()) lines.push(`品牌：${brandName.trim()}`)
    if (brandBackground.trim()) lines.push(`品牌背景：${brandBackground.trim()}`)
    if (newProduct.trim()) lines.push(`新品：${newProduct.trim()}`)
    if (collabFormat.trim()) lines.push(`合作形式：${collabFormat.trim()}`)
    const blocks = products
      .filter((p) => p.name.trim() || p.points.trim())
      .map((p) => {
        const pts = p.points
          .split('\n')
          .map((s) => s.trim().replace(/^[・·•\-\s]+/, ''))
          .filter(Boolean)
          .map((s) => `・${s}`)
        return [`【${p.name.trim()}】`, ...pts].join('\n')
      })
    if (blocks.length) {
      lines.push('產品詳情：')
      lines.push(blocks.join('\n'))
    }
    if (briefNotes.trim()) lines.push(briefNotes.trim())
    return lines.join('\n')
  }

  const hasData = influencerCount > 0
  const canStart = niches.length > 0 && (!embedded || hasData)

  const handleStart = () => {
    onStart({
      sessionTitle: sessionTitle.trim(),
      niches: niches.map((id) => NICHE_OPTIONS.find((n) => n.id === id)?.label || id),
      targetAudience: targetAudience.trim(),
      targetKeywords: targetKeywords.trim(),
      excludeKeywords: excludeKeywords.trim(),
      locationTarget,
      minEngagement,
      campaignBrief: assembleBrief(),
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
                  className="text-faint hover:text-red-500 transition-colors"
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
              placeholder={brandName.trim() || 'Name (e.g. brand)'}
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

        {/* Niche */}
        <section className="mb-8">
          <label className="block font-mono text-[10px] tracking-[.14em] text-faint uppercase mb-3">
            Target niches
          </label>
          <div className="flex flex-wrap gap-2">
            {NICHE_OPTIONS.map((n) => (
              <button
                key={n.id}
                onClick={() => toggleNiche(n.id)}
                className={`px-3 py-1.5 rounded-full text-[13px] border transition-all
                  ${niches.includes(n.id)
                    ? 'bg-ink border-ink text-white'
                    : 'bg-white border-[#E1DBCD] text-[#6C6555] hover:border-ink/30'
                  }`}
              >
                {n.label}
              </button>
            ))}
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

        {/* Campaign brief */}
        <section className="mb-10">
          <label className="block font-mono text-[10px] tracking-[.14em] text-faint uppercase mb-1">
            Campaign brief
            <span className="ml-2 normal-case text-faint/70 tracking-normal font-sans text-[11px]">optional · used for DM generation</span>
          </label>
          <p className="text-[12px] text-faint mb-2">
            Describe the brand aesthetic, campaign goals, and content style you're looking for. Used to generate personalised DM drafts for approved accounts.
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

          <div className="space-y-3.5 px-4 py-4 bg-surface border border-card-edge rounded-[12px]">
            {/* Paste-to-fill — paste any brief, DeepSeek splits it into the fields below */}
            <div className="pb-3.5 border-b border-mist">
              <label className="block text-[12px] font-medium text-body mb-1">
                貼上你嘅 brief <span className="text-faint font-normal">· Paste your brief, auto-fill the fields</span>
              </label>
              <p className="text-[11px] text-faint mb-2">
                有現成 brief（WhatsApp／文件）就直接貼落嚟，撳自動填入，DeepSeek 會幫你拆返落下面每格。記得填完檢查一下。
              </p>
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                rows={3}
                placeholder="貼上品牌同產品資料，例：Wellage 係韓國醫美大廠 Hugel 旗下品牌，新推出「生維 C」系列登陸萬寧，主打一夜急救煥膚…"
                className="w-full px-3 py-2 border border-mist rounded-[10px] text-[13px] text-ink bg-white focus:outline-none focus:border-ink/30 resize-none placeholder:text-faint"
              />
              <div className="flex items-center gap-3 mt-2">
                <button
                  type="button"
                  onClick={handleParseBrief}
                  disabled={parsing || !pasteText.trim()}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-[12px] font-medium transition-colors
                    ${parsing || !pasteText.trim()
                      ? 'bg-mist text-faint cursor-not-allowed'
                      : 'bg-accent text-white hover:bg-accent/80'
                    }`}
                >
                  {parsing ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                  {parsing ? '整緊…' : '自動填入 · Auto-fill'}
                </button>
                {parseError && <span className="text-[11.5px] text-rose">{parseError}</span>}
                {parsedOk && !parseError && (
                  <span className="flex items-center gap-1 text-[11.5px] text-sage">
                    <Check size={12} /> 已填入下面，記得檢查
                  </span>
                )}
              </div>
            </div>

            <div>
              <label className="block text-[12px] font-medium text-body mb-1">
                品牌 <span className="text-faint font-normal">· Brand name</span>
              </label>
              <input
                type="text"
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                placeholder="例：Wellage 唯拉珠"
                className="w-full px-3 py-2 border border-mist rounded-[10px] text-[13.5px] text-ink bg-white focus:outline-none focus:border-ink/30 placeholder:text-faint"
              />
              <p className="text-[11px] text-faint mt-1">自我介紹會自動變成「我係 {brandName.trim() || '[品牌]'} 嘅 Marketing」</p>
            </div>

            <div>
              <label className="block text-[12px] font-medium text-body mb-1">
                品牌背景 <span className="text-faint font-normal">· Brand background (一句)</span>
              </label>
              <input
                type="text"
                value={brandBackground}
                onChange={(e) => setBrandBackground(e.target.value)}
                placeholder="例：韓國醫美大廠 Hugel 旗下品牌"
                className="w-full px-3 py-2 border border-mist rounded-[10px] text-[13.5px] text-ink bg-white focus:outline-none focus:border-ink/30 placeholder:text-faint"
              />
            </div>

            <div>
              <label className="block text-[12px] font-medium text-body mb-1">
                新品 <span className="text-faint font-normal">· 系列／產品名 + 上架渠道 + 主打賣點</span>
              </label>
              <textarea
                value={newProduct}
                onChange={(e) => setNewProduct(e.target.value)}
                rows={2}
                placeholder="例：「生維 C」系列登陸萬寧，主打一夜急救煥膚、7 日無針急救冷白皮"
                className="w-full px-3 py-2 border border-mist rounded-[10px] text-[13.5px] text-ink bg-white focus:outline-none focus:border-ink/30 resize-none placeholder:text-faint"
              />
            </div>

            <div>
              <label className="block text-[12px] font-medium text-body mb-1">
                合作形式 <span className="text-faint font-normal">· Collaboration format</span>
              </label>
              <input
                type="text"
                value={collabFormat}
                onChange={(e) => setCollabFormat(e.target.value)}
                placeholder="例：寄產品體驗，Feed／Reels feature 都可以"
                className="w-full px-3 py-2 border border-mist rounded-[10px] text-[13.5px] text-ink bg-white focus:outline-none focus:border-ink/30 placeholder:text-faint"
              />
            </div>

            <div>
              <label className="block text-[12px] font-medium text-body mb-2">
                產品詳情 <span className="text-faint font-normal">· 每件：名稱 + 賣點（一行一個賣點）</span>
              </label>
              <div className="space-y-3">
                {products.map((p, i) => (
                  <div key={i} className="px-3 py-3 bg-white border border-mist rounded-[10px]">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="font-mono text-[10px] tracking-[.12em] text-faint uppercase flex-shrink-0">產品 {i + 1}</span>
                      {products.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeProduct(i)}
                          className="ml-auto text-[11px] text-faint hover:text-red-500 transition-colors"
                        >
                          移除
                        </button>
                      )}
                    </div>
                    <input
                      type="text"
                      value={p.name}
                      onChange={(e) => updateProduct(i, 'name', e.target.value)}
                      placeholder="產品名稱，例：維C高效亮白七日套裝"
                      className="w-full px-3 py-2 mb-2 border border-mist rounded-[8px] text-[13px] text-ink bg-white focus:outline-none focus:border-ink/30 placeholder:text-faint"
                    />
                    <textarea
                      value={p.points}
                      onChange={(e) => updateProduct(i, 'points', e.target.value)}
                      rows={2}
                      placeholder="一行一個賣點，例：&#10;醫美等級濃度 30% 生維 C，改善暗啞&#10;即開即用高濃度維他命 C 膠囊，減低氧化"
                      className="w-full px-3 py-2 border border-mist rounded-[8px] text-[13px] text-ink bg-white focus:outline-none focus:border-ink/30 resize-none placeholder:text-faint"
                    />
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={addProduct}
                className="mt-2 text-[12px] text-accent hover:text-accent/70 transition-colors font-medium"
              >
                + 加多件產品
              </button>
            </div>

            <div>
              <label className="block text-[12px] font-medium text-body mb-1">
                其他備註 <span className="text-faint font-normal">· optional</span>
              </label>
              <textarea
                value={briefNotes}
                onChange={(e) => setBriefNotes(e.target.value)}
                rows={2}
                placeholder="任何上面冇涵蓋嘅補充（語氣、活動期、優惠等）"
                className="w-full px-3 py-2 border border-mist rounded-[10px] text-[13.5px] text-ink bg-white focus:outline-none focus:border-ink/30 resize-none placeholder:text-faint"
              />
            </div>
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
