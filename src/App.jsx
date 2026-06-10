import { useState } from 'react'
import UploadStep from './components/UploadStep'
import ConfigStep from './components/ConfigStep'
import ResultsStep from './components/ResultsStep'
import { parseApifyXlsx } from './lib/parseXlsx'
import { scoreInfluencers } from './lib/scoreInfluencers'

export default function App() {
  const [step, setStep] = useState('upload') // upload | config | scoring | results
  const [file, setFile] = useState(null)
  const [influencers, setInfluencers] = useState([])
  const [results, setResults] = useState([])
  const [config, setConfig] = useState(null)
  const [progress, setProgress] = useState({ done: 0, total: 0, error: null })

  const handleFile = async (f) => {
    setFile(f)
    try {
      const parsed = await parseApifyXlsx(f)
      setInfluencers(parsed)
      setStep('config')
    } catch (err) {
      alert('Failed to parse file: ' + err.message)
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
        const scored = await scoreInfluencers(batch, cfg, cfg.apiKey)
        allResults.push(...scored)
        setProgress((p) => ({ ...p, done: Math.min(i + batchSize, toScore.length) }))
      }
      setResults(allResults)
      setStep('results')
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
                Claude is analysing captions, hashtags, and engagement signals...
              </p>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <>
      {step === 'upload' && <UploadStep onFile={handleFile} />}
      {step === 'config' && (
        <ConfigStep
          fileName={file?.name}
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
  )
}
