import { useState } from 'react'
import { Settings, ChevronRight } from 'lucide-react'

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
・個人化開場靠 KOL 自己嘅 IG 內容自動生成，唔使你寫。

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

export default function ConfigStep({ fileNames = [], influencerCount, onStart }) {
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
  const [requireVideo, setRequireVideo] = useState(true)
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

  const canStart = niches.length > 0

  const handleStart = () => {
    onStart({
      sessionTitle: sessionTitle.trim(),
      niches: niches.map((id) => NICHE_OPTIONS.find((n) => n.id === id)?.label || id),
      targetAudience: targetAudience.trim(),
      targetKeywords: targetKeywords.trim(),
      excludeKeywords: excludeKeywords.trim(),
      locationTarget,
      requireVideo,
      minEngagement,
      campaignBrief: assembleBrief(),
    })
  }

  return (
    <div className="px-8 py-8">
      <div className="max-w-[720px]">
        <StepProgress current={2} />
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

        {/* Content format */}
        <section className="mb-8">
          <label className="block font-mono text-[10px] tracking-[.14em] text-faint uppercase mb-3">
            Content format
          </label>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setRequireVideo(!requireVideo)}
              className={`relative w-10 h-6 rounded-full transition-all flex-shrink-0
                ${requireVideo ? 'bg-ink' : 'bg-mist'}`}
            >
              <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all
                ${requireVideo ? 'left-5' : 'left-1'}`} />
            </button>
            <span className="text-[13.5px] text-body">
              Prioritise accounts that post Reels / video content
            </span>
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
          Start scoring {influencerCount} accounts
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  )
}
