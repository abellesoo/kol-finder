import { useState, useCallback } from 'react'
import { Search, Loader2, Heart, Eye, EyeOff, ExternalLink, AlertCircle } from 'lucide-react'
import { startReelScraper, getRun, getDatasetItems } from '../lib/apifyApi'

function extractUsername(input) {
  const trimmed = input.trim().replace(/^@/, '')
  const match = trimmed.match(/instagram\.com\/([^/?#]+)/)
  return match ? match[1] : trimmed
}

function median(arr) {
  if (arr.length === 0) return null
  const sorted = [...arr].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid]
}

function computeStats(items) {
  const cutoff = new Date()
  cutoff.setMonth(cutoff.getMonth() - 3)

  const recent = items.filter(
    (item) => item.timestamp && new Date(item.timestamp) >= cutoff
  )
  const withLikes = recent.filter(
    (p) => typeof p.likesCount === 'number' && p.likesCount >= 0
  )
  const hiddenCount = recent.filter(
    (p) => p.likesCount === -1 || p.likesCount == null
  ).length

  const avgLikes = median(withLikes.map((p) => p.likesCount))

  const withViews = recent.filter(
    (p) => typeof p.videoViewCount === 'number' && p.videoViewCount > 0
  )
  const avgViews = median(withViews.map((p) => p.videoViewCount))

  return {
    total: recent.length,
    hiddenCount,
    avgLikes,
    avgViews,
    posts: [...recent]
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .slice(0, 20),
  }
}

export default function KolLookup() {
  const [input, setInput] = useState('')
  const [status, setStatus] = useState('idle') // idle | starting | running | fetching | done | error
  const [error, setError] = useState(null)
  const [stats, setStats] = useState(null)
  const [resolvedUsername, setResolvedUsername] = useState(null)

  const handleFetch = useCallback(async () => {
    if (!input.trim()) return
    const user = extractUsername(input)
    setResolvedUsername(user)
    setStats(null)
    setError(null)
    setStatus('starting')

    try {
      const run = await startReelScraper(user)
      setStatus('running')

      let runData = run
      while (runData.status === 'READY' || runData.status === 'RUNNING') {
        await new Promise((r) => setTimeout(r, 3000))
        runData = await getRun(run.id)
      }

      if (runData.status !== 'SUCCEEDED') {
        throw new Error(`Actor run ${runData.status.toLowerCase()}`)
      }

      setStatus('fetching')
      const items = await getDatasetItems(runData.defaultDatasetId)
      setStats(computeStats(items))
      setStatus('done')
    } catch (err) {
      setError(err.message)
      setStatus('error')
    }
  }, [input])

  const isLoading = ['starting', 'running', 'fetching'].includes(status)

  const statusLabel = {
    starting: 'Starting actor...',
    running: 'Scraping Instagram reels...',
    fetching: 'Processing results...',
  }[status]

  return (
    <div className="min-h-screen px-6 py-10 max-w-2xl mx-auto">
      <div className="mb-8">
        <p className="font-mono text-xs tracking-widest text-ink/40 uppercase mb-2">
          Apify · Live Data
        </p>
        <h1 className="text-2xl font-semibold text-ink mb-1">Profile Analyzer</h1>
        <p className="text-sm text-ink/50">
          Fetch real-time reels data and calculate median likes over the last 90 days.
        </p>
      </div>

      {/* Input */}
      <div className="flex gap-2 mb-8">
        <div className="flex-1 flex items-center gap-2 px-4 py-3 border border-mist rounded-xl focus-within:border-accent transition-colors bg-white">
          <Search size={16} className="text-ink/30 shrink-0" />
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !isLoading && handleFetch()}
            placeholder="@username or instagram.com/username/reels/"
            className="flex-1 text-sm text-ink bg-transparent outline-none placeholder:text-ink/30"
          />
        </div>
        <button
          onClick={handleFetch}
          disabled={isLoading || !input.trim()}
          className="px-5 py-3 bg-ink text-white rounded-xl text-sm font-medium hover:bg-ink/80 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap"
        >
          {isLoading && <Loader2 size={15} className="animate-spin" />}
          {isLoading ? 'Fetching...' : 'Analyze'}
        </button>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="text-center py-16">
          <Loader2 size={24} className="animate-spin text-accent mx-auto mb-3" />
          <p className="text-sm text-ink/60">{statusLabel}</p>
          {status === 'running' && (
            <p className="text-xs text-ink/30 mt-1">This usually takes 1–2 minutes...</p>
          )}
        </div>
      )}

      {/* Error */}
      {status === 'error' && (
        <div className="flex items-start gap-3 px-4 py-4 bg-rose/5 border border-rose/20 rounded-xl text-sm">
          <AlertCircle size={16} className="text-rose shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-ink">Scrape failed</p>
            <p className="text-ink/50 text-xs mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Results */}
      {status === 'done' && stats && (
        <div>
          {/* Profile header */}
          <div className="flex items-center justify-between mb-5">
            <div>
              <p className="font-mono text-xs text-ink/40 uppercase tracking-wider mb-0.5">
                Results for
              </p>
              <a
                href={`https://www.instagram.com/${resolvedUsername}/reels/`}
                target="_blank"
                rel="noreferrer"
                className="text-lg font-semibold text-ink hover:text-accent flex items-center gap-1.5 transition-colors"
              >
                @{resolvedUsername}
                <ExternalLink size={14} className="opacity-40" />
              </a>
            </div>
            <span className="font-mono text-xs text-ink/30">
              Last 90 days · {stats.total} reels
            </span>
          </div>

          {/* Stat cards */}
          <div className="grid grid-cols-3 gap-3 mb-6">
            <div className="border border-mist rounded-xl px-4 py-4">
              <div className="flex items-center gap-1.5 mb-2">
                <Heart size={13} className="text-rose/70" />
                <p className="font-mono text-xs text-ink/40 uppercase tracking-wider">
                  Median Likes
                </p>
              </div>
              <p className="text-2xl font-semibold text-ink">
                {stats.avgLikes !== null ? stats.avgLikes.toLocaleString() : '—'}
              </p>
              {stats.hiddenCount > 0 && (
                <p className="text-xs text-ink/30 mt-1 font-mono">
                  excl. {stats.hiddenCount} hidden
                </p>
              )}
            </div>

            <div className="border border-mist rounded-xl px-4 py-4">
              <div className="flex items-center gap-1.5 mb-2">
                <Eye size={13} className="text-accent/70" />
                <p className="font-mono text-xs text-ink/40 uppercase tracking-wider">
                  Median Views
                </p>
              </div>
              <p className="text-2xl font-semibold text-ink">
                {stats.avgViews !== null ? stats.avgViews.toLocaleString() : '—'}
              </p>
            </div>

            <div className="border border-mist rounded-xl px-4 py-4">
              <div className="flex items-center gap-1.5 mb-2">
                <EyeOff size={13} className="text-ink/30" />
                <p className="font-mono text-xs text-ink/40 uppercase tracking-wider">
                  Hidden Likes
                </p>
              </div>
              <p className="text-2xl font-semibold text-ink">{stats.hiddenCount}</p>
              <p className="text-xs text-ink/30 mt-1 font-mono">of {stats.total} posts</p>
            </div>
          </div>

          {stats.avgLikes === null && stats.total > 0 && (
            <div className="mb-5 px-4 py-3 bg-mist/50 rounded-xl text-xs text-ink/50">
              All like counts are hidden for this account — Instagram does not expose this
              data publicly.
            </div>
          )}

          {stats.total === 0 && (
            <p className="text-center text-sm text-ink/40 py-8">
              No reels found in the last 90 days.
            </p>
          )}

          {/* Post list */}
          {stats.posts.length > 0 && (
            <div className="border border-mist rounded-xl overflow-hidden">
              <div className="grid grid-cols-[1fr_80px_80px_60px] gap-3 px-4 py-2.5 bg-mist/50 border-b border-mist text-xs font-mono text-ink/40 uppercase tracking-wider">
                <span>Post</span>
                <span>Likes</span>
                <span>Views</span>
                <span>Date</span>
              </div>
              {stats.posts.map((post, i) => (
                <div
                  key={post.url || i}
                  className="grid grid-cols-[1fr_80px_80px_60px] gap-3 px-4 py-3 border-b border-mist/50 last:border-0 items-center"
                >
                  <a
                    href={post.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-ink/50 hover:text-accent truncate flex items-center gap-1 transition-colors"
                  >
                    {post.caption
                      ? post.caption.slice(0, 55).trim() +
                        (post.caption.length > 55 ? '…' : '')
                      : 'Reel'}
                    <ExternalLink size={10} className="opacity-40 shrink-0" />
                  </a>
                  <span
                    className={`font-mono text-sm ${
                      post.likesCount === -1 || post.likesCount == null
                        ? 'text-ink/25'
                        : 'text-ink'
                    }`}
                  >
                    {post.likesCount === -1 || post.likesCount == null
                      ? '—'
                      : post.likesCount.toLocaleString()}
                  </span>
                  <span className="font-mono text-sm text-ink/60">
                    {post.videoViewCount ? post.videoViewCount.toLocaleString() : '—'}
                  </span>
                  <span className="font-mono text-xs text-ink/30 whitespace-nowrap">
                    {new Date(post.timestamp).toLocaleDateString('en-GB', {
                      day: 'numeric',
                      month: 'short',
                    })}
                  </span>
                </div>
              ))}
            </div>
          )}

          <p className="mt-4 text-xs text-ink/25 font-mono text-center">
            Like counts marked — are hidden by the creator · Data via Apify
          </p>
        </div>
      )}
    </div>
  )
}
