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

const BRIEF_GUIDE = `點樣填 Campaign Brief
─────────────────────
DM 入面所有品牌／產品資料都只會用你喺度填嘅內容——DeepSeek 唔會自己作成分或數字。
所以產品 block 需要嘅嘢，一定要喺度寫齊。跟住以下五行填：

品牌：（品牌名，例：Wellage 唯拉珠）
      ↳ 自我介紹會自動變成「我係 [品牌] 嘅 Marketing」，唔使自己寫成個句
品牌背景：（母公司或品牌定位，一句，例：韓國醫美大廠 Hugel 旗下品牌）
新品：（系列／產品名 + 上架渠道 + 一句主打賣點，
      例：「生維 C」系列登陸萬寧，主打一夜急救煥膚、7 日無針急救冷白皮）
合作形式：（例：寄產品體驗，Feed／Reels feature 都可以）
產品詳情：（每件產品：名稱 + 兩個賣點；成分／濃度／數字照官方寫。可以一件或多件）
【產品一名稱】
・賣點 1
・賣點 2
【產品二名稱】
・賣點 1
・賣點 2

─────────────────────
填寫範例（可以照呢個 shape 抄）：

品牌：Wellage 唯拉珠
品牌背景：韓國醫美大廠 Hugel 旗下品牌
新品：「生維 C」系列登陸萬寧，主打一夜急救煥膚、7 日無針急救冷白皮
合作形式：寄產品體驗，Feed／Reels feature 都可以
產品詳情：
【Wellage 唯拉珠 維C高效亮白七日套裝】
・醫美等級濃度 30% 生維 C ✕ 純穀胱甘肽，改善暗啞及膚色不均
・即開即用高濃度維他命 C 膠囊，減低氧化，發揮亮白效果
【Wellage 唯拉珠 維C高效亮白安瓶精華】
・美白針同款穀胱甘肽，5 秒內透光，2 周打造水光肌
・蘊含 100% 高親膚純淨穀胱甘肽，令純維他命 C 長效發揮作用

─────────────────────
三個提示：
1. 賣點冇寫入 Brief 就唔會出現喺 DM（防止作大成分／功效）。
2. 美白／醫美級字眼照官方 listing 原文寫，唔好自己加大——香港《商品說明條例》有風險。
3. 個人化開場靠 KOL 自己嘅 IG 內容自動生成，唔使你喺 Brief 度寫。`

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
  const [locationTarget, setLocationTarget] = useState('Hong Kong')
  const [requireVideo, setRequireVideo] = useState(true)
  const [minEngagement, setMinEngagement] = useState(0)
  const [campaignBrief, setCampaignBrief] = useState('')
  const [showBriefGuide, setShowBriefGuide] = useState(false)

  const toggleNiche = (id) => {
    setNiches((prev) =>
      prev.includes(id) ? prev.filter((n) => n !== id) : [...prev, id]
    )
  }

  const canStart = niches.length > 0

  const handleStart = () => {
    onStart({
      sessionTitle: sessionTitle.trim(),
      niches: niches.map((id) => NICHE_OPTIONS.find((n) => n.id === id)?.label || id),
      locationTarget,
      requireVideo,
      minEngagement,
      campaignBrief: campaignBrief.trim(),
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
          <textarea
            value={campaignBrief}
            onChange={(e) => setCampaignBrief(e.target.value)}
            rows={3}
            placeholder="e.g. Minimalist skincare brand targeting 25–35 year olds, clean aesthetic, natural ingredients positioning, looking for creators who film at-home routines or morning skincare content."
            className="w-full px-3 py-2.5 border border-mist rounded-[10px] text-[13.5px] text-ink bg-white focus:outline-none focus:border-ink/30 resize-none placeholder:text-faint"
          />
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
