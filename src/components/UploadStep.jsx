import { useRef, useState } from 'react'
import { Upload, FileSpreadsheet, X, ChevronRight, Link2, Loader2, AlertCircle } from 'lucide-react'
import { startSeederScrape, startThreadsSeederScrape, startThreadsProfileScrape, pollUntilDone, getDatasetItems } from '../lib/apifyApi'
import { buildThreadsEnrichment } from '../lib/parseXlsx'

const RESULT_LIMITS = [100, 200, 500, 1000]

// Threads quality funnel. Keyword search — especially the recent-sort fallback —
// surfaces plenty of ordinary users venting about a pain point, not creators.
// Gate 1 (pre-enrichment): the account's best discovered post must clear a small
// likes floor; also saves enrichment cost. Gate 2 (post-enrichment): the profile
// must show a real audience and an engagement pulse across its recent posts.
const THREADS_MIN_DISCOVERY_LIKES = 10
const THREADS_MIN_FOLLOWERS = 500
const THREADS_MIN_MEDIAN_LIKES = 2

// Instagram path segments that are not usernames — they appear in post/reel/
// explore URLs (e.g. /p/ABC, /reel/ABC, /explore/tags/x) and must never be
// treated as a brand handle.
const RESERVED_IG_SEGMENTS = new Set(['p', 'reel', 'reels', 'explore', 'tv', 'stories'])

// Group input lines by brand. Each distinct instagram.com/username gets its
// own group so we can run parallel Apify jobs and label results correctly.
// Hashtags and post URLs with no clear profile owner go into a shared group.
function parseBrandGroups(inputText) {
  const lines = inputText.split('\n').map((l) => l.trim()).filter(Boolean)
  const map = new Map() // brand key → { brand, lines }
  for (const line of lines) {
    const match = line.match(/instagram\.com\/([^/?#]+)/)
    const handle = match ? match[1] : null
    const brand = handle && !RESERVED_IG_SEGMENTS.has(handle.toLowerCase()) ? handle : null
    const key = brand ?? '__misc__'
    if (!map.has(key)) map.set(key, { brand, lines: [] })
    map.get(key).lines.push(line)
  }
  return [...map.values()]
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

export default function UploadStep({ onFiles, onScrapedItems }) {
  const [tab, setTab] = useState('upload') // 'upload' | 'scrape'

  // Upload tab state
  const inputRef = useRef(null)
  const [files, setFiles] = useState([])
  const [parsing, setParsing] = useState(false)

  // Scrape tab state
  const [platforms, setPlatforms] = useState({ instagram: true, threads: false })
  const [scrapeInput, setScrapeInput] = useState('')
  // Threads keyword tracks (one term per line). Pain-point = problems the
  // product solves (掉髮); genre = recurring content habits (olive young).
  const [painpointInput, setPainpointInput] = useState('')
  const [genreInput, setGenreInput] = useState('')
  const [resultsLimit, setResultsLimit] = useState(200)
  const [scrapeStatus, setScrapeStatus] = useState('idle') // idle | running | error
  const [scrapeError, setScrapeError] = useState(null)

  const parseTerms = (text) => [...new Set(text.split('\n').map((l) => l.trim()).filter(Boolean))]

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

  // Guard against double-clicks kicking off two parses of the same files.
  const handleParse = async () => {
    if (parsing) return
    setParsing(true)
    try {
      await onFiles(files)
    } finally {
      setParsing(false)
    }
  }

  // Scrape handler — runs one Apify job per brand sequentially to avoid
  // hitting Apify's concurrent-run limit (most plans allow 1 at a time).
  // Threads is one extra job covering all keyword terms — each returned post
  // carries `search_keyword`, so per-term/track provenance survives one run.
  const handleScrape = async () => {
    const groups = platforms.instagram ? parseBrandGroups(scrapeInput) : []
    const painTerms = platforms.threads ? parseTerms(painpointInput) : []
    const genreTerms = platforms.threads ? parseTerms(genreInput) : []
    const threadsTerms = [...painTerms, ...genreTerms]
    if (groups.length === 0 && threadsTerms.length === 0) return
    setScrapeStatus('running')
    setScrapeError(null)

    // Run each brand independently so a later failure never discards the
    // earlier (already-paid) results.
    const brandedResults = []
    const failedBrands = []
    // Informational (non-failure) messages surfaced once before hand-off,
    // e.g. the Threads quality-funnel counts — useful for tuning thresholds.
    const notices = []
    for (const { brand, lines } of groups) {
      try {
        const run = await startSeederScrape(lines, resultsLimit)
        const completed = await pollUntilDone(run)
        const items = await getDatasetItems(completed.defaultDatasetId)
        brandedResults.push({ items, brand: brand || 'scraped' })
      } catch (err) {
        failedBrands.push(brand || 'scraped')
        console.error(`Scrape failed for ${brand || 'scraped'}:`, err)
      }
    }

    if (threadsTerms.length > 0) {
      const trackByTerm = {}
      for (const t of painTerms) trackByTerm[t] = 'painpoint'
      for (const t of genreTerms) trackByTerm[t] = 'genre'
      // One Apify run per term. Threads rate-limits multi-keyword sessions, so
      // a single blocked term must not sink the whole batch; and even a run
      // that ends FAILED has usually pushed the posts it did fetch, so we read
      // the dataset regardless (allowPartial) and keep whatever came back.
      // Each item carries `search_keyword`, so combining terms into one batch
      // preserves per-term/track provenance.
      const threadsItems = []
      const failedTerms = []
      // Discovery = keyword search via igview-owner. Attempt 1 sorts by 'top' —
      // Meta's own engagement ranking, which does the pre-qualification that
      // brand tagged pages do on IG. Attempt 2 falls back to 'recent' if top
      // failed or came back empty; a fresh run also gets a fresh proxy IP, which
      // recovers most transient search blocks. Recent-sort has no quality
      // ranking, so it gets a lower per-term cap — depth only adds noise there.
      // Each item is stamped with its query so provenance survives (the search
      // actor doesn't echo the keyword back).
      const THREADS_SORTS = ['top', 'recent']
      for (const term of threadsTerms) {
        let got = null
        for (let attempt = 0; attempt < THREADS_SORTS.length && !got; attempt++) {
          if (attempt > 0) await new Promise((r) => setTimeout(r, 4000))
          const sort = THREADS_SORTS[attempt]
          const cap = sort === 'recent' ? Math.min(resultsLimit, 50) : resultsLimit
          try {
            const run = await startThreadsSeederScrape(term, cap, sort)
            const completed = await pollUntilDone(run, { allowPartial: true })
            const items = await getDatasetItems(completed.defaultDatasetId)
            if (items.length > 0) got = items.map((it) => ({ ...it, search_keyword: term }))
          } catch (err) {
            console.error(`Threads search failed for "${term}" (sort=${sort}, attempt ${attempt + 1}/${THREADS_SORTS.length}):`, err)
          }
        }
        if (got) threadsItems.push(...got)
        else failedTerms.push(term)
      }

      if (threadsItems.length > 0) {
        // Gate 1 (pre-enrichment): keep only accounts whose best discovered
        // post cleared the likes floor. Reposts don't count — not the author's
        // content. Never let the gate zero out a paid run: if nothing clears
        // the floor, keep everything and let scoring sort it out.
        const bestLikes = {}
        for (const it of threadsItems) {
          if (it.is_repost === true || !it.username) continue
          const likes = Number(it.like_count ?? it.likeCount)
          if (isNaN(likes)) continue
          bestLikes[it.username] = Math.max(bestLikes[it.username] ?? 0, likes)
        }
        const discoveredCount = Object.keys(bestLikes).length
        let kept = new Set(Object.keys(bestLikes).filter((u) => bestLikes[u] >= THREADS_MIN_DISCOVERY_LIKES))
        if (kept.size === 0) kept = new Set(Object.keys(bestLikes))
        const afterLikesGate = kept.size
        let gatedItems = threadsItems.filter((it) => kept.has(it.username))

        // Follower count + median likes/comments/views come ONLY from this
        // profile-enrichment run (the search actor returns none of them), so
        // scrape each surviving handle's profile (futurizerush user mode).
        // Retry once with a fresh run if it fails/returns nothing — Meta blocks
        // user mode occasionally too. If it still comes back empty, the accounts
        // still import (just without follower/median stats) and we tell the user
        // rather than leaving a silent blank.
        let enrichByUser = {}
        const handles = [...kept]
        for (let attempt = 0; attempt < 2 && Object.keys(enrichByUser).length === 0; attempt++) {
          if (attempt > 0) await new Promise((r) => setTimeout(r, 4000))
          try {
            const run = await startThreadsProfileScrape(handles)
            const completed = await pollUntilDone(run, { allowPartial: true })
            const profileItems = await getDatasetItems(completed.defaultDatasetId)
            enrichByUser = buildThreadsEnrichment(profileItems)
          } catch (err) {
            console.error(`Threads profile enrichment failed (attempt ${attempt + 1}/2):`, err)
          }
        }
        if (Object.keys(enrichByUser).length === 0) {
          failedBrands.push('Threads follower counts + median views (profile lookup was blocked by Meta — accounts still imported, just without those stats; re-run to fill them in)')
        } else {
          // Gate 2 (post-enrichment): drop accounts with too small an audience
          // or no engagement pulse across their recent posts. Only judged where
          // enrichment returned data — a handle the profile run missed keeps the
          // benefit of the doubt. Same never-zero-out rule as gate 1.
          const dropped = [...kept].filter((u) => {
            const e = enrichByUser[u]
            if (!e) return false
            if (e.followerCount != null && e.followerCount < THREADS_MIN_FOLLOWERS) return true
            if (e.medianLikes != null && e.medianLikes < THREADS_MIN_MEDIAN_LIKES) return true
            return false
          })
          if (dropped.length > 0 && dropped.length < kept.size) {
            for (const u of dropped) kept.delete(u)
            gatedItems = gatedItems.filter((it) => kept.has(it.username))
          }
        }

        const funnel = `Threads quality funnel: ${discoveredCount} accounts discovered → ${afterLikesGate} cleared the post-likes gate (≥${THREADS_MIN_DISCOVERY_LIKES} likes) → ${kept.size} after follower (≥${THREADS_MIN_FOLLOWERS}) + engagement filters.`
        console.info(funnel)
        if (kept.size < discoveredCount) notices.push(funnel)

        brandedResults.push({ items: gatedItems, platform: 'threads', trackByTerm, enrichByUser, brand: 'threads' })
      }
      if (failedTerms.length > 0) {
        failedBrands.push(`Threads terms with no results (Meta may have rate-limited search — retry in a few minutes): ${failedTerms.join(', ')}`)
      }
    }

    if (brandedResults.length === 0) {
      setScrapeError(
        failedBrands.length > 0
          ? `Scrape failed for ${failedBrands.join(', ')}.`
          : 'No results were scraped.'
      )
      setScrapeStatus('error')
      return
    }

    // At least one brand succeeded — never drop those paid results. Surface any
    // partial failures before handing the results off.
    if (failedBrands.length > 0) {
      alert(
        `Some brands failed to scrape and were skipped: ${failedBrands.join(', ')}.\n` +
        'Continuing with the results that succeeded.'
      )
    }
    if (notices.length > 0) alert(notices.join('\n'))
    setScrapeStatus('idle')
    onScrapedItems(brandedResults)
  }

  const isLoading = scrapeStatus === 'running'

  return (
    <div className="px-8 py-8">
      <div className="max-w-[720px]">
        <StepProgress current={1} />
        <div className="mb-8">
          <h1 className="text-[34px] font-serif font-bold tracking-[0.02em] text-ink mb-2">Get your dataset</h1>
          <p className="text-muted text-[14px]">
            Have an existing Apify export? Upload it. Starting a new scrape? Paste URLs or hashtags directly.
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-1 bg-[#E9E4D9] rounded-[11px] p-1 mb-6">
          {[
            { id: 'upload', label: 'Upload XLSX' },
            { id: 'scrape', label: 'Scrape URLs / Hashtags' },
          ].map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex-1 py-2 rounded-[8px] text-[13.5px] font-medium transition-all ${
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
              className="border-2 border-dashed rounded-[18px] p-10 cursor-pointer transition-all bg-[#FBF9F4] border-[#DDD6C7] hover:border-ink/40 hover:bg-surface"
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
                  <div key={f.name} className="flex items-center justify-between px-3 py-2 bg-white border border-card-edge rounded-[10px]">
                    <div className="flex items-center gap-2 min-w-0">
                      <FileSpreadsheet size={14} className="text-muted flex-shrink-0" />
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
                onClick={handleParse}
                disabled={parsing}
                className="mt-5 w-full flex items-center justify-center gap-2 py-3 rounded-[12px] font-semibold text-[13.5px] bg-ink text-white hover:bg-ink/80 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {parsing ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Parsing…
                  </>
                ) : (
                  <>
                    Parse {files.length} file{files.length > 1 ? 's' : ''}
                    <ChevronRight size={16} />
                  </>
                )}
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

            {/* Platform selector */}
            <div className="flex items-center gap-2 mb-5">
              <span className="text-[10px] font-mono text-faint uppercase tracking-[.14em] whitespace-nowrap">Platforms</span>
              {[
                { id: 'instagram', label: 'Instagram' },
                { id: 'threads', label: 'Threads' },
              ].map(({ id, label }) => (
                <button
                  key={id}
                  onClick={() => setPlatforms((p) => ({ ...p, [id]: !p[id] }))}
                  disabled={isLoading}
                  className={`px-3 py-1 rounded-[8px] text-[12px] font-mono border transition-all ${
                    platforms[id]
                      ? 'bg-ink text-white border-ink'
                      : 'border-mist text-muted hover:border-ink/30'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {platforms.instagram && (
              <div className="mb-4">
                <p className="text-[13px] text-muted mb-3 leading-relaxed">
                  <span className="font-semibold text-body">Instagram</span> — paste one entry per line: competitor post URLs, hashtag explore pages, brand tagged pages, or hashtags (e.g. <span className="font-mono text-body">#skincare</span> or <span className="font-mono text-body">skincare</span>).
                </p>
                <textarea
                  value={scrapeInput}
                  onChange={(e) => setScrapeInput(e.target.value)}
                  disabled={isLoading}
                  rows={6}
                  placeholder={`https://www.instagram.com/p/ABC123/\nhttps://www.instagram.com/brandname/tagged/\n#skincare\n#beauty`}
                  className="w-full px-3 py-2.5 border border-mist rounded-[10px] text-sm text-ink font-mono bg-white focus:outline-none focus:border-ink/30 resize-none placeholder:text-faint disabled:opacity-50"
                />
              </div>
            )}

            {platforms.threads && (
              <div className="mb-4">
                <p className="text-[13px] text-muted mb-3 leading-relaxed">
                  <span className="font-semibold text-body">Threads</span> — searches by keyword (Threads has no tagged pages). One term per line; keep each term simple — compound queries like <span className="font-mono text-body">olive young 好物</span> often return nothing.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-mono text-faint uppercase tracking-[.14em] mb-1.5">Pain-point keywords</label>
                    <textarea
                      value={painpointInput}
                      onChange={(e) => setPainpointInput(e.target.value)}
                      disabled={isLoading}
                      rows={4}
                      placeholder={`掉髮\n敏感頭皮\n油性頭皮`}
                      className="w-full px-3 py-2.5 border border-mist rounded-[10px] text-sm text-ink font-mono bg-white focus:outline-none focus:border-ink/30 resize-none placeholder:text-faint disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-mono text-faint uppercase tracking-[.14em] mb-1.5">Content-genre keywords</label>
                    <textarea
                      value={genreInput}
                      onChange={(e) => setGenreInput(e.target.value)}
                      disabled={isLoading}
                      rows={4}
                      placeholder={`olive young\n好物分享`}
                      className="w-full px-3 py-2.5 border border-mist rounded-[10px] text-sm text-ink font-mono bg-white focus:outline-none focus:border-ink/30 resize-none placeholder:text-faint disabled:opacity-50"
                    />
                  </div>
                </div>
                <p className="mt-1.5 text-[11px] text-faint leading-relaxed">
                  Pain-point = problems your product solves. Content-genre = posting habits to catch (good-finds roundups, trends you spot on Threads).
                </p>
              </div>
            )}

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
              <span className="text-[12px] text-faint">~${(resultsLimit * 0.005).toFixed(2)} per brand</span>
            </div>

            {(() => {
              const groups = platforms.instagram && scrapeInput.trim() ? parseBrandGroups(scrapeInput) : []
              const brands = groups.map(g => g.brand).filter(Boolean)
              const terms = platforms.threads ? [...parseTerms(painpointInput), ...parseTerms(genreInput)] : []
              const jobs = groups.length + (terms.length ? 1 : 0)
              if (jobs === 0) return null
              return (
                <div className="mb-4 px-3 py-2 bg-surface border border-card-edge rounded-[10px]">
                  <p className="text-[12px] text-faint mb-1">
                    {jobs} scrape job{jobs > 1 ? 's' : ''} · ~${(groups.length * resultsLimit * 0.005 + terms.length * resultsLimit * 0.003).toFixed(2)} total
                  </p>
                  {(brands.length > 0 || terms.length > 0) && (
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {brands.map(b => (
                        <span key={b} className="font-mono text-[11px] bg-white border border-card-edge px-2 py-0.5 rounded-[6px] text-body">{b}</span>
                      ))}
                      {terms.map(t => (
                        <span key={t} className="font-mono text-[11px] bg-white border border-card-edge px-2 py-0.5 rounded-[6px] text-body">🧵 {t}</span>
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
              disabled={
                isLoading ||
                ((!platforms.instagram || !scrapeInput.trim()) &&
                  (!platforms.threads || !(painpointInput.trim() || genreInput.trim())))
              }
              className="w-full flex items-center justify-center gap-2 py-3 rounded-[12px] font-semibold text-[13.5px] bg-ink text-white hover:bg-ink/80 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {isLoading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Scraping {[platforms.instagram && scrapeInput.trim() && 'Instagram', platforms.threads && (painpointInput.trim() || genreInput.trim()) && 'Threads'].filter(Boolean).join(' + ')}…
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

        <p className="mt-6 text-[11px] text-faint font-mono">
          Scrapers via Apify: Instagram Scraper · Threads Scraper (keyword search) · Post-level export
        </p>
      </div>
    </div>
  )
}
