import { useRef, useState } from 'react'
import { Upload, FileSpreadsheet, X, ChevronRight, Link2, Loader2, AlertCircle } from 'lucide-react'
import { startSeederScrape, pollUntilDone, getDatasetItems } from '../lib/apifyApi'

const RESULT_LIMITS = [100, 200, 500, 1000]

// Group input lines by brand. Each distinct instagram.com/username gets its
// own group so we can run parallel Apify jobs and label results correctly.
// Hashtags and post URLs with no clear profile owner go into a shared group.
function parseBrandGroups(inputText) {
  const lines = inputText.split('\n').map((l) => l.trim()).filter(Boolean)
  const map = new Map() // brand key → { brand, lines }
  for (const line of lines) {
    const match = line.match(/instagram\.com\/([^/?#]+)/)
    const brand = match ? match[1] : null
    const key = brand ?? '__misc__'
    if (!map.has(key)) map.set(key, { brand, lines: [] })
    map.get(key).lines.push(line)
  }
  return [...map.values()]
}

export default function UploadStep({ onFiles, onScrapedItems }) {
  const [tab, setTab] = useState('upload') // 'upload' | 'scrape'

  // Upload tab state
  const inputRef = useRef(null)
  const [files, setFiles] = useState([])

  // Scrape tab state
  const [scrapeInput, setScrapeInput] = useState('')
  const [resultsLimit, setResultsLimit] = useState(200)
  const [scrapeStatus, setScrapeStatus] = useState('idle') // idle | running | error
  const [scrapeError, setScrapeError] = useState(null)

  // Upload helpers
  const addFiles = (incoming) => {
    const valid = Array.from(incoming).filter((f) => {
      if (!f.name.endsWith('.xlsx')) {
        alert(`${f.name} is not an .xlsx file — skipped.`)
        return false
      }
      return true
    })
    setFiles((prev) => {
      const names = new Set(prev.map((f) => f.name))
      return [...prev, ...valid.filter((f) => !names.has(f.name))]
    })
  }

  const removeFile = (name) => setFiles((prev) => prev.filter((f) => f.name !== name))

  const handleDrop = (e) => {
    e.preventDefault()
    addFiles(e.dataTransfer.files)
  }

  // Scrape handler — runs one Apify job per brand sequentially to avoid
  // hitting Apify's concurrent-run limit (most plans allow 1 at a time).
  const handleScrape = async () => {
    const groups = parseBrandGroups(scrapeInput)
    if (groups.length === 0) return
    setScrapeStatus('running')
    setScrapeError(null)
    try {
      const brandedResults = []
      for (const { brand, lines } of groups) {
        const run = await startSeederScrape(lines, resultsLimit)
        const completed = await pollUntilDone(run)
        const items = await getDatasetItems(completed.defaultDatasetId)
        brandedResults.push({ items, brand: brand || 'scraped' })
      }
      setScrapeStatus('idle')
      onScrapedItems(brandedResults)
    } catch (err) {
      setScrapeError(err.message)
      setScrapeStatus('error')
    }
  }

  const isLoading = scrapeStatus === 'running'

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12">
      <div className="max-w-lg w-full">
        <div className="text-center mb-8">
          <p className="font-mono text-[10px] tracking-[.18em] text-faint uppercase mb-3">Step 1 of 3</p>
          <h1 className="text-[27px] font-bold tracking-[-0.02em] text-ink mb-2">Get your dataset</h1>
          <p className="text-muted text-[14px]">
            Have an existing Apify export? Upload it. Starting a new scrape? Paste URLs or hashtags directly.
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-[5px] bg-[#E9E4D9] rounded-[11px] p-[5px] mb-6">
          {[
            { id: 'upload', label: 'Upload XLSX' },
            { id: 'scrape', label: 'Scrape URLs / Hashtags' },
          ].map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex-1 py-[8px] rounded-[8px] text-[13.5px] font-medium transition-all ${
                tab === id ? 'bg-white text-ink shadow-sm font-semibold' : 'text-[#9A917F] hover:text-ink'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Upload tab */}
        {tab === 'upload' && (
          <>
            <p className="text-[12px] text-faint mb-4 text-center">
              Use this if you already ran a scrape in Apify Console and downloaded the .xlsx export.
            </p>
            <div
              className="border-2 border-dashed rounded-[18px] p-10 cursor-pointer transition-all bg-[#FBF9F4] border-[#DDD6C7] hover:border-accent hover:bg-[#FAF5EA]"
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault() }}
              onDrop={handleDrop}
            >
              <div className="flex flex-col items-center gap-3">
                <FileSpreadsheet size={32} className="text-faint" />
                <p className="text-[13.5px] text-muted">Click or drag .xlsx files here</p>
                <p className="text-[12px] text-faint">Multiple files supported</p>
              </div>
            </div>

            <input
              ref={inputRef}
              type="file"
              accept=".xlsx"
              multiple
              className="hidden"
              onChange={(e) => addFiles(e.target.files)}
            />

            {files.length > 0 && (
              <div className="mt-5 text-left space-y-2">
                {files.map((f) => (
                  <div key={f.name} className="flex items-center justify-between px-[12px] py-[10px] bg-white border border-card-edge rounded-[10px]">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileSpreadsheet size={14} className="text-accent flex-shrink-0" />
                      <span className="font-mono text-[12px] text-body truncate">{f.name}</span>
                    </div>
                    <button onClick={() => removeFile(f.name)} className="ml-2 text-faint hover:text-ink/60 flex-shrink-0">
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {files.length > 0 && (
              <button
                onClick={() => onFiles(files)}
                className="mt-5 w-full flex items-center justify-center gap-2 py-[13px] rounded-[12px] font-semibold text-[13.5px] bg-ink text-white hover:bg-ink/80 transition-all"
              >
                Parse {files.length} file{files.length > 1 ? 's' : ''}
                <ChevronRight size={16} />
              </button>
            )}
          </>
        )}

        {/* Scrape tab */}
        {tab === 'scrape' && (
          <>
            <p className="text-[12px] text-faint mb-4 text-center">
              Use this to kick off a fresh scrape right now — no manual Apify steps needed.
            </p>
            <div className="mb-4">
              <p className="text-[13px] text-muted mb-3 leading-relaxed">
                Paste one entry per line — competitor post URLs, hashtag explore pages, brand tagged pages, or hashtags (e.g. <span className="font-mono text-body">#skincare</span> or <span className="font-mono text-body">skincare</span>).
              </p>
              <textarea
                value={scrapeInput}
                onChange={(e) => setScrapeInput(e.target.value)}
                disabled={isLoading}
                rows={6}
                placeholder={`https://www.instagram.com/p/ABC123/\nhttps://www.instagram.com/brandname/tagged/\n#skincare\n#beauty`}
                className="w-full px-3 py-2.5 border border-mist rounded-[10px] text-sm text-ink font-mono bg-white focus:outline-none focus:border-accent resize-none placeholder:text-faint disabled:opacity-50"
              />
            </div>

            <div className="flex items-center gap-3 mb-5">
              <label className="text-[10px] font-mono text-faint uppercase tracking-[.14em] whitespace-nowrap">Max results</label>
              <div className="flex gap-1.5">
                {RESULT_LIMITS.map((n) => (
                  <button
                    key={n}
                    onClick={() => setResultsLimit(n)}
                    disabled={isLoading}
                    className={`px-3 py-1 rounded-[8px] text-[12px] font-mono border transition-all ${
                      resultsLimit === n
                        ? 'bg-ink text-white border-ink'
                        : 'border-mist text-muted hover:border-ink/30'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
              <span className="text-[12px] text-faint">~${(resultsLimit * 0.01).toFixed(0)} per brand</span>
            </div>

            {scrapeInput.trim() && (() => {
              const groups = parseBrandGroups(scrapeInput)
              const brands = groups.map(g => g.brand).filter(Boolean)
              return (
                <div className="mb-4 px-3 py-2 bg-surface border border-card-edge rounded-[10px]">
                  <p className="text-[12px] text-faint mb-1">
                    {groups.length} scrape job{groups.length > 1 ? 's' : ''} · ~${(groups.length * resultsLimit * 0.01).toFixed(0)} total
                  </p>
                  {brands.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {brands.map(b => (
                        <span key={b} className="font-mono text-[11px] bg-white border border-card-edge px-2 py-0.5 rounded-[6px] text-body">{b}</span>
                      ))}
                    </div>
                  )}
                </div>
              )
            })()}

            {scrapeStatus === 'error' && (
              <div className="flex items-start gap-3 px-4 py-3 bg-rose/5 border border-rose/20 rounded-[12px] text-sm mb-4">
                <AlertCircle size={15} className="text-rose shrink-0 mt-0.5" />
                <p className="text-body text-[12px]">{scrapeError}</p>
              </div>
            )}

            <button
              onClick={handleScrape}
              disabled={isLoading || !scrapeInput.trim()}
              className="w-full flex items-center justify-center gap-2 py-[13px] rounded-[12px] font-semibold text-[13.5px] bg-ink text-white hover:bg-ink/80 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Scraping Instagram…
                </>
              ) : (
                <>
                  <Link2 size={16} />
                  Start scrape
                </>
              )}
            </button>

            {isLoading && (
              <p className="mt-3 text-[12px] text-faint text-center">
                This usually takes 1–5 minutes depending on result count.
              </p>
            )}
          </>
        )}

        <p className="mt-6 text-[11px] text-faint font-mono text-center">
          Scraper: Instagram Scraper by Apify · Post-level export
        </p>
      </div>
    </div>
  )
}
