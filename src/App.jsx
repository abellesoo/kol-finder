import { useState } from 'react'
import { LayoutDashboard, Search, Clock, HelpCircle } from 'lucide-react'
import UploadStep from './components/UploadStep'
import ConfigStep from './components/ConfigStep'
import ResultsStep from './components/ResultsStep'
import InstructionsPage from './components/InstructionsPage'
import HistoryPage from './components/HistoryPage'
import ReviewPage from './components/ReviewPage'
import { parseApifyXlsx, aggregatePostItems } from './lib/parseXlsx'
import { scoreInfluencers } from './lib/scoreInfluencers'
import { saveSession } from './lib/sessionHistory'

const REVIEW_ID = new URLSearchParams(window.location.search).get('review')
const VIEW_PARAM = new URLSearchParams(window.location.search).get('view')

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'seeder', label: 'Seeder', icon: Search },
  { id: 'history', label: 'History', icon: Clock },
]

export default function App() {
  if (REVIEW_ID) {
    return <ReviewPage reviewId={REVIEW_ID} view={VIEW_PARAM} />
  }

  const [mode, setMode] = useState('dashboard')
  const [step, setStep] = useState('upload')
  const [fileNames, setFileNames] = useState([])
  const [influencers, setInfluencers] = useState([])
  const [results, setResults] = useState([])
  const [config, setConfig] = useState(null)
  const [progress, setProgress] = useState({ done: 0, total: 0, error: null })

  const handleLoadSeederSession = (session) => {
    setFileNames(session.fileNames)
    setConfig(session.config)
    setInfluencers(session.influencers)
    setResults(session.results)
    setStep('results')
    setMode('seeder')
  }

  function deduplicateInfluencers(batches) {
    const merged = {}
    for (const batch of batches) {
      for (const inf of batch) {
        const existing = merged[inf.username]
        if (!existing || inf.totalEngagement > existing.totalEngagement) {
          merged[inf.username] = inf
        }
      }
    }
    return Object.values(merged).sort((a, b) => b.totalEngagement - a.totalEngagement)
  }

  const handleFiles = async (files) => {
    setFileNames(files.map((f) => f.name))
    try {
      const allParsed = await Promise.all(files.map((f) => parseApifyXlsx(f)))
      setInfluencers(deduplicateInfluencers(allParsed))
      setStep('config')
    } catch (err) {
      alert('Failed to parse file(s): ' + err.message)
    }
  }

  const handleScrapedItems = (brandedResults) => {
    const influencerLists = brandedResults.map(({ items, brand }) => {
      const all = aggregatePostItems(items, brand)
      return brand
        ? all.filter((inf) => inf.username.toLowerCase() !== brand.toLowerCase())
        : all
    })
    const merged = deduplicateInfluencers(influencerLists)
    if (merged.length === 0) {
      alert(
        'No KOLs found in the scraped data.\n\nThis usually means the tagged page returned no posts from other users, or the account doesn\'t exist. Try a different URL or check the account on Instagram first.'
      )
      return
    }
    setFileNames(brandedResults.map(({ brand }) => brand))
    setInfluencers(merged)
    setStep('config')
  }

  const handleStart = async (cfg) => {
    setConfig(cfg)
    setStep('scoring')
    setProgress({ done: 0, total: influencers.length, error: null })

    const toScore = influencers.filter(
      (inf) => inf.avgLikes >= (cfg.minEngagement || 0)
    )
    setProgress((p) => ({ ...p, total: toScore.length }))

    try {
      const allResults = []
      const batchSize = 5
      for (let i = 0; i < toScore.length; i += batchSize) {
        const batch = toScore.slice(i, i + batchSize)
        const scored = await scoreInfluencers(batch, cfg)
        allResults.push(...scored)
        setProgress((p) => ({ ...p, done: Math.min(i + batchSize, toScore.length) }))
      }
      setResults(allResults)
      setStep('results')
      saveSession({ fileNames, config: cfg, results: allResults, influencers })
    } catch (err) {
      setProgress((p) => ({ ...p, error: err.message }))
    }
  }

  function Sidebar() {
    return (
      <aside
        style={{ width: 220, minWidth: 220 }}
        className="flex flex-col h-screen sticky top-0 border-r border-mist bg-paper shrink-0"
      >
        <div className="px-5 py-4 border-b border-mist">
          <span className="font-mono text-xs tracking-widest text-ink/30 uppercase">Seeding Tool</span>
        </div>

        <nav className="flex-1 px-3 py-3 flex flex-col gap-0.5">
          {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setMode(id)}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all text-left w-full ${
                mode === id
                  ? 'bg-accent/10 text-accent'
                  : 'text-ink/50 hover:text-ink hover:bg-mist/60'
              }`}
            >
              <Icon size={16} strokeWidth={mode === id ? 2 : 1.5} />
              {label}
            </button>
          ))}
        </nav>

        <div className="px-3 py-3 border-t border-mist flex flex-col gap-0.5">
          <button
            onClick={() => setMode('help')}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all text-left w-full ${
              mode === 'help'
                ? 'bg-accent/10 text-accent'
                : 'text-ink/50 hover:text-ink hover:bg-mist/60'
            }`}
          >
            <HelpCircle size={16} strokeWidth={mode === 'help' ? 2 : 1.5} />
            Help
          </button>
          <a
            href="/kol-finder/flowchart.html"
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-3 px-3 py-2 text-sm text-ink/30 hover:text-ink/60 transition-colors font-mono"
          >
            how it works ↗
          </a>
          <div className="px-3 pt-2 pb-1 text-xs text-ink/25 font-mono">
            markato.com
          </div>
        </div>
      </aside>
    )
  }

  function SeederContent() {
    if (step === 'scoring') {
      const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0
      return (
        <div className="flex-1 flex flex-col items-center justify-center px-6 py-20">
          <div className="max-w-sm w-full text-center">
            <p className="font-mono text-xs tracking-widest text-ink/40 uppercase mb-6">Scoring accounts</p>
            {progress.error ? (
              <div className="text-rose text-sm mb-4">
                <p className="font-medium mb-1">Error</p>
                <p className="text-ink/60 text-xs">{progress.error}</p>
                <button
                  onClick={() => setStep('config')}
                  className="mt-4 px-4 py-2 bg-ink text-white rounded-lg text-sm"
                >
                  Back to config
                </button>
              </div>
            ) : (
              <>
                <div className="w-full h-1.5 bg-mist rounded-full overflow-hidden mb-3">
                  <div
                    className="h-full bg-accent rounded-full transition-all duration-300"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="font-mono text-sm text-ink/60">
                  {progress.done} / {progress.total} accounts
                </p>
                <p className="text-xs text-ink/30 mt-1">
                  Analysing captions, hashtags, and engagement signals...
                </p>
              </>
            )}
          </div>
        </div>
      )
    }
    if (step === 'upload') return <UploadStep onFiles={handleFiles} onScrapedItems={handleScrapedItems} />
    if (step === 'config') return (
      <ConfigStep
        fileNames={fileNames}
        influencerCount={influencers.length}
        onStart={handleStart}
      />
    )
    if (step === 'results') return (
      <ResultsStep
        results={results}
        influencers={influencers}
        config={config}
      />
    )
    return null
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 overflow-auto flex flex-col">
        {mode === 'dashboard' && <InstructionsPage />}
        {mode === 'help' && <InstructionsPage />}
        {mode === 'history' && (
          <HistoryPage onLoadSeederSession={handleLoadSeederSession} />
        )}
        {mode === 'seeder' && <SeederContent />}
      </main>
    </div>
  )
}
