import { useState } from 'react'
import UploadStep from './components/UploadStep'
import ConfigStep from './components/ConfigStep'
import ResultsStep from './components/ResultsStep'
import KolLookup from './components/KolLookup'
import InstructionsPage from './components/InstructionsPage'
import { parseApifyXlsx } from './lib/parseXlsx'
import { scoreInfluencers } from './lib/scoreInfluencers'
import { saveSession, loadHistory, deleteSession } from './lib/sessionHistory'

export default function App() {
  const [mode, setMode] = useState('finder') // finder | lookup | instructions
  const [step, setStep] = useState('upload') // upload | config | scoring | results
  const [fileNames, setFileNames] = useState([])
  const [influencers, setInfluencers] = useState([])
  const [results, setResults] = useState([])
  const [config, setConfig] = useState(null)
  const [progress, setProgress] = useState({ done: 0, total: 0, error: null })

  const handleLoadSession = (session) => {
    setFileNames(session.fileNames)
    setConfig(session.config)
    setInfluencers(session.influencers)
    setResults(session.results)
    setStep('results')
  }

  const handleDeleteSession = (id) => {
    deleteSession(id)
  }

  const handleFiles = async (files) => {
    setFileNames(files.map((f) => f.name))
    try {
      const allParsed = await Promise.all(files.map((f) => parseApifyXlsx(f)))
      // Merge and deduplicate by username, keeping highest engagement version
      const merged = {}
      for (const batch of allParsed) {
        for (const inf of batch) {
          const existing = merged[inf.username]
          if (!existing || inf.totalEngagement > existing.totalEngagement) {
            merged[inf.username] = inf
          }
        }
      }
      const deduplicated = Object.values(merged).sort((a, b) => b.totalEngagement - a.totalEngagement)
      setInfluencers(deduplicated)
      setStep('config')
    } catch (err) {
      alert('Failed to parse file(s): ' + err.message)
    }
  }

  const handleStart = async (cfg) => {
    setConfig(cfg)
    setStep('scoring')
    setProgress({ done: 0, total: influencers.length, error: null })

    // Filter by min engagement first
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

  // Scoring progress screen
  if (step === 'scoring') {
    const pct = progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6">
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

  return (
    <>
      {/* Top nav */}
      <div className="border-b border-mist px-6 py-3 flex items-center gap-4">
        <span className="font-mono text-xs tracking-widest text-ink/30 uppercase">Seeding Tool</span>
        <div className="flex items-center gap-1 bg-mist/60 rounded-lg p-1">
          <button
            onClick={() => setMode('finder')}
            className={`px-4 py-1.5 rounded text-sm font-medium transition-all ${
              mode === 'finder' ? 'bg-white text-ink shadow-sm' : 'text-ink/50 hover:text-ink'
            }`}
          >
            Seeder
          </button>
          <button
            onClick={() => setMode('lookup')}
            className={`px-4 py-1.5 rounded text-sm font-medium transition-all ${
              mode === 'lookup' ? 'bg-white text-ink shadow-sm' : 'text-ink/50 hover:text-ink'
            }`}
          >
            Profile Lookup
          </button>
          <button
            onClick={() => setMode('instructions')}
            className={`px-4 py-1.5 rounded text-sm font-medium transition-all ${
              mode === 'instructions' ? 'bg-white text-ink shadow-sm' : 'text-ink/50 hover:text-ink'
            }`}
          >
            Instructions
          </button>
        </div>
        <a
          href="/kol-finder/flowchart.html"
          target="_blank"
          rel="noreferrer"
          className="ml-auto text-xs text-ink/30 hover:text-ink/60 transition-colors font-mono"
        >
          how it works ↗
        </a>
      </div>

      {mode === 'instructions' ? (
        <InstructionsPage />
      ) : mode === 'lookup' ? (
        <KolLookup />
      ) : (
        <>
          {step === 'upload' && <UploadStep onFiles={handleFiles} onLoadSession={handleLoadSession} onDeleteSession={handleDeleteSession} />}
          {step === 'config' && (
            <ConfigStep
              fileNames={fileNames}
              influencerCount={influencers.length}
              onStart={handleStart}
            />
          )}
          {step === 'results' && (
            <ResultsStep
              results={results}
              influencers={influencers}
              config={config}
            />
          )}
        </>
      )}
    </>
  )
}
