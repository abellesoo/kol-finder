import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { Download, ExternalLink, Info, Loader2, RefreshCw, Send, Check, Sparkles } from 'lucide-react'
import { exportToCsv } from '../lib/exportCsv'
import { TABLE_COLUMNS, ALWAYS_EXPORT_IDS } from '../lib/columnDefs'
import { useTableControls } from '../lib/useTableControls'
import { useUrlParam } from '../lib/useUrlParam'
import { loadColumnPrefs, saveColumnPrefs } from '../lib/columnPrefs'
import ColumnPicker from './table/ColumnPicker'
import ColumnHeaderCell from './table/ColumnHeaderCell'
import { fetchBatchStats, fetchThreadsProfileItems } from '../lib/apifyApi'
import { buildThreadsEnrichment } from '../lib/parseXlsx'
import { profileUrl } from '../lib/platforms'
import { fetchAiScores } from '../lib/aiScoring'
import { computeLiveEngagementScore, computeOverall } from '../lib/scoreInfluencers'
import { updateSessionLiveStats } from '../lib/sessionHistory'
import { supabase } from '../lib/supabase'
import TableErrorBoundary from './TableErrorBoundary'
import StepProgress from './core/StepProgress'

const COLUMN_INFO = {
  overall: {
    title: 'Overall Score (0–100)',
    lines: [
      '50% Engagement Score + 50% Relevancy Score.',
      'Each sub-score is 0–10; combined and scaled to 0–100.',
      'Capped at 40 when Relevancy < 3 (off-niche floor).',
      '· 70+ = strong match',
      '· 45–69 = possible',
      '· <45 = low fit',
    ],
  },
  relevancy: {
    title: 'Relevancy Score (0–10)',
    lines: [
      'Baseline 3. Adds 1 per keyword hit in your target niches.',
      'Your in-niche keywords and audience terms add 1.5 each; exclude keywords deduct 3 each.',
      'Deducts 1 per off-niche category that also has keyword hits; +1 for a location match.',
      'Scans captions, hashtags, and display name.',
      '· 8–10 = strong niche match',
      '· 5–7 = some relevant content',
      '· 0–4 = off-niche or diluted content mix',
    ],
  },
  engagement_score: {
    title: 'Engagement Score (0–10)',
    lines: [
      'Before live fetch: log(1 + avgLikes + avgComments×1.5) + log10(1 + followers)×0.5',
      'After live fetch:  log(1 + medianLikes + medianViews×0.8 + medianComments×1.5) + log10(1 + followers)×0.5',
      'The follower term is a bounded reach boost — bigger audiences help, but engagement still leads.',
      'Live data replaces the export estimate per account.',
      '· ~4 = micro (~50 likes)',
      '· ~6–7 = mid-tier (~500–1k likes)',
      '· ~9–10 = large (10k+ likes)',
    ],
  },
  ai_fit: {
    title: 'AI Fit (0–10)',
    lines: [
      'DeepSeek rates each account against your campaign brief and your',
      "team's own past approve/reject decisions (with reasons + ratings).",
      'Advisory by default — it does not move the Overall score unless you',
      'tick "Blend into Overall". Expand a row to see the reasoning.',
      'Populated after you click "Score fit with AI".',
    ],
  },
  live_median_likes: {
    title: 'Median Likes (live)',
    lines: [
      'Median like count across the 10 most recent posts or reels scraped live for this account.',
      'Uses only posts from the past 3 months where available.',
      'Falls back to all 10 scraped posts for accounts that post infrequently.',
      'Populated after a live Apify scrape — click Refresh to fetch.',
    ],
  },
  live_median_views: {
    title: 'Median Views (live)',
    lines: [
      'Median video view count across the 10 most recent posts or reels scraped live.',
      'Only video posts (Reels, clips) count — photo-only accounts show —.',
      'Uses only posts from the past 3 months where available.',
      'Populated after a live Apify scrape — click Refresh to fetch.',
    ],
  },
  live_median_comments: {
    title: 'Median Comments (live)',
    lines: [
      'Median comment count across the 10 most recent posts or reels scraped live.',
      'Includes both photo posts and video/Reels — any post with a comment count.',
      'Uses only posts from the past 3 months where available.',
      'Populated after a live Apify scrape — click Refresh to fetch.',
    ],
  },
}

function InfoTooltip({ column }) {
  const [pos, setPos] = useState(null)
  const btnRef = useRef(null)
  const info = COLUMN_INFO[column]
  if (!info) return null

  const show = () => {
    const r = btnRef.current?.getBoundingClientRect()
    if (r) setPos({ top: r.bottom + 8, left: r.left + r.width / 2 })
  }

  return (
    <span className="inline-flex items-center" onClick={(e) => e.stopPropagation()}>
      <button
        ref={btnRef}
        onMouseEnter={show}
        onMouseLeave={() => setPos(null)}
        className="text-ink/30 hover:text-ink transition-colors ml-0.5"
      >
        <Info size={11} />
      </button>
      {pos && (
        <div
          className="fixed w-64 bg-ink text-white text-xs rounded-xl px-4 py-3 shadow-xl z-50 pointer-events-none -translate-x-1/2"
          style={{ top: pos.top, left: pos.left }}
        >
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 border-4 border-transparent border-b-ink" />
          <p className="font-semibold mb-1.5 text-white/90">{info.title}</p>
          {info.lines.map((line, i) => (
            <p key={i} className={`leading-relaxed ${line.startsWith('·') ? 'text-white/60 pl-1' : 'text-white/75'}`}>
              {line}
            </p>
          ))}
        </div>
      )}
    </span>
  )
}

// TABLE_COLUMNS, ALWAYS_EXPORT_IDS imported from ../lib/columnDefs

const DM_STATUS_STYLES = {
  'not_sent':    'bg-ink/10 text-ink/50',
  'sent':        'bg-blue-100 text-blue-700',
  'replied':     'bg-green-100 text-green-700',
  'no_response': 'bg-rose/10 text-rose/70',
}
const DM_STATUS_LABELS = {
  'not_sent': 'Not sent',
  'sent': 'Sent',
  'replied': 'Replied',
  'no_response': 'No response',
}

function ScoreBadge({ score }) {
  const cls = score >= 70 ? 'score-high' : score >= 45 ? 'score-mid' : 'score-low'
  return <span className={`score-badge ${cls}`}>{score}</span>
}

function MiniBar({ value, max = 10, color = 'bg-accent' }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-[62px] h-[6px] bg-[#EDE8DC] rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${(value / max) * 100}%` }} />
      </div>
      <span className="font-mono text-[11px] text-faint">{value}</span>
    </div>
  )
}

function ResultsTable({ selectedColumns, filtered, expandedRow, setExpandedRow, sortId, sortDir, toggleSort, filters, setFilter, distinctValues, liveStats, liveStatus, aiStatus, reviewState, selectedAccounts, onToggleSelect, selectionMode }) {
  const visibleCols = TABLE_COLUMNS.filter((c) => selectedColumns.includes(c.id))
  // Extra leading column for checkbox when in selection mode
  const gridTemplate = selectionMode
    ? `2rem 2fr ${visibleCols.map((c) => c.width).join(' ')}`
    : `2fr ${visibleCols.map((c) => c.width).join(' ')}`

  const renderCell = (col, r) => {
    try {
      // liveStats is IG-only; a Threads row's stats are already merged onto r
      // (followerCount, liveMedian*) — never read a same-handle IG entry here.
      const s = r.platform === 'threads' ? undefined : liveStats[r.username]
      const rs = reviewState[r.username]
      switch (col.id) {
        case 'brand':
          return (
            <p className="font-mono text-xs text-ink/70 truncate">
              {r.platform === 'threads' ? '🧵 ' : ''}{r.sourceBrand || '—'}{r.sourceTrack ? ` · ${r.sourceTrack === 'painpoint' ? 'pain-point' : 'genre'}` : ''}
            </p>
          )
        case 'overall':
          return <ScoreBadge score={r.overall} />
        case 'relevancy_score':
          return <MiniBar value={r.scores?.relevancy ?? 0} color="bg-rose/70" />
        case 'follower_count': {
          const val = s?.followerCount ?? r.followerCount
          return <p className="font-mono text-sm text-ink">{val != null ? val.toLocaleString() : '—'}</p>
        }
        case 'account_location':
          return <p className="font-mono text-sm text-ink">{r.accountLocation || '—'}</p>
        case 'engagement_score':
          return <MiniBar value={r.scores?.engagement ?? 0} color="bg-ink/50" />
        case 'ai_fit': {
          if (aiStatus === 'loading' && r.aiScore == null) return <Loader2 size={11} className="animate-spin text-faint" />
          if (r.aiScore == null) return <p className="font-mono text-sm text-ink/30">—</p>
          return <span title={r.aiReason || ''}><MiniBar value={r.aiScore} color="bg-accent" /></span>
        }
        case 'live_median_likes': {
          if (liveStatus === 'loading' && !s) return <Loader2 size={11} className="animate-spin text-faint" />
          // Threads has no live fetch; r.liveMedianLikes carries its enrichment
          // median so the column populates without a fetch. IG unchanged.
          const v = s?.medianLikes ?? r.liveMedianLikes
          if (v != null) return <p className="font-mono text-sm text-ink">{v.toLocaleString()}</p>
          return <p className="font-mono text-sm text-ink/30">—</p>
        }
        case 'live_median_views': {
          if (liveStatus === 'loading' && !s) return <Loader2 size={11} className="animate-spin text-faint" />
          const v = s?.medianViews ?? r.liveMedianViews
          if (v != null) return <p className="font-mono text-sm text-ink">{v.toLocaleString()}</p>
          return <p className="font-mono text-sm text-ink/30">—</p>
        }
        case 'live_median_comments': {
          if (liveStatus === 'loading' && !s) return <Loader2 size={11} className="animate-spin text-faint" />
          const v = s?.medianComments ?? r.liveMedianComments
          if (v != null) return <p className="font-mono text-sm text-ink">{v.toLocaleString()}</p>
          return <p className="font-mono text-sm text-ink/30">—</p>
        }
        case 'sample_post_url':
          return r.samplePostUrl ? (
            <a href={r.samplePostUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1 font-mono text-xs text-body hover:underline">
              View <ExternalLink size={10} />
            </a>
          ) : <p className="font-mono text-sm text-ink/30">—</p>
        case 'scraped_post_likes':
          return <p className="font-mono text-sm text-ink">{r.samplePostLikes != null ? r.samplePostLikes.toLocaleString() : '—'}</p>
        case 'scraped_post_comments':
          return <p className="font-mono text-sm text-ink">{r.samplePostComments != null ? r.samplePostComments.toLocaleString() : '—'}</p>
        case 'scraped_post_plays':
          return <p className="font-mono text-sm text-ink">{r.samplePostPlays != null ? r.samplePostPlays.toLocaleString() : '—'}</p>
        case 'bio':
          return <p className="text-xs text-ink/70 line-clamp-2">{r.bio || '—'}</p>
        case 'sample_caption':
          return <p className="text-xs text-ink/70 line-clamp-2">{r.sampleCaption || '—'}</p>
        case 'niche_signals':
          return <p className="font-mono text-xs text-ink/60">{(r.nicheSignals || []).join(', ') || '—'}</p>
        case 'dm_status': {
          const status = rs?.dm_status || 'not_sent'
          return (
            <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-mono ${DM_STATUS_STYLES[status] || DM_STATUS_STYLES.not_sent}`}>
              {DM_STATUS_LABELS[status] || status}
            </span>
          )
        }
        default:
          return null
      }
    } catch (e) {
      console.error('renderCell error', col.id, e)
      return <p className="font-mono text-xs text-rose/50">—</p>
    }
  }

  return (
    <div className="border border-card-edge rounded-[14px] overflow-auto max-h-[70vh] bg-white">
      <div className="sticky top-0 z-20 grid gap-3 px-4 py-3 bg-surface border-b border-[#EDE8DC] text-[9.5px] font-mono text-faint uppercase tracking-[.13em]"
        style={{ gridTemplateColumns: gridTemplate }}>
        {selectionMode && <span className="sticky left-0 bg-surface z-10" />}
        <span className={`sticky ${selectionMode ? 'left-8' : 'left-0'} bg-surface z-10`}>Account</span>
        {visibleCols.map((col) => (
          <ColumnHeaderCell
            key={col.id}
            col={col}
            sortId={sortId}
            sortDir={sortDir}
            onToggleSort={toggleSort}
            distinctValues={distinctValues(col.id)}
            activeFilter={filters[col.id] || []}
            onFilterChange={setFilter}
            infoSlot={col.infoKey ? <InfoTooltip column={col.infoKey} /> : null}
          />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="px-4 py-12 text-center text-[13.5px] text-muted">No accounts match your filters.</div>
      )}
      {filtered.map((r) => (
        <div key={r.username}>
          <div
            className="group grid gap-3 px-4 py-3 border-b border-[#F0ECE2] hover:bg-surface cursor-pointer transition-colors items-center"
            style={{ gridTemplateColumns: gridTemplate }}
            onClick={() => setExpandedRow(expandedRow === r.username ? null : r.username)}
          >
            {selectionMode && (
              <div onClick={(e) => e.stopPropagation()} className="sticky left-0 z-[1] bg-white group-hover:bg-surface flex items-center justify-center">
                <input
                  type="checkbox"
                  checked={selectedAccounts.has(r.username)}
                  onChange={() => onToggleSelect(r.username)}
                  className="w-4 h-4 accent-ink cursor-pointer"
                />
              </div>
            )}
            <div className={`min-w-0 sticky ${selectionMode ? 'left-8' : 'left-0'} z-[1] bg-white group-hover:bg-surface`}>
              <div className="flex items-center gap-2">
                <a href={profileUrl(r)} target="_blank" rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="font-medium text-sm text-ink hover:text-ink/70 flex items-center gap-1">
                  @{r.username} <ExternalLink size={11} className="opacity-40" />
                </a>
              </div>
              {r.fullName && <p className="text-xs text-ink/40 truncate">{r.fullName}</p>}
              <div className="flex flex-wrap gap-1 mt-1">
                {(r.flags || []).slice(0, 3).map((f) => (
                  <span key={f} className={`tag ${f === 'video-creator' ? 'tag-video' : f === 'bot-risk' || f === 'business-account' ? 'tag-bot' : ''}`}>{f}</span>
                ))}
              </div>
            </div>
            {visibleCols.map((col) => (
              <div key={col.id} className="min-w-0 overflow-hidden flex items-center justify-center">{renderCell(col, r)}</div>
            ))}
          </div>

          {expandedRow === r.username && (
            <div className="px-4 py-4 bg-surface border-b border-[#F0ECE2] grid grid-cols-2 gap-6 text-sm">
              <div>
                <p className="text-[9.5px] font-mono text-faint uppercase tracking-[.13em] mb-2">Scoring Verdict</p>
                <p className="font-serif italic text-ink text-[15px] leading-snug">{r.verdict || '—'}</p>
                {r.aiScore != null && (
                  <div className="mt-3">
                    <p className="text-[9.5px] font-mono text-faint uppercase tracking-[.13em] mb-1 flex items-center gap-1"><Sparkles size={10} /> AI Fit — {r.aiScore}/10</p>
                    <p className="text-body text-[12px] leading-relaxed">{r.aiReason || '—'}</p>
                  </div>
                )}
              </div>
              <div>
                {r.nicheSignals?.length > 0 && (
                  <div className="mb-3">
                    <p className="text-[9.5px] font-mono text-faint uppercase tracking-[.13em] mb-1">Niche Signals</p>
                    <p className="text-[12px] text-body">{r.nicheSignals.join(' · ')}</p>
                  </div>
                )}
                <div>
                  <p className="text-[9.5px] font-mono text-faint uppercase tracking-[.13em] mb-1">Top Hashtags</p>
                  <div className="flex flex-wrap gap-1">
                    {(r.hashtags || []).slice(0, 10).map((h) => (
                      <span key={h} className="tag">#{h}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

const CACHE_KEY = 'kol_live_stats_v1'
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000

function hasRealData(stats) {
  return stats && (stats.medianLikes != null || stats.medianViews != null || stats.medianComments != null || stats.followerCount != null)
}
function readCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') } catch { return {} }
}
function writeCache(cache) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)) } catch {}
}

export default function ResultsStep({ results, influencers, config, sessionId, onBackToSetup }) {
  const sessionIdRef = useRef(sessionId)
  useEffect(() => { sessionIdRef.current = sessionId }, [sessionId])

  const [filterFlag, setFilterFlag] = useState('all')
  const [minScore, setMinScore] = useState(0)
  // Content-format filter — replaces the old Step-2 "require video" scoring
  // nudge. Purely a results view filter, shareable via the URL.
  const [videoFilter, setVideoFilter] = useUrlParam('results_video', 'all') // 'all' | 'video' | 'novideo'
  const [expandedRow, setExpandedRow] = useState(null)
  // Column visibility is remembered across tabs + reloads (Phase 4).
  const [selectedColumns, setSelectedColumns] = useState(loadColumnPrefs)
  const handleColumnsChange = useCallback((next) => {
    setSelectedColumns(next)
    saveColumnPrefs(next)
  }, [])

  // Selection + share state
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedAccounts, setSelectedAccounts] = useState(new Set())
  const [shareStatus, setShareStatus] = useState('idle') // idle | loading | done | error

  // Review state (kept for column rendering; populated if this session had a prior share)
  const [reviewState] = useState({})

  const [liveStats, setLiveStats] = useState(() => {
    const cache = readCache()
    const now = Date.now()
    const valid = {}
    for (const [u, entry] of Object.entries(cache)) {
      if (now - entry.ts < CACHE_TTL_MS && hasRealData(entry.stats)) valid[u] = entry.stats
    }
    // Seed from saved results (persisted after a prior live fetch). Threads
    // rows are excluded — this map is Instagram live data, keyed by username.
    for (const r of results) {
      if (r.platform === 'threads') continue
      if (!valid[r.username] && (r.medianLikes != null || r.medianViews != null || r.medianComments != null)) {
        valid[r.username] = { medianLikes: r.medianLikes ?? null, medianViews: r.medianViews ?? null, medianComments: r.medianComments ?? null }
      }
    }
    return valid
  })
  // Threads profile-enrichment stats, keyed by username. Kept separate from
  // liveStats (IG) — the same handle can exist on both platforms, and the two
  // caches use different actors. Cache entries are namespaced "threads:<user>".
  const [threadsStats, setThreadsStats] = useState(() => {
    const cache = readCache()
    const now = Date.now()
    const valid = {}
    for (const r of results) {
      if (r.platform !== 'threads') continue
      const entry = cache[`threads:${r.username}`]
      if (entry && now - entry.ts < CACHE_TTL_MS && hasRealData(entry.stats)) {
        valid[r.username] = entry.stats
      } else if (r.followerCount != null || r.medianLikes != null || r.medianViews != null || r.medianComments != null) {
        // Seed from stats persisted on the session (scrape-time enrichment or
        // a prior Refresh) so they survive reloads.
        valid[r.username] = {
          followerCount: r.followerCount ?? null,
          medianLikes: r.medianLikes ?? null,
          medianViews: r.medianViews ?? null,
          medianComments: r.medianComments ?? null,
        }
      }
    }
    return valid
  })
  const [liveStatus, setLiveStatus] = useState(() => {
    const cache = readCache()
    const hasCached = results.some(
      (r) => hasRealData(cache[r.username]?.stats) || r.medianLikes != null || r.medianViews != null || r.medianComments != null
    )
    return hasCached ? 'done' : 'idle'
  })
  const [liveProgress, setLiveProgress] = useState({ done: 0, total: 0 })
  const [liveError, setLiveError] = useState(null)
  // True once a live fetch completes in THIS session — lets us flag when the
  // shown medians came only from the shared (possibly stale) local cache.
  const [fetchedThisSession, setFetchedThisSession] = useState(false)
  const [exporting, setExporting] = useState(false)

  // AI fit scoring (Phase 2) — advisory by default. { [username]: {score, reason} }
  const [aiStats, setAiStats] = useState(() => {
    const seed = {}
    for (const r of results) {
      if (r.aiScore != null) seed[r.username] = { score: r.aiScore, reason: r.aiReason || '' }
    }
    return seed
  })
  const [aiStatus, setAiStatus] = useState(() =>
    results.some((r) => r.aiScore != null) ? 'done' : 'idle'
  ) // idle | loading | done | error
  const [aiProgress, setAiProgress] = useState({ done: 0, total: 0 })
  const [aiError, setAiError] = useState(null)
  // Phase 3: blend AI fit into Overall. OFF by default — turn on only after
  // eyeballing the AI scores against a few real campaigns.
  const [blendAi, setBlendAi] = useState(false)

  // Keyed by platform:username — the same handle can exist as separate
  // Instagram and Threads candidates and must not collide.
  const infKey = (rec) => `${rec.platform || 'instagram'}:${rec.username}`
  const infMap = useMemo(() => {
    const m = {}
    for (const inf of influencers) m[infKey(inf)] = inf
    return m
  }, [influencers])

  const enriched = useMemo(() => {
    return results.map((r) => {
      const inf = infMap[infKey(r)]
      const isThreads = r.platform === 'threads'
      // Live stats come from an Instagram re-scrape — never attach them to a
      // Threads row (a same-handle IG account may be a different person).
      const live = isThreads ? null : liveStats[r.username]
      // Threads "live" data = profile enrichment (scrape-time, a Refresh in
      // this session, or persisted from a prior one — threadsStats holds all
      // three). IG keeps live-only semantics (medians blank until the user
      // fetches live).
      const tstats = isThreads ? threadsStats[r.username] : null
      const medLikes = isThreads ? (tstats?.medianLikes ?? inf?.xlsxMedianLikes ?? null) : (live?.medianLikes ?? null)
      const medViews = isThreads ? (tstats?.medianViews ?? inf?.xlsxMedianViews ?? null) : (live?.medianViews ?? null)
      const medComments = isThreads ? (tstats?.medianComments ?? inf?.xlsxMedianComments ?? null) : (live?.medianComments ?? null)
      const followerCount = isThreads
        ? (tstats?.followerCount ?? r.followerCount ?? inf?.followerCount ?? null)
        : (r.followerCount ?? inf?.followerCount ?? null)
      const ai = aiStats[r.username]
      const hasLive = medLikes != null || medViews != null
      const engScore = hasLive
        ? computeLiveEngagementScore(medLikes, medViews, medComments, followerCount)
        : (r.scores?.engagement ?? 0)
      const relScore = r.scores?.relevancy ?? 0
      // Same blend + off-niche cap as the initial score (computeOverall):
      // 50% Eng / 50% Rel, or 35/25/40 with Eng/Rel/AI-fit when blend is on.
      const overall = computeOverall(engScore, relScore, ai?.score ?? null, blendAi)
      return {
        ...r, ...inf,
        // Explicit: `...inf` would otherwise clobber a persisted r.followerCount
        // with the influencer record's scrape-time null.
        followerCount,
        scores: { ...r.scores, engagement: engScore },
        overall,
        aiScore: ai?.score ?? null,
        aiReason: ai?.reason || '',
        // xlsx medians live on the influencer record (inf), not the result (r).
        medianLikes: medLikes ?? inf?.xlsxMedianLikes ?? null,
        medianViews: medViews ?? inf?.xlsxMedianViews ?? null,
        medianComments: medComments ?? inf?.xlsxMedianComments ?? null,
        // Values powering the live median columns + their sorting. For Threads
        // these are the enrichment medians; for IG, live-only (unchanged).
        liveMedianLikes: medLikes,
        liveMedianViews: medViews,
        liveMedianComments: medComments,
      }
    })
  }, [results, infMap, liveStats, threadsStats, aiStats, blendAi])

  // Pre-filter (min score + legacy flag filter) feeds the shared sort/filter
  // engine, which owns per-column sort + category filters.
  const preFiltered = useMemo(() => {
    let list = enriched.filter((r) => r.overall >= minScore)
    if (filterFlag !== 'all') list = list.filter((r) => (r.flags || []).includes(filterFlag))
    if (videoFilter === 'video') list = list.filter((r) => (r.flags || []).includes('video-creator'))
    else if (videoFilter === 'novideo') list = list.filter((r) => !(r.flags || []).includes('video-creator'))
    return list
  }, [enriched, filterFlag, minScore, videoFilter])

  const { processed: filtered, sortId, sortDir, toggleSort, filters, setFilter, distinctValues } =
    useTableControls(preFiltered, { defaultSortId: 'overall', defaultSortDir: 'desc', urlSync: true, urlKey: 'results' })

  const highCount = enriched.filter((r) => r.overall >= 70).length
  const midCount = enriched.filter((r) => r.overall >= 45 && r.overall < 70).length

  // One handler for both platforms: IG rows re-scrape via fetchBatchStats,
  // Threads rows re-run profile enrichment (chunked ≤20 handles per actor run).
  // Both persist onto the session so the stats survive reloads.
  const handleFetchLive = useCallback(async (usernames, { force = false } = {}) => {
    const threadsSet = new Set(results.filter((r) => r.platform === 'threads').map((r) => r.username))
    const cache = readCache()
    const now = Date.now()
    const isFresh = (key) => cache[key] && now - cache[key].ts < CACHE_TTL_MS && hasRealData(cache[key].stats)
    const igToFetch = usernames.filter((u) => !threadsSet.has(u) && (force || !isFresh(u)))
    const thToFetch = usernames.filter((u) => threadsSet.has(u) && (force || !isFresh(`threads:${u}`)))
    const total = igToFetch.length + thToFetch.length
    if (total === 0) { setLiveStatus('done'); return }
    setLiveStatus('loading')
    setLiveProgress({ done: 0, total })
    setLiveError(null)
    try {
      let igDone = 0
      let thDone = 0
      const report = () => setLiveProgress({ done: Math.min(igDone + thDone, total), total })
      const [statsMap, threadsMap] = await Promise.all([
        igToFetch.length
          ? fetchBatchStats(igToFetch, (done) => { igDone = done; report() })
          : Promise.resolve({}),
        thToFetch.length
          ? fetchThreadsProfileItems(thToFetch, 10, (done) => { thDone = done; report() }).then(buildThreadsEnrichment)
          : Promise.resolve({}),
      ])
      const updated = { ...readCache() }
      for (const [u, stats] of Object.entries(statsMap)) {
        if (hasRealData(stats) || !hasRealData(updated[u]?.stats)) updated[u] = { stats, ts: Date.now() }
      }
      for (const [u, stats] of Object.entries(threadsMap)) {
        const key = `threads:${u}`
        if (hasRealData(stats) || !hasRealData(updated[key]?.stats)) updated[key] = { stats, ts: Date.now() }
      }
      writeCache(updated)
      // Merge with the same guard as the cache: never let an empty/failed
      // re-scrape overwrite live stats we already have in memory.
      setLiveStats((prev) => {
        const next = { ...prev }
        for (const [u, stats] of Object.entries(statsMap)) {
          if (hasRealData(stats) || !hasRealData(next[u])) next[u] = stats
        }
        return next
      })
      setThreadsStats((prev) => {
        const next = { ...prev }
        for (const [u, stats] of Object.entries(threadsMap)) {
          if (hasRealData(stats) || !hasRealData(next[u])) next[u] = stats
        }
        return next
      })
      setFetchedThisSession(true)
      // fetchBatchStats attaches failed usernames as a non-enumerable _failed.
      const failed = statsMap._failed || []
      const thMissing = thToFetch.filter((u) => !hasRealData(threadsMap[u]))
      const errParts = []
      if (failed.length) errParts.push(`${failed.length} Instagram account(s) couldn't be fetched`)
      if (thMissing.length) errParts.push(`${thMissing.length} Threads profile(s) returned no data (Meta may have blocked the lookup)`)
      setLiveError(errParts.length ? `${errParts.join(' · ')} — others updated. Click Refresh to retry.` : null)
      setLiveStatus('done')
      // Sequential on purpose: both persist via read-modify-write on the same
      // session row, so concurrent calls would clobber each other.
      ;(async () => {
        if (Object.keys(statsMap).length > 0) await updateSessionLiveStats(sessionIdRef.current, statsMap, 'instagram')
        if (Object.keys(threadsMap).length > 0) await updateSessionLiveStats(sessionIdRef.current, threadsMap, 'threads')
      })().catch(console.error)
    } catch (err) {
      setLiveError(err.message)
      setLiveStatus('error')
    }
  }, [results])

  const handleScoreAi = useCallback(async () => {
    setAiStatus('loading')
    setAiError(null)
    setAiProgress({ done: 0, total: enriched.length })
    try {
      const candidates = enriched.map((r) => ({
        username: r.username,
        bio: r.bio,
        hashtags: r.hashtags,
        nicheSignals: r.nicheSignals,
        flags: r.flags,
        followerCount: r.followerCount,
        medianLikes: r.medianLikes,
        medianViews: r.medianViews,
        overall: r.overall,
      }))
      const scoreMap = await fetchAiScores(
        candidates,
        {
          campaignBrief: config?.campaignBrief || '',
          targetAudience: config?.targetAudience || '',
          criteria: config?.targetKeywords ? `In-niche signals to reward: ${config.targetKeywords}` : '',
          excludeNiches: config?.excludeKeywords || '',
        },
        (done, total) => setAiProgress({ done, total }),
      )
      setAiStats((prev) => ({ ...prev, ...scoreMap }))
      const failed = scoreMap._failed || []
      setAiError(failed.length ? `${failed.length} account(s) couldn't be scored — others updated. Click Re-score to retry.` : null)
      setAiStatus('done')
    } catch (err) {
      setAiError(err.message)
      setAiStatus('error')
    }
  }, [enriched, config])

  const handleExport = async () => {
    if (exporting) return
    setExporting(true)
    try {
      const exportIds = [
        ...ALWAYS_EXPORT_IDS,
        ...TABLE_COLUMNS.filter((c) => selectedColumns.includes(c.id)).flatMap((c) => c.exportIds),
      ]
      await exportToCsv(filtered, influencers, exportIds, liveStats, reviewState)
    } catch (e) {
      console.error('Export failed', e)
      alert('Export failed: ' + (e?.message || 'unknown error'))
    } finally {
      setExporting(false)
    }
  }

  const handleToggleSelect = (username) => {
    setSelectedAccounts((prev) => {
      const next = new Set(prev)
      next.has(username) ? next.delete(username) : next.add(username)
      return next
    })
  }

  const handleSelectAll = () => {
    setSelectedAccounts(new Set(filtered.map((r) => r.username)))
  }

  // Send selected accounts to the Review Queue
  const handleShare = async () => {
    if (selectedAccounts.size === 0) return
    setShareStatus('loading')
    try {
      const accountsToShare = enriched
        .filter((r) => selectedAccounts.has(r.username))
        .map((r) => ({
          username: r.username,
          fullName: r.fullName || '',
          platform: r.platform || 'instagram',
          sourceBrand: r.sourceBrand || '',
          sourceTrack: r.sourceTrack || null,
          overall: r.overall,
          scores: r.scores,
          accountLocation: r.accountLocation || '',
          followerCount: r.followerCount ?? null,
          avgLikes: r.avgLikes ?? 0,
          avgComments: r.avgComments ?? 0,
          hashtags: r.hashtags || [],
          bio: r.bio || '',
          samplePostUrl: r.samplePostUrl || '',
          sampleCaption: r.sampleCaption || '',
          samplePostLikes: r.samplePostLikes ?? null,
          samplePostComments: r.samplePostComments ?? null,
          samplePostPlays: r.samplePostPlays ?? null,
          flags: r.flags || [],
          nicheSignals: r.nicheSignals || [],
          verdict: r.verdict || '',
          medianLikes: r.medianLikes ?? null,
          medianViews: r.medianViews ?? null,
          medianComments: r.medianComments ?? null,
          aiScore: r.aiScore ?? null,
          aiReason: r.aiReason || '',
        }))

      const { error } = await supabase
        .from('shared_results')
        .insert({
          campaign_brief: config?.campaignBrief || '',
          accounts: accountsToShare,
          review_state: {},
        })

      if (error) throw new Error(error.message)
      setShareStatus('done')
      setTimeout(() => {
        setShareStatus('idle')
        setSelectionMode(false)
        setSelectedAccounts(new Set())
      }, 3000)
    } catch (err) {
      console.error('Send for review failed:', err)
      setShareStatus('error')
    }
  }

  return (
    <div className="px-10 py-8 w-full">

      <StepProgress
        current={2}
        steps={[
          { num: 1, label: 'Set up', onClick: onBackToSetup, hint: 'Back to set-up — these results are kept' },
          { num: 2, label: 'Results' },
        ]}
      />

      {/* Header */}
      <div className="relative z-30 flex items-start justify-between mb-8 anim-rise">
        <div>
          <h1 className="text-[32px] font-serif font-bold tracking-[0.02em] text-ink mb-1">{filtered.length} accounts scored</h1>
          <p className="text-[13.5px] text-muted">
            <span className="text-sage font-semibold">{highCount} strong matches</span>
            {' · '}
            <span className="text-body font-semibold">{midCount} possible</span>
            {' · '}
            {enriched.length - highCount - midCount} low score
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <ColumnPicker selected={selectedColumns} onChange={handleColumnsChange} />

          {/* Selection + Send for Review controls */}
          {!selectionMode ? (
            <button
              onClick={() => setSelectionMode(true)}
              className="flex items-center gap-2 px-4 py-2 border border-accent/40 text-accent rounded-[10px] text-[13px] hover:bg-accent-dim/30 transition-all"
            >
              <Send size={14} />
              Send for Review
            </button>
          ) : shareStatus === 'done' ? (
            <div className="flex items-center gap-2 px-4 py-2 bg-sage/10 border border-sage/30 rounded-[10px]">
              <Check size={14} className="text-sage" />
              <span className="text-[13px] text-sage font-semibold">Sent to Review Queue</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button onClick={handleSelectAll} className="text-[11px] text-faint hover:text-ink font-mono px-2 py-1 border border-mist rounded-[8px]">
                Select all
              </button>
              <span className="text-[11px] font-mono text-muted">{selectedAccounts.size} selected</span>
              <button
                onClick={handleShare}
                disabled={selectedAccounts.size === 0 || shareStatus === 'loading'}
                className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-[10px] text-[13px] hover:bg-accent/80 transition-all disabled:opacity-40"
              >
                {shareStatus === 'loading' ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                {shareStatus === 'loading' ? 'Sending…' : 'Send for Review'}
              </button>
              <button onClick={() => { setSelectionMode(false); setSelectedAccounts(new Set()) }}
                className="text-[11px] text-faint hover:text-ink px-2 py-1 border border-mist rounded-[8px]">
                Cancel
              </button>
            </div>
          )}

          {/* Live stats */}
          {liveStatus === 'loading' ? (
            <div className="flex items-center gap-2 px-4 py-2 border border-mist rounded-[10px] text-[13px] text-muted">
              <Loader2 size={14} className="animate-spin" />
              Fetching {liveProgress.done}/{liveProgress.total}
            </div>
          ) : liveStatus === 'error' ? (
            // Retry does NOT force — accounts already fetched (cached with real
            // data) are skipped so we don't re-pay for them.
            <button onClick={() => handleFetchLive(results.map((r) => r.username))}
              className="flex items-center gap-2 px-4 py-2 border border-rose/40 text-rose rounded-[10px] text-[13px] hover:bg-rose/5 transition-all">
              <RefreshCw size={14} /> Retry
            </button>
          ) : liveStatus === 'done' ? (
            <div className="flex items-center gap-2">
              {!fetchedThisSession && (
                <span className="text-[11px] font-mono text-faint" title="Shown from local cache — click Refresh to fetch fresh data">cached</span>
              )}
              <button onClick={() => handleFetchLive(results.map((r) => r.username), { force: true })}
                className="flex items-center gap-2 px-4 py-2 border border-mist rounded-[10px] text-[13px] text-faint hover:border-ink/30 hover:text-ink transition-all">
                <RefreshCw size={14} /> Refresh
              </button>
            </div>
          ) : (
            <button onClick={() => handleFetchLive(results.map((r) => r.username))}
              className="flex items-center gap-2 px-4 py-2 border border-accent/40 text-accent rounded-[10px] text-[13px] hover:bg-accent-dim/30 transition-all">
              <RefreshCw size={14} /> Fetch Live Stats
            </button>
          )}

          {/* AI fit scoring — learns from past review decisions */}
          {aiStatus === 'loading' ? (
            <div className="flex items-center gap-2 px-4 py-2 border border-mist rounded-[10px] text-[13px] text-muted">
              <Loader2 size={14} className="animate-spin" />
              Scoring {aiProgress.done}/{aiProgress.total}
            </div>
          ) : aiStatus === 'error' ? (
            <button onClick={handleScoreAi}
              className="flex items-center gap-2 px-4 py-2 border border-rose/40 text-rose rounded-[10px] text-[13px] hover:bg-rose/5 transition-all">
              <Sparkles size={14} /> Retry AI scoring
            </button>
          ) : aiStatus === 'done' ? (
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-[11px] font-mono text-muted cursor-pointer select-none" title="Reweight Overall to 35% Engagement + 25% Relevancy + 40% AI fit (Eng×3.5 + Rel×2.5 + AI×4)">
                <input type="checkbox" checked={blendAi} onChange={(e) => setBlendAi(e.target.checked)} className="w-3.5 h-3.5 accent-ink cursor-pointer" />
                Blend into Overall
              </label>
              <button onClick={handleScoreAi}
                className="flex items-center gap-2 px-4 py-2 border border-mist rounded-[10px] text-[13px] text-faint hover:border-ink/30 hover:text-ink transition-all">
                <Sparkles size={14} /> Re-score
              </button>
            </div>
          ) : (
            <button onClick={handleScoreAi}
              className="flex items-center gap-2 px-4 py-2 border border-accent/40 text-accent rounded-[10px] text-[13px] hover:bg-accent-dim/30 transition-all">
              <Sparkles size={14} /> Score fit with AI
            </button>
          )}

          <button
            onClick={handleExport}
            disabled={exporting}
            className="flex items-center gap-2 px-4 py-2 bg-ink text-white rounded-[10px] text-[13px] hover:bg-ink/80 transition-all disabled:opacity-50"
          >
            {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            {exporting ? 'Exporting…' : 'Export XLSX'}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-faint font-mono">Content:</span>
          <div className="flex items-center bg-mist rounded-[9px] p-1 gap-1">
            {[['all', 'All'], ['video', 'Video only'], ['novideo', 'Non-video']].map(([val, label]) => (
              <button
                key={val}
                onClick={() => setVideoFilter(val)}
                className={`px-2.5 py-1 rounded-[7px] text-[12px] font-medium transition-all ${videoFilter === val ? 'bg-white text-ink shadow-sm' : 'text-muted hover:text-ink'}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[11px] text-faint font-mono">Min score:</span>
          <input type="number" value={minScore} onChange={(e) => setMinScore(Number(e.target.value))}
            min="0" max="100" className="w-16 px-2 py-1 border border-[#E1DBCD] rounded-[8px] text-[12px] font-mono bg-white focus:outline-none focus:border-ink/30" />
        </div>
      </div>

      {liveError && (
        <div className="mb-4 px-4 py-3 bg-rose/5 border border-rose/20 rounded-[12px] text-[12px] text-rose">
          {liveStatus === 'error' ? `Live fetch failed: ${liveError}` : liveError}
        </div>
      )}
      {aiError && (
        <div className="mb-4 px-4 py-3 bg-rose/5 border border-rose/20 rounded-[12px] text-[12px] text-rose">
          {aiStatus === 'error' ? `AI scoring failed: ${aiError}` : aiError}
        </div>
      )}
      {aiStatus === 'done' && !aiError && (
        <div className="mb-4 px-4 py-3 bg-accent-dim/20 border border-accent/20 rounded-[12px] text-[12px] text-body">
          AI fit scores are advisory — they learn from your team's past approve/reject decisions. Tick <strong>Blend into Overall</strong> above once you trust them to fold them into the ranking (it reweights Overall to 35% Engagement · 25% Relevancy · 40% AI fit). Expand a row to see the reasoning.
        </div>
      )}
      {shareStatus === 'error' && (
        <div className="mb-4 px-4 py-3 bg-rose/5 border border-rose/20 rounded-[12px] text-[12px] text-rose">Failed to send for review. Check your Supabase env vars.</div>
      )}

      {selectionMode && shareStatus !== 'done' && (
        <div className="mb-4 px-4 py-3 bg-accent-dim/30 border border-accent/20 rounded-[12px] text-[12px] text-body">
          Tick the accounts you want the brand manager to review, then click <strong>Send for Review</strong>.
        </div>
      )}

      <TableErrorBoundary>
        <div className="anim-rise anim-d2">
        <ResultsTable
          selectedColumns={selectedColumns}
          filtered={filtered}
          expandedRow={expandedRow}
          setExpandedRow={setExpandedRow}
          sortId={sortId}
          sortDir={sortDir}
          toggleSort={toggleSort}
          filters={filters}
          setFilter={setFilter}
          distinctValues={distinctValues}
          liveStats={liveStats}
          liveStatus={liveStatus}
          aiStatus={aiStatus}
          reviewState={reviewState}
          selectedAccounts={selectedAccounts}
          onToggleSelect={handleToggleSelect}
          selectionMode={selectionMode}
        />
        </div>
      </TableErrorBoundary>

      <p className="mt-4 text-[11px] text-faint font-mono text-center">
        Click any row to expand · Engagement &amp; Relevancy scores are deterministic keyword + arithmetic logic
      </p>
    </div>
  )
}
