import { useState, useMemo, useRef, useEffect } from 'react'
import { Download, ExternalLink, ChevronUp, ChevronDown, Filter, Columns, Info } from 'lucide-react'
import { exportToCsv, EXPORT_COLUMNS, DEFAULT_COLUMNS } from '../lib/exportCsv'

const COLUMN_INFO = {
  overall: {
    title: 'Overall Score (0–100)',
    lines: [
      'A weighted combination of all four sub-scores:',
      '· Niche fit × 3.5',
      '· Location match × 3.0',
      '· Content format × 2.0',
      '· Bot risk (authenticity) × 1.5',
      'Higher = stronger KOL candidate for your search.',
    ],
  },
  niche: {
    title: 'Niche Score (0–10)',
    lines: [
      "How well the account's content matches your target niches.",
      'Scans captions, hashtags, and display name for niche keywords.',
      '· 8–10 = very strong niche match',
      '· 5–7 = some relevant content',
      '· 0–4 = little or no niche signal',
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
}

function InfoTooltip({ column }) {
  const [visible, setVisible] = useState(false)
  const info = COLUMN_INFO[column]
  if (!info) return null
  return (
    <span className="relative inline-flex items-center" onClick={(e) => e.stopPropagation()}>
      <button
        onMouseEnter={() => setVisible(true)}
        onMouseLeave={() => setVisible(false)}
        onClick={() => setVisible((v) => !v)}
        className="text-ink/30 hover:text-accent transition-colors ml-0.5"
      >
        <Info size={11} />
      </button>
      {visible && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 bg-ink text-white text-xs rounded-xl px-4 py-3 shadow-xl z-20 pointer-events-none">
          <p className="font-semibold mb-1.5 text-white/90">{info.title}</p>
          {info.lines.map((line, i) => (
            <p key={i} className={`leading-relaxed ${line.startsWith('·') ? 'text-white/60 pl-1' : 'text-white/75'}`}>
              {line}
            </p>
          ))}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-ink" />
        </div>
      )}
    </span>
  )
}

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
        {selected.length < EXPORT_COLUMNS.length && (
          <span className="font-mono text-xs bg-accent text-white rounded-full px-1.5 py-0.5 leading-none">
            {selected.length}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 bg-white border border-mist rounded-xl shadow-lg z-10 p-3">
          <p className="text-xs font-mono text-ink/40 uppercase tracking-wider mb-2">Export columns</p>
          <div className="space-y-1">
            {EXPORT_COLUMNS.map((col) => (
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
              onClick={() => onChange(DEFAULT_COLUMNS)}
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

export default function ResultsStep({ results, influencers, config }) {
  const [sortKey, setSortKey] = useState('overall')
  const [sortDir, setSortDir] = useState('desc')
  const [filterFlag, setFilterFlag] = useState('all')
  const [minScore, setMinScore] = useState(0)
  const [expandedRow, setExpandedRow] = useState(null)
  const [selectedColumns, setSelectedColumns] = useState(DEFAULT_COLUMNS)

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
        : sortKey === 'niche' ? (a.scores?.niche ?? 0)
        : sortKey === 'location' ? (a.scores?.location ?? 0)
        : sortKey === 'engagement' ? a.totalEngagement
        : a.overall
      const bv = sortKey === 'overall' ? b.overall
        : sortKey === 'niche' ? (b.scores?.niche ?? 0)
        : sortKey === 'location' ? (b.scores?.location ?? 0)
        : sortKey === 'engagement' ? b.totalEngagement
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
          <button
            onClick={() => exportToCsv(filtered, influencers, selectedColumns)}
            className="flex items-center gap-2 px-4 py-2 bg-ink text-white rounded-lg text-sm hover:bg-ink/80 transition-all"
          >
            <Download size={15} />
            Export CSV
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

      {/* Table */}
      <div className="border border-mist rounded-xl overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr] gap-4 px-4 py-3 bg-mist/50 border-b border-mist text-xs font-mono text-ink/40 uppercase tracking-wider">
          <span>Account</span>
          <button onClick={() => toggleSort('overall')} className="flex items-center gap-1 hover:text-ink">
            Overall <SortIcon k="overall" /><InfoTooltip column="overall" />
          </button>
          <button onClick={() => toggleSort('niche')} className="flex items-center gap-1 hover:text-ink">
            Niche <SortIcon k="niche" /><InfoTooltip column="niche" />
          </button>
          <button onClick={() => toggleSort('location')} className="flex items-center gap-1 hover:text-ink">
            Location <SortIcon k="location" /><InfoTooltip column="location" />
          </button>
          <button onClick={() => toggleSort('engagement')} className="flex items-center gap-1 hover:text-ink">
            Engagement <SortIcon k="engagement" />
          </button>
          <span>Format</span>
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
              className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr] gap-4 px-4 py-3.5 border-b border-mist/50 hover:bg-accent-dim/10 cursor-pointer transition-colors items-center"
              onClick={() => setExpandedRow(expandedRow === r.username ? null : r.username)}
            >
              {/* Account */}
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

              {/* Overall */}
              <ScoreBadge score={r.overall} />

              {/* Niche */}
              <MiniBar value={r.scores?.niche ?? 0} color="bg-rose/70" />

              {/* Location */}
              <MiniBar value={r.scores?.location ?? 0} color="bg-sage/70" />

              {/* Engagement */}
              <div>
                <p className="font-mono text-sm text-ink">{(r.avgLikes || 0).toLocaleString()}</p>
                <p className="font-mono text-xs text-ink/30">{(r.avgComments || 0).toLocaleString()} cmts</p>
              </div>

              {/* Format */}
              <div>
                <p className="font-mono text-xs text-ink">{r.videoRatio ?? 0}% video</p>
                <p className="text-xs text-ink/30">{r.postCount ?? 0} posts</p>
              </div>
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

      <p className="mt-4 text-xs text-ink/25 font-mono text-center">
        Click any row to expand · Scores generated by Claude AI · Always verify manually
      </p>
    </div>
  )
}
