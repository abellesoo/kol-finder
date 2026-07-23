import {
  startSeederScrape, startThreadsSeederScrape, fetchThreadsProfileItems,
  pollUntilDone, getDatasetItems, runWithConcurrency,
} from './apifyApi'
import { buildThreadsEnrichment } from './parseXlsx'

// ── Seeder scrape orchestration ──────────────────────────────────────────────
// Lifted verbatim from UploadStep so a run can be launched from a campaign's
// saved targets (default_step1) WITHOUT the form. Given { platforms, scrapeInput,
// painpointInput, genreInput, resultsLimit } it runs the Apify jobs (IG + Threads
// in parallel, bounded concurrency), applies the Threads quality funnel, and
// returns { brandedResults, failedBrands, notices }. The caller aggregates
// brandedResults into influencers and surfaces failedBrands/notices.

const SCRAPE_CONCURRENCY = 3
const THREADS_MIN_DISCOVERY_LIKES = 10
const THREADS_MIN_FOLLOWERS = 500
const THREADS_MIN_MEDIAN_LIKES = 2

const RESERVED_IG_SEGMENTS = new Set(['p', 'reel', 'reels', 'explore', 'tv', 'stories'])

// Group input lines by brand — one Apify job per distinct instagram.com/username.
export function parseBrandGroups(inputText) {
  const lines = String(inputText || '').split('\n').map((l) => l.trim()).filter(Boolean)
  const map = new Map()
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

export function parseTerms(text) {
  return [...new Set(String(text || '').split('\n').map((l) => l.trim()).filter(Boolean))]
}

// Returns { brandedResults, failedBrands, notices }. Never throws for a partial
// failure — a brand/term that fails is recorded in failedBrands and the rest
// proceed, so already-paid results are never discarded. onProgress(text) reports
// the live status line.
export async function runSeederScrape(
  { platforms = {}, scrapeInput = '', painpointInput = '', genreInput = '', resultsLimit = 200 } = {},
  { onProgress } = {}
) {
  const groups = platforms.instagram ? parseBrandGroups(scrapeInput) : []
  const painTerms = platforms.threads ? parseTerms(painpointInput) : []
  const genreTerms = platforms.threads ? parseTerms(genreInput) : []
  const threadsTerms = [...painTerms, ...genreTerms]

  const report = (text) => { if (onProgress) onProgress(text) }
  if (groups.length === 0 && threadsTerms.length === 0) {
    return { brandedResults: [], failedBrands: [], notices: [] }
  }

  const prog = { igDone: 0, igTotal: groups.length, tDone: 0, tTotal: threadsTerms.length, enrich: null }
  const renderProgress = () => {
    const parts = []
    if (prog.igTotal > 0) parts.push(`Instagram ${prog.igDone}/${prog.igTotal} brand${prog.igTotal > 1 ? 's' : ''}`)
    if (prog.tTotal > 0) parts.push(`Threads ${prog.tDone}/${prog.tTotal} term${prog.tTotal > 1 ? 's' : ''}`)
    if (prog.enrich) parts.push(prog.enrich)
    report(parts.join(' · '))
  }
  renderProgress()

  const brandedResults = []
  const failedBrands = []
  const notices = []

  // ── Instagram phase: one pooled task per brand ──
  const igPhase = runWithConcurrency(
    groups.map(({ brand, lines }) => async () => {
      try {
        const run = await startSeederScrape(lines, resultsLimit)
        const completed = await pollUntilDone(run)
        const items = await getDatasetItems(completed.defaultDatasetId)
        brandedResults.push({ items, brand: brand || 'scraped' })
      } catch (err) {
        failedBrands.push(brand || 'scraped')
        console.error(`Scrape failed for ${brand || 'scraped'}:`, err)
      } finally {
        prog.igDone++
        renderProgress()
      }
    }),
    SCRAPE_CONCURRENCY
  )

  // ── Threads phase: pooled keyword search, then enrichment + quality gates ──
  const threadsPhase = (async () => {
    if (threadsTerms.length === 0) return
    const trackByTerm = {}
    for (const t of painTerms) trackByTerm[t] = 'painpoint'
    for (const t of genreTerms) trackByTerm[t] = 'genre'
    const threadsItems = []
    const failedTerms = []
    const THREADS_SORTS = ['top', 'recent']
    await runWithConcurrency(
      threadsTerms.map((term) => async () => {
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
        prog.tDone++
        renderProgress()
      }),
      SCRAPE_CONCURRENCY
    )

    if (threadsItems.length > 0) {
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

      let enrichByUser = {}
      const handles = [...kept]
      try {
        const profileItems = await fetchThreadsProfileItems(handles, 10, (done, total) => {
          prog.enrich = `enriching Threads profiles ${done}/${total}`
          renderProgress()
        })
        enrichByUser = buildThreadsEnrichment(profileItems)
      } catch (err) {
        console.error('Threads profile enrichment failed:', err)
      } finally {
        prog.enrich = null
        renderProgress()
      }
      const enrichedCount = handles.filter((u) => enrichByUser[u]).length
      if (enrichedCount === 0) {
        failedBrands.push('Threads follower counts + median views (profile lookup was blocked by Meta — accounts still imported, just without those stats; re-run to fill them in)')
      } else {
        if (enrichedCount < handles.length) {
          notices.push(`Threads profile enrichment covered ${enrichedCount} of ${handles.length} accounts — the rest show no follower/median stats (Meta blocked those lookups; re-run to fill them in).`)
        }
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
  })()

  await Promise.all([igPhase, threadsPhase])
  return { brandedResults, failedBrands, notices }
}
