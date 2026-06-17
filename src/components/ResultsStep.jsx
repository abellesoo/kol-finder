import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { Download, ExternalLink, ChevronUp, ChevronDown, Filter, Columns, Info, Loader2, RefreshCw } from 'lucide-react'
import { exportToCsv } from '../lib/exportCsv'
import { fetchBatchStats } from '../lib/apifyApi'

const COLUMN_INFO = {
  overall: {
    title: 'Overall Score (0–100)',
    lines: [
      '50% Engagement Score + 50% Relevancy Score.',
      'Each sub-score is 0–10; combined and scaled to 0–100.',
      '· 70+ = strong match',
      '· 45–69 = possible',
      '· <45 = low fit',
    ],
  },
  relevancy: {
    title: 'Relevancy Score (0–10)',
    lines: [
      'Baseline 5. Adds 1 per keyword hit in your target niches.',
      'Deducts 1 per off-niche category that also has keyword hits.',
      'Scans captions, hashtags, and display name.',
      '· 8–10 = strong niche match',
      '· 5–7 = some relevant content',
      '· 0–4 = off-niche or diluted content mix',
    ],
  },
  engagement_score: {
    title: 'Engagement Score (0–10)',
    lines: [
      'log(1 + Likes + Comments×3)',
      'Comments are weighted 3× as a proxy for replies.',
      'Instagram does not expose repost counts.',
      '· ~4 = micro-influencer (~50 avg likes)',
      '· ~6–7 = mid-tier (~500–1000 avg likes)',
      '· ~9–10 = large account (10k+ avg likes)',
    ],
  },
  location: {
    title: 'Location Score (0–10)',
    lines: [
      'How likely the account is based in your target location.',
      'Scans captions, hashtags, and tagged locations for local signals',
      '(place names, local brands, currency, language markers).',
      'For Taiwan: traditional Chinese + putonghua/voiceover signals',
      'give an additional boost.',
      '· 8–10 = strong local presence',
      '· 4–7 = some signals',
      '· 0–3 = weak or no local signal',
    ],
  },
  engagement: {
    title: 'Engagement Rate',
    lines: [
      'ER = (avg likes + avg comments) ÷ followers × 100',
      'Measures what % of followers engage per post on average.',
      'Hidden like counts are treated as 0 (conservative).',
      'Industry benchmarks:',
      '· >3% = excellent',
      '· 1–3% = good',
      '· <1% = low',
      'Shows raw avg likes if follower count is unavailable.',
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
        className="text-ink/30 hover:text-accent transition-colors ml-0.5"
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

// Columns shown in the table. exportIds maps each to EXPORT_COLUMNS ids for the xlsx.
const TABLE_COLUMNS = [
  { id: 'overall',               label: 'Overall',         width: '1fr', sortKey: 'overall',      infoKey: 'overall',          exportIds: ['overall'] },
  { id: 'relevancy_score',       label: 'Relevancy',       width: '1fr', sortKey: 'relevancy',    infoKey: 'relevancy',        exportIds: ['relevancy_score'] },
  { id: 'engagement_score',      label: 'Eng. Score',      width: '1fr', sortKey: 'eng_score',    infoKey: 'engagement_score', exportIds: ['engagement_score'] },
  { id: 'location_score',        label: 'Location',        width: '1fr', sortKey: 'location',     infoKey: 'location',         exportIds: ['location_score'] },
  { id: 'engagement',            label: 'Eng. Rate',       width: '1fr', sortKey: 'engagement',   infoKey: 'engagement',       exportIds: ['engagement_rate'] },
  { id: 'follower_count',        label: 'Followers',       width: '1fr',                                                       exportIds: ['follower_count'] },
  { id: 'live_median_likes',     label: 'Med. Likes',      width: '1fr', infoKey: 'live_median_likes',                         exportIds: ['live_median_likes'] },
  { id: 'live_median_views',     label: 'Med. Views',      width: '1fr', infoKey: 'live_median_views',                         exportIds: ['live_median_views'] },
  { id: 'sample_post_url',       label: 'Scraped Post',    width: '1fr',                                                       exportIds: ['sample_post_url'] },
  { id: 'scraped_post_likes',    label: 'Post Likes',      width: '1fr',                                                       exportIds: ['scraped_post_likes'] },
  { id: 'scraped_post_comments', label: 'Post Comments',   width: '1fr',                                                       exportIds: ['scraped_post_comments'] },
  { id: 'scraped_post_plays',    label: 'Post Plays',      width: '1fr',                                                       exportIds: ['scraped_post_plays'] },
  { id: 'sample_caption',        label: 'Scraped Caption', width: '2fr',                                                       exportIds: ['sample_caption'] },
]

// Always included in export regardless of column picker (identifiers + workflow + extra signals user requested)
const ALWAYS_EXPORT_IDS = [
  'username', 'instagram_url',
  'niche_signals', 'location_signals',
  'approve', 'reachout_status', 'remarks',
]


function ScoreBadge({ score }) {
  const cls = score >= 70 ? 'score-high' : score >= 45 ? 'score-mid' : 'score-low'
  return <span className={`score-badge ${cls}`}>{score}</span>
}

function MiniBar({ value, max = 10, color = 'bg-accent' }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 h-1.5 bg-mist rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${color}`}
          style={{ width: `${(value / max) * 100}%` }}
        />
      </div>
      <span className="font-mono text-xs text-ink/50">{value}</span>
    </div>
  )
}

function ColumnPicker({ selected, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const toggle = (id) => {
    onChange(selected.includes(id) ? selected.filter((c) => c !== id) : [...selected, id])
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-4 py-2 border border-mist rounded-lg text-sm text-ink/60 hover:border-ink/30 hover:text-ink transition-all"
      >
        <Columns size={15} />
        Columns
        {selected.length < TABLE_COLUMNS.length && (
          <span className="font-mono text-xs bg-accent text-white rounded-full px-1.5 py-0.5 leading-none">
            {selected.length}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 bg-white border border-mist rounded-xl shadow-lg z-10 p-3">
          <p className="text-xs font-mono text-ink/40 uppercase tracking-wider mb-2">Show / export columns</p>
          <div className="space-y-1">
            {TABLE_COLUMNS.map((col) => (
              <label key={col.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-mist/50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.includes(col.id)}
                  onChange={() => toggle(col.id)}
                  className="accent-accent"
                />
                <span className="font-mono text-xs text-ink/70">{col.label}</span>
              </label>
            ))}
          </div>
          <div className="flex gap-2 mt-3 pt-2 border-t border-mist">
            <button
              onClick={() => onChange(TABLE_COLUMNS.map((c) => c.id))}
              className="text-xs text-ink/40 hover:text-ink transition-colors"
            >
              Select all
            </button>
            <button
              onClick={() => onChange([])}
              className="text-xs text-ink/40 hover:text-ink transition-colors ml-auto"
            >
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

const CACHE_KEY = 'kol_live_stats_v1'
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

// A cache entry is only valid if it has at least some real scraped data
function hasRealData(stats) {
  return stats && (stats.medianLikes != null || stats.medianViews != null || stats.followerCount != null)
}

function readCache() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') } catch { return {} }
}

function writeCache(cache) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)) } catch {}
}

export default function ResultsStep({ results, influencers, config }) {
  const [sortKey, setSortKey] = useState('overall')
  const [sortDir, setSortDir] = useState('desc')
  const [filterFlag, setFilterFlag] = useState('all')
  const [minScore, setMinScore] = useState(0)
  const [expandedRow, setExpandedRow] = useState(null)
  const [selectedColumns, setSelectedColumns] = useState(TABLE_COLUMNS.map((c) => c.id))
  const [liveStats, setLiveStats] = useState(() => {
    // Pre-populate from cache on first render — skip entries with no real data
    const cache = readCache()
    const now = Date.now()
    const valid = {}
    for (const [u, entry] of Object.entries(cache)) {
      if (now - entry.ts < CACHE_TTL_MS && hasRealData(entry.stats)) valid[u] = entry.stats
    }
    return valid
  })
  const [liveStatus, setLiveStatus] = useState(() => {
    // Start in 'done' if we already have cached data for any of the current results
    const cache = readCache()
    const hasCached = results.some((r) => hasRealData(cache[r.username]?.stats))
    return hasCached ? 'done' : 'idle'
  })
  const [liveProgress, setLiveProgress] = useState({ done: 0, total: 0 })
  const [liveError, setLiveError] = useState(null)

  // Build enriched list
  const infMap = useMemo(() => {
    const m = {}
    for (const inf of influencers) m[inf.username] = inf
    return m
  }, [influencers])

  const enriched = useMemo(() => {
    return results.map((r) => ({
      ...r,
      ...infMap[r.username],
      overall: r.overall ?? 0,
    }))
  }, [results, infMap])

  const filtered = useMemo(() => {
    let list = enriched.filter((r) => r.overall >= minScore)
    if (filterFlag !== 'all') {
      list = list.filter((r) => (r.flags || []).includes(filterFlag))
    }
    list = [...list].sort((a, b) => {
      const av = sortKey === 'overall' ? a.overall
        : sortKey === 'relevancy' ? (a.scores?.relevancy ?? 0)
        : sortKey === 'eng_score' ? (a.scores?.engagement ?? 0)
        : sortKey === 'location' ? (a.scores?.location ?? 0)
        : sortKey === 'engagement' ? (a.engagementRate ?? a.totalEngagement ?? 0)
        : a.overall
      const bv = sortKey === 'overall' ? b.overall
        : sortKey === 'relevancy' ? (b.scores?.relevancy ?? 0)
        : sortKey === 'eng_score' ? (b.scores?.engagement ?? 0)
        : sortKey === 'location' ? (b.scores?.location ?? 0)
        : sortKey === 'engagement' ? (b.engagementRate ?? b.totalEngagement ?? 0)
        : b.overall
      return sortDir === 'desc' ? bv - av : av - bv
    })
    return list
  }, [enriched, sortKey, sortDir, filterFlag, minScore])

  const toggleSort = (key) => {
    if (sortKey === key) setSortDir((d) => d === 'desc' ? 'asc' : 'desc')
    else { setSortKey(key); setSortDir('desc') }
  }

  const SortIcon = ({ k }) => {
    if (sortKey !== k) return <ChevronUp size={12} className="opacity-20" />
    return sortDir === 'desc' ? <ChevronDown size={12} /> : <ChevronUp size={12} />
  }

  const highCount = enriched.filter((r) => r.overall >= 70).length
  const midCount = enriched.filter((r) => r.overall >= 45 && r.overall < 70).length

  const handleFetchLive = useCallback(async (usernames, { force = false } = {}) => {
    const cache = readCache()
    const now = Date.now()
    const toFetch = force
      ? usernames
      : usernames.filter((u) => !cache[u] || now - cache[u].ts >= CACHE_TTL_MS || !hasRealData(cache[u].stats))
    if (toFetch.length === 0) {
      setLiveStatus('done')
      return
    }

    setLiveStatus('loading')
    setLiveProgress({ done: 0, total: toFetch.length })
    setLiveError(null)
    try {
      const statsMap = await fetchBatchStats(toFetch, (done, total) => {
        setLiveProgress({ done, total })
      })
      // Persist to cache — don't overwrite good existing data with empty results
      const updated = { ...readCache() }
      for (const [u, stats] of Object.entries(statsMap)) {
        if (hasRealData(stats) || !hasRealData(updated[u]?.stats)) {
          updated[u] = { stats, ts: Date.now() }
        }
      }
      writeCache(updated)
      setLiveStats((prev) => ({ ...prev, ...statsMap }))
      setLiveStatus('done')
    } catch (err) {
      setLiveError(err.message)
      setLiveStatus('error')
    }
  }, [])


  return (
    <div className="min-h-screen px-6 py-10 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <p className="font-mono text-xs tracking-widest text-ink/40 uppercase mb-2">Step 3 of 3 · Results</p>
          <h1 className="text-2xl font-semibold text-ink mb-1">
            {filtered.length} accounts scored
          </h1>
          <p className="text-sm text-ink/50">
            <span className="text-sage font-medium">{highCount} strong matches</span>
            {' · '}
            <span className="text-accent font-medium">{midCount} possible</span>
            {' · '}
            {enriched.length - highCount - midCount} low score
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ColumnPicker selected={selectedColumns} onChange={setSelectedColumns} />
          {liveStatus === 'loading' ? (
            <div className="flex items-center gap-2 px-4 py-2 border border-mist rounded-lg text-sm text-ink/50">
              <Loader2 size={15} className="animate-spin" />
              Fetching live stats {liveProgress.done}/{liveProgress.total}
            </div>
          ) : liveStatus === 'error' ? (
            <button
              onClick={() => handleFetchLive(results.map((r) => r.username), { force: true })}
              className="flex items-center gap-2 px-4 py-2 border border-rose/40 text-rose rounded-lg text-sm hover:bg-rose/5 transition-all"
            >
              <RefreshCw size={15} />
              Retry
            </button>
          ) : liveStatus === 'done' ? (
            <button
              onClick={() => handleFetchLive(results.map((r) => r.username), { force: true })}
              className="flex items-center gap-2 px-4 py-2 border border-mist rounded-lg text-sm text-ink/40 hover:border-ink/30 hover:text-ink transition-all"
            >
              <RefreshCw size={15} />
              Refresh
            </button>
          ) : (
            <button
              onClick={() => handleFetchLive(results.map((r) => r.username))}
              className="flex items-center gap-2 px-4 py-2 border border-accent/40 text-accent rounded-lg text-sm hover:bg-accent-dim/20 transition-all"
            >
              <RefreshCw size={15} />
              Fetch Live Stats
            </button>
          )}
          <button
            onClick={() => {
                const exportIds = [
                  ...ALWAYS_EXPORT_IDS,
                  ...TABLE_COLUMNS.filter((c) => selectedColumns.includes(c.id)).flatMap((c) => c.exportIds),
                ]
                exportToCsv(filtered, influencers, exportIds, liveStats).catch(console.error)
              }}
            className="flex items-center gap-2 px-4 py-2 bg-ink text-white rounded-lg text-sm hover:bg-ink/80 transition-all"
          >
            <Download size={15} />
            Export XLSX
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex items-center gap-1.5 text-xs text-ink/40 font-mono">
          <Filter size={12} />
          Filter:
        </div>
        {['all', 'hk-based', 'video-creator', 'beauty-niche', 'paid-collab-history', 'bot-risk'].map((f) => (
          <button
            key={f}
            onClick={() => setFilterFlag(f)}
            className={`px-2.5 py-1 rounded-full text-xs border transition-all
              ${filterFlag === f
                ? 'bg-ink text-white border-ink'
                : 'border-mist text-ink/50 hover:border-ink/30'
              }`}
          >
            {f === 'all' ? 'All' : f}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-ink/40 font-mono">Min score:</span>
          <input
            type="number"
            value={minScore}
            onChange={(e) => setMinScore(Number(e.target.value))}
            min="0" max="100"
            className="w-16 px-2 py-1 border border-mist rounded text-xs font-mono bg-white focus:outline-none focus:border-accent"
          />
        </div>
      </div>

      {/* Live stats error */}
      {liveStatus === 'error' && (
        <div className="mb-4 px-4 py-3 bg-rose/5 border border-rose/20 rounded-xl text-xs text-rose">
          Live fetch failed: {liveError}
        </div>
      )}

      {/* Table */}
      {(() => {
        try {
        const visibleCols = TABLE_COLUMNS.filter((c) => selectedColumns.includes(c.id))
        const gridTemplate = `2fr ${visibleCols.map((c) => c.width).join(' ')}`

        const renderCell = (col, r) => {
          try {
          const s = liveStats[r.username]
          switch (col.id) {
            case 'overall':
              return <ScoreBadge score={r.overall} />
            case 'relevancy_score':
              return <MiniBar value={r.scores?.relevancy ?? 0} color="bg-rose/70" />
            case 'location_score':
              return <MiniBar value={r.scores?.location ?? 0} color="bg-sage/70" />
            case 'engagement':
              return (
                <div>
                  {r.engagementRate != null ? (
                    <>
                      <p className="font-mono text-sm text-ink">{r.engagementRate}%</p>
                      <p className="font-mono text-xs text-ink/30">{(r.avgLikes || 0).toLocaleString()} avg likes</p>
                    </>
                  ) : (
                    <>
                      <p className="font-mono text-sm text-ink">{(r.avgLikes || 0).toLocaleString()}</p>
                      <p className="font-mono text-xs text-ink/30">{(r.avgComments || 0).toLocaleString()} cmts</p>
                    </>
                  )}
                </div>
              )
            case 'follower_count': {
              const val = (s?.followerCount ?? r.followerCount)
              return <p className="font-mono text-sm text-ink">{val != null ? val.toLocaleString() : '—'}</p>
            }
            case 'engagement_score':
              return <MiniBar value={r.scores?.engagement ?? 0} color="bg-accent/70" />
            case 'live_median_likes':
              if (liveStatus === 'loading' && !s) return <Loader2 size={11} className="animate-spin text-accent/40" />
              if (!s) return <p className="font-mono text-sm text-ink/30">—</p>
              return <p className="font-mono text-sm text-ink">{s.medianLikes != null ? s.medianLikes.toLocaleString() : '—'}</p>
            case 'live_median_views':
              if (liveStatus === 'loading' && !s) return <Loader2 size={11} className="animate-spin text-accent/40" />
              if (!s) return <p className="font-mono text-sm text-ink/30">—</p>
              return <p className="font-mono text-sm text-ink">{s.medianViews != null ? s.medianViews.toLocaleString() : '—'}</p>
            case 'live_hidden_likes':
              if (liveStatus === 'loading' && !s) return <Loader2 size={11} className="animate-spin text-accent/40" />
              if (s) return (
                <div>
                  <p className="font-mono text-sm text-ink">{s.hiddenCount}</p>
                  {s.totalScraped > 0 && <p className="font-mono text-xs text-ink/30">of {s.totalScraped}</p>}
                </div>
              )
              return (
                <div>
                  <p className="font-mono text-sm text-ink">{r.xlsxHiddenCount ?? '—'}</p>
                  {r.xlsxRecentCount > 0 && <p className="font-mono text-xs text-ink/30">of {r.xlsxRecentCount}</p>}
                </div>
              )
            case 'sample_post_url':
              return r.samplePostUrl ? (
                <a href={r.samplePostUrl} target="_blank" rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="flex items-center gap-1 font-mono text-xs text-accent hover:underline">
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
            default:
              return null
          }
          } catch (e) {
            console.error('renderCell error', col.id, e)
            return <p className="font-mono text-xs text-rose/50">—</p>
          }
        }

        return (
      <div className="border border-mist rounded-xl overflow-x-auto">
        {/* Table header */}
        <div
          className="grid gap-3 px-4 py-3 bg-mist/50 border-b border-mist text-xs font-mono text-ink/40 uppercase tracking-wider"
          style={{ gridTemplateColumns: gridTemplate }}
        >
          <span>Account</span>
          {visibleCols.map((col) => (
            col.sortKey ? (
              <button key={col.id} onClick={() => toggleSort(col.sortKey)} className="flex items-center gap-1 hover:text-ink">
                {col.label} <SortIcon k={col.sortKey} />{col.infoKey && <InfoTooltip column={col.infoKey} />}
              </button>
            ) : (
              <span key={col.id} className="flex items-center gap-1">
                {col.label}{col.infoKey && <InfoTooltip column={col.infoKey} />}
              </span>
            )
          ))}
        </div>

        {/* Rows */}
        {filtered.length === 0 && (
          <div className="px-4 py-12 text-center text-sm text-ink/30">
            No accounts match your filters.
          </div>
        )}
        {filtered.map((r) => (
          <div key={r.username}>
            {/* Main row */}
            <div
              className="grid gap-3 px-4 py-3.5 border-b border-mist/50 hover:bg-accent-dim/10 cursor-pointer transition-colors items-center"
              style={{ gridTemplateColumns: gridTemplate }}
              onClick={() => setExpandedRow(expandedRow === r.username ? null : r.username)}
            >
              {/* Account — always shown */}
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <a
                    href={`https://instagram.com/${r.username}`}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="font-medium text-sm text-ink hover:text-accent flex items-center gap-1"
                  >
                    @{r.username}
                    <ExternalLink size={11} className="opacity-40" />
                  </a>
                </div>
                {r.fullName && <p className="text-xs text-ink/40 truncate">{r.fullName}</p>}
                <div className="flex flex-wrap gap-1 mt-1">
                  {(r.flags || []).slice(0, 3).map((f) => (
                    <span key={f} className={`tag ${
                      f === 'hk-based' ? 'tag-hk' :
                      f === 'video-creator' ? 'tag-video' :
                      f === 'bot-risk' ? 'tag-bot' : ''
                    }`}>{f}</span>
                  ))}
                </div>
              </div>

              {visibleCols.map((col) => (
                <div key={col.id} className="min-w-0 overflow-hidden">{renderCell(col, r)}</div>
              ))}
            </div>

            {/* Expanded detail */}
            {expandedRow === r.username && (
              <div className="px-6 py-4 bg-paper border-b border-mist/50 grid grid-cols-2 gap-6 text-sm">
                <div>
                  <p className="text-xs font-mono text-ink/40 uppercase tracking-wider mb-2">AI Verdict</p>
                  <p className="text-ink/80 leading-relaxed">{r.verdict || '—'}</p>

                  {r.hkSignals?.length > 0 && (
                    <div className="mt-3">
                      <p className="text-xs font-mono text-ink/40 uppercase tracking-wider mb-1">HK Signals</p>
                      <p className="text-xs text-ink/60">{r.hkSignals.join(' · ')}</p>
                    </div>
                  )}
                </div>
                <div>
                  {r.nicheSignals?.length > 0 && (
                    <div className="mb-3">
                      <p className="text-xs font-mono text-ink/40 uppercase tracking-wider mb-1">Niche Signals</p>
                      <p className="text-xs text-ink/60">{r.nicheSignals.join(' · ')}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs font-mono text-ink/40 uppercase tracking-wider mb-1">Top Hashtags</p>
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
        } catch (e) {
          console.error('Table render error:', e)
          return (
            <div className="px-4 py-8 text-center text-sm text-rose/70 border border-rose/20 rounded-xl">
              Table failed to render. Open DevTools → Console for details.
            </div>
          )
        }
      })()}

      <p className="mt-4 text-xs text-ink/25 font-mono text-center">
        Click any row to expand · Scores generated by Claude AI · Always verify manually
      </p>
    </div>
  )
}
