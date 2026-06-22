import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import { Download, ExternalLink, ChevronUp, ChevronDown, Filter, Columns, Info, Loader2, RefreshCw, Share2, Check, Copy, X } from 'lucide-react'
import { exportToCsv } from '../lib/exportCsv'
import { TABLE_COLUMNS, DEFAULT_SELECTED_COLUMNS, ALWAYS_EXPORT_IDS } from '../lib/columnDefs'
import { fetchBatchStats } from '../lib/apifyApi'
import { computeLiveEngagementScore } from '../lib/scoreInfluencers'
import { supabase } from '../lib/supabase'
import TableErrorBoundary from './TableErrorBoundary'

const COLUMN_INFO = {
  overall: {
    title: 'Overall Score (0–100)',
    lines: [
      '80% Engagement Score + 20% Relevancy Score.',
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
      'Before live fetch: log(1 + avgLikes + avgComments×3)',
      'After live fetch:  log(1 + medianLikes + medianViews×0.5)',
      'Live data replaces the export estimate per account.',
      '· ~4 = micro (~50 likes)',
      '· ~6–7 = mid-tier (~500–1k likes)',
      '· ~9–10 = large (10k+ likes)',
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
      <div className="w-16 h-1.5 bg-mist rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${(value / max) * 100}%` }} />
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
                <input type="checkbox" checked={selected.includes(col.id)} onChange={() => toggle(col.id)} className="accent-accent" />
                <span className="font-mono text-xs text-ink/70">{col.label}</span>
              </label>
            ))}
          </div>
          <div className="flex gap-2 mt-3 pt-2 border-t border-mist">
            <button onClick={() => onChange(TABLE_COLUMNS.map((c) => c.id))} className="text-xs text-ink/40 hover:text-ink transition-colors">Select all</button>
            <button onClick={() => onChange([])} className="text-xs text-ink/40 hover:text-ink transition-colors ml-auto">Clear</button>
          </div>
        </div>
      )}
    </div>
  )
}

// Share modal — shows the generated link and a copy button
function ShareModal({ url, onClose }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }
  return (
    <div className="fixed inset-0 bg-ink/40 z-50 flex items-center justify-center p-6" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-ink">Share link created</h2>
          <button onClick={onClose} className="text-ink/30 hover:text-ink"><X size={18} /></button>
        </div>
        <p className="text-xs text-ink/50 mb-3">Send this link to the brand manager. They can approve or reject each account without logging in.</p>
        <div className="flex items-center gap-2 p-3 bg-mist/40 rounded-lg border border-mist mb-4">
          <p className="font-mono text-xs text-ink/70 truncate flex-1">{url}</p>
          <button onClick={copy} className="flex items-center gap-1 text-xs text-accent hover:text-accent/70 flex-shrink-0 transition-colors">
            {copied ? <Check size={13} /> : <Copy size={13} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
        <button onClick={onClose} className="w-full py-2 bg-ink text-white rounded-lg text-sm hover:bg-ink/80 transition-all">Done</button>
      </div>
    </div>
  )
}

function ResultsTable({ selectedColumns, filtered, expandedRow, setExpandedRow, sortKey, sortDir, toggleSort, liveStats, liveStatus, reviewState, selectedAccounts, onToggleSelect, selectionMode }) {
  const visibleCols = TABLE_COLUMNS.filter((c) => selectedColumns.includes(c.id))
  // Extra leading column for checkbox when in selection mode
  const gridTemplate = selectionMode
    ? `2rem 2fr ${visibleCols.map((c) => c.width).join(' ')}`
    : `2fr ${visibleCols.map((c) => c.width).join(' ')}`

  const SortIcon = ({ k }) => {
    if (sortKey !== k) return <ChevronUp size={12} className="opacity-20" />
    return sortDir === 'desc' ? <ChevronDown size={12} /> : <ChevronUp size={12} />
  }

  const renderCell = (col, r) => {
    try {
      const s = liveStats[r.username]
      const rs = reviewState[r.username]
      switch (col.id) {
        case 'brand':
          return <p className="font-mono text-xs text-ink/70 truncate">{r.sourceBrand || '—'}</p>
        case 'overall':
          return <ScoreBadge score={r.overall} />
        case 'relevancy_score':
          return <MiniBar value={r.scores?.relevancy ?? 0} color="bg-rose/70" />
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
          const val = s?.followerCount ?? r.followerCount
          return <p className="font-mono text-sm text-ink">{val != null ? val.toLocaleString() : '—'}</p>
        }
        case 'account_location':
          return <p className="font-mono text-sm text-ink">{r.accountLocation || '—'}</p>
        case 'engagement_score':
          return <MiniBar value={r.scores?.engagement ?? 0} color="bg-accent/70" />
        case 'live_median_likes':
          if (liveStatus === 'loading' && !s) return <Loader2 size={11} className="animate-spin text-accent/40" />
          if (s?.medianLikes != null) return <p className="font-mono text-sm text-ink">{s.medianLikes.toLocaleString()}</p>
          if (r.xlsxMedianLikes != null) return (
            <div>
              <p className="font-mono text-sm text-ink">{r.xlsxMedianLikes.toLocaleString()}</p>
              <p className="font-mono text-xs text-ink/25">export</p>
            </div>
          )
          return <p className="font-mono text-sm text-ink/30">—</p>
        case 'live_median_views':
          if (liveStatus === 'loading' && !s) return <Loader2 size={11} className="animate-spin text-accent/40" />
          if (s?.medianViews != null) return <p className="font-mono text-sm text-ink">{s.medianViews.toLocaleString()}</p>
          if (r.xlsxMedianViews != null) return (
            <div>
              <p className="font-mono text-sm text-ink">{r.xlsxMedianViews.toLocaleString()}</p>
              <p className="font-mono text-xs text-ink/25">export</p>
            </div>
          )
          return <p className="font-mono text-sm text-ink/30">—</p>
        case 'sample_post_url':
          return r.samplePostUrl ? (
            <a href={r.samplePostUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
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
    <div className="border border-mist rounded-xl overflow-x-auto">
      <div className="grid gap-3 px-4 py-3 bg-mist/50 border-b border-mist text-xs font-mono text-ink/40 uppercase tracking-wider"
        style={{ gridTemplateColumns: gridTemplate }}>
        {selectionMode && <span />}
        <span>Account</span>
        {visibleCols.map((col) => (
          col.sortKey ? (
            <button key={col.id} onClick={() => toggleSort(col.sortKey)} className="flex items-center justify-center gap-1 hover:text-ink">
              {col.label} <SortIcon k={col.sortKey} />{col.infoKey && <InfoTooltip column={col.infoKey} />}
            </button>
          ) : (
            <span key={col.id} className="flex items-center justify-center gap-1">
              {col.label}{col.infoKey && <InfoTooltip column={col.infoKey} />}
            </span>
          )
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="px-4 py-12 text-center text-sm text-ink/30">No accounts match your filters.</div>
      )}
      {filtered.map((r) => (
        <div key={r.username}>
          <div
            className="grid gap-3 px-4 py-3.5 border-b border-mist/50 hover:bg-accent-dim/10 cursor-pointer transition-colors items-center"
            style={{ gridTemplateColumns: gridTemplate }}
            onClick={() => setExpandedRow(expandedRow === r.username ? null : r.username)}
          >
            {selectionMode && (
              <div onClick={(e) => e.stopPropagation()} className="flex items-center justify-center">
                <input
                  type="checkbox"
                  checked={selectedAccounts.has(r.username)}
                  onChange={() => onToggleSelect(r.username)}
                  className="w-4 h-4 accent-accent cursor-pointer"
                />
              </div>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <a href={`https://instagram.com/${r.username}`} target="_blank" rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="font-medium text-sm text-ink hover:text-accent flex items-center gap-1">
                  @{r.username} <ExternalLink size={11} className="opacity-40" />
                </a>
              </div>
              {r.fullName && <p className="text-xs text-ink/40 truncate">{r.fullName}</p>}
              <div className="flex flex-wrap gap-1 mt-1">
                {(r.flags || []).slice(0, 3).map((f) => (
                  <span key={f} className={`tag ${f === 'video-creator' ? 'tag-video' : f === 'bot-risk' ? 'tag-bot' : ''}`}>{f}</span>
                ))}
              </div>
            </div>
            {visibleCols.map((col) => (
              <div key={col.id} className="min-w-0 overflow-hidden flex items-center justify-center">{renderCell(col, r)}</div>
            ))}
          </div>

          {expandedRow === r.username && (
            <div className="px-6 py-4 bg-paper border-b border-mist/50 grid grid-cols-2 gap-6 text-sm">
              <div>
                <p className="text-xs font-mono text-ink/40 uppercase tracking-wider mb-2">Scoring Verdict</p>
                <p className="text-ink/60 text-xs leading-relaxed">{r.verdict || '—'}</p>
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
}

const CACHE_KEY = 'kol_live_stats_v1'
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000

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
  const [selectedColumns, setSelectedColumns] = useState(DEFAULT_SELECTED_COLUMNS)

  // Selection + share state
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedAccounts, setSelectedAccounts] = useState(new Set())
  const [shareStatus, setShareStatus] = useState('idle') // idle | loading | done | error
  const [shareUrl, setShareUrl] = useState(null)
  const [shareId, setShareId] = useState(null)

  // Review state synced from Supabase (Phase 4)
  const [reviewState, setReviewState] = useState({}) // { username: { status, dm_status, dm_draft } }
  const [syncStatus, setSyncStatus] = useState('idle') // idle | loading | done | error

  const [liveStats, setLiveStats] = useState(() => {
    const cache = readCache()
    const now = Date.now()
    const valid = {}
    for (const [u, entry] of Object.entries(cache)) {
      if (now - entry.ts < CACHE_TTL_MS && hasRealData(entry.stats)) valid[u] = entry.stats
    }
    return valid
  })
  const [liveStatus, setLiveStatus] = useState(() => {
    const cache = readCache()
    const hasCached = results.some((r) => hasRealData(cache[r.username]?.stats))
    return hasCached ? 'done' : 'idle'
  })
  const [liveProgress, setLiveProgress] = useState({ done: 0, total: 0 })
  const [liveError, setLiveError] = useState(null)

  const infMap = useMemo(() => {
    const m = {}
    for (const inf of influencers) m[inf.username] = inf
    return m
  }, [influencers])

  const enriched = useMemo(() => {
    return results.map((r) => {
      const live = liveStats[r.username]
      const hasLive = live && (live.medianLikes != null || live.medianViews != null)
      const engScore = hasLive
        ? computeLiveEngagementScore(live.medianLikes, live.medianViews)
        : (r.scores?.engagement ?? 0)
      const overall = Math.round(engScore * 8 + (r.scores?.relevancy ?? 0) * 2)
      return { ...r, ...infMap[r.username], scores: { ...r.scores, engagement: engScore }, overall }
    })
  }, [results, infMap, liveStats])

  const filtered = useMemo(() => {
    let list = enriched.filter((r) => r.overall >= minScore)
    if (filterFlag !== 'all') list = list.filter((r) => (r.flags || []).includes(filterFlag))
    list = [...list].sort((a, b) => {
      const av = sortKey === 'overall' ? a.overall
        : sortKey === 'relevancy' ? (a.scores?.relevancy ?? 0)
        : sortKey === 'eng_score' ? (a.scores?.engagement ?? 0)
        : sortKey === 'engagement' ? (a.engagementRate ?? a.totalEngagement ?? 0)
        : a.overall
      const bv = sortKey === 'overall' ? b.overall
        : sortKey === 'relevancy' ? (b.scores?.relevancy ?? 0)
        : sortKey === 'eng_score' ? (b.scores?.engagement ?? 0)
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

  const highCount = enriched.filter((r) => r.overall >= 70).length
  const midCount = enriched.filter((r) => r.overall >= 45 && r.overall < 70).length

  const handleFetchLive = useCallback(async (usernames, { force = false } = {}) => {
    const cache = readCache()
    const now = Date.now()
    const toFetch = force
      ? usernames
      : usernames.filter((u) => !cache[u] || now - cache[u].ts >= CACHE_TTL_MS || !hasRealData(cache[u].stats))
    if (toFetch.length === 0) { setLiveStatus('done'); return }
    setLiveStatus('loading')
    setLiveProgress({ done: 0, total: toFetch.length })
    setLiveError(null)
    try {
      const statsMap = await fetchBatchStats(toFetch, (done, total) => setLiveProgress({ done, total }))
      const updated = { ...readCache() }
      for (const [u, stats] of Object.entries(statsMap)) {
        if (hasRealData(stats) || !hasRealData(updated[u]?.stats)) updated[u] = { stats, ts: Date.now() }
      }
      writeCache(updated)
      setLiveStats((prev) => ({ ...prev, ...statsMap }))
      setLiveStatus('done')
    } catch (err) {
      setLiveError(err.message)
      setLiveStatus('error')
    }
  }, [])

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

  // Share selected accounts to Supabase
  const handleShare = async () => {
    if (selectedAccounts.size === 0) return
    setShareStatus('loading')
    try {
      const accountsToShare = enriched
        .filter((r) => selectedAccounts.has(r.username))
        .map((r) => ({
          username: r.username,
          fullName: r.fullName || '',
          sourceBrand: r.sourceBrand || '',
          overall: r.overall,
          scores: r.scores,
          accountLocation: r.accountLocation || '',
          followerCount: r.followerCount ?? null,
          engagementRate: r.engagementRate ?? null,
          avgLikes: r.avgLikes ?? 0,
          avgComments: r.avgComments ?? 0,
          hashtags: r.hashtags || [],
          bio: r.bio || '',
          samplePostUrl: r.samplePostUrl || '',
          sampleCaption: r.sampleCaption || '',
          flags: r.flags || [],
          nicheSignals: r.nicheSignals || [],
          verdict: r.verdict || '',
        }))

      const { data, error } = await supabase
        .from('shared_results')
        .insert({
          campaign_brief: config?.campaignBrief || '',
          accounts: accountsToShare,
          review_state: {},
        })
        .select('id')
        .single()

      if (error) throw new Error(error.message)

      const base = window.location.origin + window.location.pathname
      const url = `${base}?review=${data.id}`
      setShareUrl(url)
      setShareId(data.id)
      setShareStatus('done')
    } catch (err) {
      console.error('Share failed:', err)
      setShareStatus('error')
    }
  }

  // Sync review state from Supabase (Phase 4)
  const handleSync = useCallback(async () => {
    if (!shareId) return
    setSyncStatus('loading')
    try {
      const { data, error } = await supabase
        .from('shared_results')
        .select('review_state')
        .eq('id', shareId)
        .single()
      if (error) throw new Error(error.message)
      setReviewState(data.review_state || {})
      setSyncStatus('done')
    } catch (err) {
      console.error('Sync failed:', err)
      setSyncStatus('error')
    }
  }, [shareId])

  return (
    <div className="min-h-screen px-6 py-10 max-w-6xl mx-auto">
      {shareUrl && <ShareModal url={shareUrl} onClose={() => setShareUrl(null)} />}

      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <p className="font-mono text-xs tracking-widest text-ink/40 uppercase mb-2">Step 3 of 3 · Results</p>
          <h1 className="text-2xl font-semibold text-ink mb-1">{filtered.length} accounts scored</h1>
          <p className="text-sm text-ink/50">
            <span className="text-sage font-medium">{highCount} strong matches</span>
            {' · '}
            <span className="text-accent font-medium">{midCount} possible</span>
            {' · '}
            {enriched.length - highCount - midCount} low score
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <ColumnPicker selected={selectedColumns} onChange={setSelectedColumns} />

          {/* Selection + Share controls */}
          {!selectionMode ? (
            <button
              onClick={() => setSelectionMode(true)}
              className="flex items-center gap-2 px-4 py-2 border border-accent/40 text-accent rounded-lg text-sm hover:bg-accent-dim/20 transition-all"
            >
              <Share2 size={15} />
              Share for review
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button onClick={handleSelectAll} className="text-xs text-ink/40 hover:text-ink font-mono px-2 py-1 border border-mist rounded">
                Select all
              </button>
              <span className="text-xs font-mono text-ink/50">{selectedAccounts.size} selected</span>
              <button
                onClick={handleShare}
                disabled={selectedAccounts.size === 0 || shareStatus === 'loading'}
                className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg text-sm hover:bg-accent/80 transition-all disabled:opacity-40"
              >
                {shareStatus === 'loading' ? <Loader2 size={15} className="animate-spin" /> : <Share2 size={15} />}
                {shareStatus === 'loading' ? 'Sharing…' : 'Create link'}
              </button>
              <button onClick={() => { setSelectionMode(false); setSelectedAccounts(new Set()) }}
                className="text-xs text-ink/40 hover:text-ink px-2 py-1 border border-mist rounded">
                Cancel
              </button>
            </div>
          )}

          {/* Sync button (shows once a share exists) */}
          {shareId && (
            <button
              onClick={handleSync}
              disabled={syncStatus === 'loading'}
              className="flex items-center gap-2 px-3 py-2 border border-mist rounded-lg text-sm text-ink/50 hover:border-ink/30 hover:text-ink transition-all"
              title="Sync approval + DM status from the review link"
            >
              {syncStatus === 'loading' ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              Sync reviews
            </button>
          )}

          {/* Live stats */}
          {liveStatus === 'loading' ? (
            <div className="flex items-center gap-2 px-4 py-2 border border-mist rounded-lg text-sm text-ink/50">
              <Loader2 size={15} className="animate-spin" />
              Fetching {liveProgress.done}/{liveProgress.total}
            </div>
          ) : liveStatus === 'error' ? (
            <button onClick={() => handleFetchLive(results.map((r) => r.username), { force: true })}
              className="flex items-center gap-2 px-4 py-2 border border-rose/40 text-rose rounded-lg text-sm hover:bg-rose/5 transition-all">
              <RefreshCw size={15} /> Retry
            </button>
          ) : liveStatus === 'done' ? (
            <button onClick={() => handleFetchLive(results.map((r) => r.username), { force: true })}
              className="flex items-center gap-2 px-4 py-2 border border-mist rounded-lg text-sm text-ink/40 hover:border-ink/30 hover:text-ink transition-all">
              <RefreshCw size={15} /> Refresh
            </button>
          ) : (
            <button onClick={() => handleFetchLive(results.map((r) => r.username))}
              className="flex items-center gap-2 px-4 py-2 border border-accent/40 text-accent rounded-lg text-sm hover:bg-accent-dim/20 transition-all">
              <RefreshCw size={15} /> Fetch Live Stats
            </button>
          )}

          <button
            onClick={() => {
              const exportIds = [
                ...ALWAYS_EXPORT_IDS,
                ...TABLE_COLUMNS.filter((c) => selectedColumns.includes(c.id)).flatMap((c) => c.exportIds),
              ]
              exportToCsv(filtered, influencers, exportIds, liveStats, reviewState).catch(console.error)
            }}
            className="flex items-center gap-2 px-4 py-2 bg-ink text-white rounded-lg text-sm hover:bg-ink/80 transition-all"
          >
            <Download size={15} /> Export XLSX
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex items-center gap-1.5 text-xs text-ink/40 font-mono"><Filter size={12} />Filter:</div>
        {['all', 'video-creator', 'beauty-niche', 'paid-collab-history', 'bot-risk'].map((f) => (
          <button key={f} onClick={() => setFilterFlag(f)}
            className={`px-2.5 py-1 rounded-full text-xs border transition-all ${filterFlag === f ? 'bg-ink text-white border-ink' : 'border-mist text-ink/50 hover:border-ink/30'}`}>
            {f === 'all' ? 'All' : f}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-ink/40 font-mono">Min score:</span>
          <input type="number" value={minScore} onChange={(e) => setMinScore(Number(e.target.value))}
            min="0" max="100" className="w-16 px-2 py-1 border border-mist rounded text-xs font-mono bg-white focus:outline-none focus:border-accent" />
        </div>
      </div>

      {liveStatus === 'error' && (
        <div className="mb-4 px-4 py-3 bg-rose/5 border border-rose/20 rounded-xl text-xs text-rose">Live fetch failed: {liveError}</div>
      )}
      {shareStatus === 'error' && (
        <div className="mb-4 px-4 py-3 bg-rose/5 border border-rose/20 rounded-xl text-xs text-rose">Failed to create share link. Check your Supabase env vars.</div>
      )}

      {selectionMode && (
        <div className="mb-4 px-4 py-3 bg-accent-dim/20 border border-accent/20 rounded-xl text-xs text-accent/80">
          Tick the accounts you want the brand manager to review, then click <strong>Create link</strong>.
        </div>
      )}

      <TableErrorBoundary>
        <ResultsTable
          selectedColumns={selectedColumns}
          filtered={filtered}
          expandedRow={expandedRow}
          setExpandedRow={setExpandedRow}
          sortKey={sortKey}
          sortDir={sortDir}
          toggleSort={toggleSort}
          liveStats={liveStats}
          liveStatus={liveStatus}
          reviewState={reviewState}
          selectedAccounts={selectedAccounts}
          onToggleSelect={handleToggleSelect}
          selectionMode={selectionMode}
        />
      </TableErrorBoundary>

      <p className="mt-4 text-xs text-ink/25 font-mono text-center">
        Click any row to expand · Engagement &amp; Relevancy scores are deterministic keyword + arithmetic logic
      </p>
    </div>
  )
}
