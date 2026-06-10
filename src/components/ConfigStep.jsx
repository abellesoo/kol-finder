import { useState } from 'react'
import { Settings, Eye, EyeOff, ChevronRight } from 'lucide-react'

const NICHE_OPTIONS = [
  { id: 'beauty', label: '💄 Beauty & Makeup' },
  { id: 'skincare', label: '🧴 Skincare' },
  { id: 'lifestyle', label: '✨ Lifestyle' },
  { id: 'fashion', label: '👗 Fashion' },
  { id: 'health', label: '🌿 Health & Wellness' },
  { id: 'food', label: '🍜 Food & Dining' },
]

export default function ConfigStep({ fileName, influencerCount, onStart }) {
  const [apiKey, setApiKey] = useState(import.meta.env.VITE_ANTHROPIC_API_KEY || '')
  const [showKey, setShowKey] = useState(false)
  const [niches, setNiches] = useState(['beauty', 'skincare'])
  const [locationTarget, setLocationTarget] = useState('Hong Kong')
  const [requireVideo, setRequireVideo] = useState(true)
  const [minEngagement, setMinEngagement] = useState(0)

  const toggleNiche = (id) => {
    setNiches((prev) =>
      prev.includes(id) ? prev.filter((n) => n !== id) : [...prev, id]
    )
  }

  const canStart = apiKey.trim().length > 0 && niches.length > 0

  const handleStart = () => {
    onStart({
      apiKey: apiKey.trim(),
      niches: niches.map((id) => NICHE_OPTIONS.find((n) => n.id === id)?.label || id),
      locationTarget,
      requireVideo,
      minEngagement,
    })
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12">
      <div className="max-w-xl w-full">
        <p className="font-mono text-xs tracking-widest text-ink/40 uppercase mb-3">Step 2 of 3</p>
        <h1 className="text-3xl font-semibold text-ink mb-1">Configure your search</h1>
        <p className="text-ink/50 text-sm mb-8">
          Found <span className="font-mono font-medium text-ink">{influencerCount}</span> unique accounts in{' '}
          <span className="font-mono text-accent">{fileName}</span>
        </p>

        {/* Niche */}
        <section className="mb-8">
          <label className="block text-xs font-mono tracking-widest text-ink/40 uppercase mb-3">
            Target niches
          </label>
          <div className="flex flex-wrap gap-2">
            {NICHE_OPTIONS.map((n) => (
              <button
                key={n.id}
                onClick={() => toggleNiche(n.id)}
                className={`px-3 py-1.5 rounded-full text-sm border transition-all
                  ${niches.includes(n.id)
                    ? 'bg-accent border-accent text-white'
                    : 'bg-white border-mist text-ink/60 hover:border-accent/50'
                  }`}
              >
                {n.label}
              </button>
            ))}
          </div>
        </section>

        {/* Location */}
        <section className="mb-8">
          <label className="block text-xs font-mono tracking-widest text-ink/40 uppercase mb-3">
            Target location
          </label>
          <div className="flex gap-2">
            {['Hong Kong', 'Taiwan', 'Singapore', 'Macau'].map((loc) => (
              <button
                key={loc}
                onClick={() => setLocationTarget(loc)}
                className={`px-3 py-1.5 rounded-full text-sm border transition-all
                  ${locationTarget === loc
                    ? 'bg-ink border-ink text-white'
                    : 'bg-white border-mist text-ink/60 hover:border-ink/30'
                  }`}
              >
                {loc}
              </button>
            ))}
          </div>
        </section>

        {/* Content format */}
        <section className="mb-8">
          <label className="block text-xs font-mono tracking-widest text-ink/40 uppercase mb-3">
            Content format
          </label>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setRequireVideo(!requireVideo)}
              className={`relative w-10 h-6 rounded-full transition-all
                ${requireVideo ? 'bg-accent' : 'bg-mist'}`}
            >
              <span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all
                ${requireVideo ? 'left-5' : 'left-1'}`} />
            </button>
            <span className="text-sm text-ink/70">
              Prioritise accounts that post Reels / video content
            </span>
          </div>
        </section>

        {/* Min engagement */}
        <section className="mb-8">
          <label className="block text-xs font-mono tracking-widest text-ink/40 uppercase mb-3">
            Minimum avg likes per post
          </label>
          <div className="flex items-center gap-3">
            <input
              type="number"
              value={minEngagement}
              onChange={(e) => setMinEngagement(Number(e.target.value))}
              min="0"
              className="w-28 px-3 py-2 border border-mist rounded-lg font-mono text-sm bg-white focus:outline-none focus:border-accent"
            />
            <span className="text-xs text-ink/40">{minEngagement === 0 ? 'No minimum' : `≥ ${minEngagement.toLocaleString()} likes`}</span>
          </div>
        </section>

        {/* API Key */}
        <section className="mb-10">
          <label className="block text-xs font-mono tracking-widest text-ink/40 uppercase mb-3">
            Anthropic API key
          </label>
          <div className="relative">
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-ant-..."
              className="w-full px-3 py-2.5 pr-10 border border-mist rounded-lg font-mono text-sm bg-white focus:outline-none focus:border-accent"
            />
            <button
              onClick={() => setShowKey(!showKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink/30 hover:text-ink/60"
            >
              {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <p className="mt-1.5 text-xs text-ink/30 font-mono">
            Or set VITE_ANTHROPIC_API_KEY in your .env file · Never committed to git
          </p>
        </section>

        <button
          onClick={handleStart}
          disabled={!canStart}
          className={`w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-medium text-sm transition-all
            ${canStart
              ? 'bg-ink text-white hover:bg-ink/80'
              : 'bg-mist text-ink/30 cursor-not-allowed'
            }`}
        >
          Start scoring {influencerCount} accounts
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  )
}
