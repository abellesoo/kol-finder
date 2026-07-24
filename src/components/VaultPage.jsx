import { useState, useEffect, useMemo, useRef } from 'react'
import { Loader2, Trash2, ExternalLink, Search, BookMarked, Rocket, X, Check, Download, BookmarkPlus, AlertCircle } from 'lucide-react'
import { listVault, removeFromVault, saveToVault } from '../lib/vault'
import { listCampaigns, attachKols } from '../lib/campaigns'
import { startReelScraper, pollUntilDone, getDatasetItems } from '../lib/apifyApi'
import { computeStats } from '../lib/computeStats'
import { profileUrl } from '../lib/platforms'
import { supabase } from '../lib/supabase'
import PageHeader from './core/PageHeader'
import Loading from './core/Loading'
import EmptyState from './core/EmptyState'
import { formatDate } from '../lib/utils'
import { useFocusTrap } from '../hooks/useFocusTrap'

// Pull a bare Instagram handle out of what the user typed — accepts "@handle",
// "handle", or a pasted instagram.com/handle URL.
function extractHandle(input) {
  const trimmed = String(input || '').trim().replace(/^@/, '')
  const match = trimmed.match(/instagram\.com\/([^/?#]+)/)
  return (match ? match[1] : trimmed).toLowerCase()
}

// A plausible IG handle — so we only offer a live lookup for something scrapeable,
// not a free-text search like "beauty creators".
function isLikelyHandle(s) {
  return /^[a-z0-9._]{1,30}$/.test(s)
}

// Escape a value for a CSV cell (quote if it contains a comma, quote, or newline).
function csvCell(v) {
  const s = v == null ? '' : String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function downloadCsv(rows, filename) {
  const headers = ['handle', 'platform', 'name', 'followers', 'avg_likes', 'ai_score', 'niches', 'profile_url', 'saved_on']
  const lines = [headers.join(',')]
  for (const r of rows) lines.push(headers.map((h) => csvCell(r[h])).join(','))
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}


function num(n) {
  return n != null ? Number(n).toLocaleString() : '—'
}

// Campaign picker — pick a campaign to drop the selected creators into.
function CampaignPickerModal({ count, onClose, onPick }) {
  const [campaigns, setCampaigns] = useState(null)
  const [error, setError] = useState(null)
  const [attachingId, setAttachingId] = useState(null)
  const dialogRef = useFocusTrap(true)

  useEffect(() => {
    listCampaigns()
      .then(setCampaigns)
      .catch((e) => setError(e.message))
  }, [])

  // Read onClose through a ref so an inline parent callback doesn't tear down
  // and re-add the listener on every parent re-render (e.g. a toast update).
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onCloseRef.current()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 px-4" onClick={onClose}>
      <div ref={dialogRef} role="dialog" aria-modal="true" className="bg-white rounded-[16px] w-full max-w-md max-h-[80vh] flex flex-col shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-mist flex items-center justify-between">
          <div>
            <p className="font-mono text-[9.5px] tracking-[.14em] text-faint uppercase mb-0.5">Add to campaign</p>
            <h2 className="text-[16px] font-serif font-bold text-ink">{count} creator{count === 1 ? '' : 's'}</h2>
          </div>
          <button onClick={onClose} className="text-faint hover:text-ink"><X size={18} /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {error ? (
            <p className="text-rose text-sm px-2 py-6 text-center">{error}</p>
          ) : campaigns === null ? (
            <div className="flex items-center justify-center py-10 gap-2 text-faint">
              <Loader2 size={14} className="animate-spin" /> <span className="text-sm">Loading campaigns…</span>
            </div>
          ) : campaigns.length === 0 ? (
            <p className="text-muted text-sm px-2 py-6 text-center">No campaigns yet. Create one on the Campaigns tab first.</p>
          ) : (
            <div className="flex flex-col gap-1">
              {campaigns.map((c) => (
                <button
                  key={c.id}
                  disabled={attachingId != null}
                  onClick={async () => {
                    setAttachingId(c.id)
                    try {
                      await onPick(c)
                    } finally {
                      setAttachingId(null)
                    }
                  }}
                  className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-[10px] text-left hover:bg-surface transition-colors disabled:opacity-50"
                >
                  <div className="min-w-0">
                    <p className="text-[13.5px] font-medium text-ink truncate">{c.name}</p>
                    <p className="font-mono text-[10.5px] text-faint">{[c.brand, c.market, c.status].filter(Boolean).join(' · ') || 'no brand set'}</p>
                  </div>
                  {attachingId === c.id
                    ? <Loader2 size={14} className="animate-spin text-faint flex-shrink-0" />
                    : <Rocket size={14} className="text-faint flex-shrink-0" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default function VaultPage({ onNavigate }) {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [query, setQuery] = useState('')
  const [nicheFilter, setNicheFilter] = useState(null)
  const [selected, setSelected] = useState(() => new Set())
  const [picking, setPicking] = useState(false)
  const [toast, setToast] = useState(null) // { text, kind: 'ok' | 'error' } | null
  const [lookupStatus, setLookupStatus] = useState('idle') // idle | loading | error
  const [lookupError, setLookupError] = useState(null)
  // Guards the ~1-2 min live-scrape chain in handleLookup against setState after
  // the user navigates away.
  const mountedRef = useRef(true)
  useEffect(() => () => { mountedRef.current = false }, [])

  // Single auto-dismiss timer for the toast. A per-call setTimeout would let a
  // second toast's arrival cancel the first toast's timer early (and never gets
  // cleaned up on unmount); one effect keyed on `toast` avoids both.
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  useEffect(() => {
    if (!supabase) { setLoading(false); return }
    listVault()
      .then((data) => { setRows(data); setLoading(false) })
      .catch((err) => { console.error('Failed to load vault', err); setLoadError(true); setLoading(false) })
  }, [])

  // Distinct niche tags for the filter chips.
  const allNiches = useMemo(() => {
    const s = new Set()
    for (const r of rows) for (const t of r.niche_tags || []) s.add(t)
    return Array.from(s).sort()
  }, [rows])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter((r) => {
      if (nicheFilter && !(r.niche_tags || []).includes(nicheFilter)) return false
      if (!q) return true
      return r.handle.toLowerCase().includes(q) || (r.display_name || '').toLowerCase().includes(q)
    })
  }, [rows, query, nicheFilter])

  const toggleSelect = (id) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  const allVisibleSelected = filtered.length > 0 && filtered.every((r) => selected.has(r.id))
  const toggleSelectAll = () => {
    setSelected((prev) => {
      if (allVisibleSelected) {
        const next = new Set(prev)
        for (const r of filtered) next.delete(r.id)
        return next
      }
      return new Set([...prev, ...filtered.map((r) => r.id)])
    })
  }

  const selectedRows = rows.filter((r) => selected.has(r.id))

  const handleRemove = async (row) => {
    // Snapshot the current list so a failed delete can restore the row exactly
    // where it was, instead of a jarring native alert + full page reload.
    const prevRows = rows
    setRows((prev) => prev.filter((r) => r.id !== row.id))
    setSelected((prev) => { const n = new Set(prev); n.delete(row.id); return n })
    try {
      await removeFromVault(row.id)
    } catch (err) {
      console.error('Failed to remove from vault', err)
      setRows(prevRows)
      setToast({ text: 'Couldn’t remove that creator — please try again.', kind: 'error' })
    }
  }

  const handlePickCampaign = async (campaign) => {
    // campaign_kols is Instagram-only end-to-end — skip any Threads creators and
    // tell the user rather than silently dropping them.
    const igRows = selectedRows.filter((r) => (r.platform || 'instagram') !== 'threads')
    const skipped = selectedRows.length - igRows.length
    const kols = igRows.map((r) => ({ handle: r.handle, username: r.handle, runId: r.source_run_id }))
    try {
      const added = await attachKols(campaign.id, kols)
      setPicking(false)
      setSelected(new Set())
      const parts = [`Added ${added} to ${campaign.name}`]
      if (added < igRows.length) parts.push(`${igRows.length - added} already on it`)
      if (skipped) parts.push(`${skipped} Threads skipped`)
      setToast({ text: parts.join(' · '), kind: 'ok' })
    } catch (err) {
      console.error('Attach to campaign failed', err)
      setToast({ text: err?.message || 'Failed to attach to campaign — please try again.', kind: 'error' })
    }
  }

  // Scrape a single handle live (same pipeline as the Profile Analyzer) and drop
  // it straight into the vault — so the search box can *add* a creator, not just
  // filter ones already saved.
  const lookupHandle = extractHandle(query)
  const showLookup =
    !loading && !loadError && isLikelyHandle(lookupHandle) && filtered.length === 0

  const handleLookup = async () => {
    const handle = extractHandle(query)
    if (!handle) return
    setLookupStatus('loading')
    setLookupError(null)
    try {
      const run = await startReelScraper(handle)
      const completed = await pollUntilDone(run)
      const items = await getDatasetItems(completed.defaultDatasetId)
      const stats = computeStats(items)
      if (stats.totalScraped === 0) {
        throw new Error('No public reels found — check the spelling, or the account may be private.')
      }
      const fullName = items.map((it) => it.ownerFullName).find(Boolean) || null
      const saved = await saveToVault({
        username: handle,
        platform: 'instagram',
        fullName,
        followerCount: stats.followerCount,
        avgLikes: stats.medianLikes,
        aiScore: null,
      })
      if (!mountedRef.current) return
      setRows((prev) => [saved, ...prev.filter((r) => r.id !== saved.id)])
      setLookupStatus('idle')
      setToast({ text: `Saved @${handle} to the vault`, kind: 'ok' })
    } catch (err) {
      console.error('Vault lookup failed', err)
      if (!mountedRef.current) return
      setLookupError(err.message)
      setLookupStatus('error')
    }
  }

  const handleExport = () => {
    const src = selectedRows.length ? selectedRows : filtered
    downloadCsv(
      src.map((r) => ({
        handle: r.handle,
        platform: r.platform,
        name: r.display_name || '',
        followers: r.follower_count ?? '',
        avg_likes: r.avg_likes ?? '',
        ai_score: r.ai_score ?? '',
        niches: (r.niche_tags || []).join(' '),
        profile_url: r.profile_url || '',
        saved_on: formatDate(r.created_at),
      })),
      'creator-vault.csv'
    )
  }

  return (
    <div className="min-h-screen px-[48px] py-[40px] max-w-6xl mx-auto">
      <PageHeader
        className="mb-8"
        label="Creator Vault"
        title="Saved creators"
        count={!loading && !loadError && rows.length ? rows.length : null}
        subtitle="Creators you’ve starred from a run or review. Reuse them in a campaign without re-scraping — metrics are a snapshot from when each was saved."
      />

      {/* Controls */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search saved creators — or type a handle to add one…"
            className="w-full pl-9 pr-3 py-2 rounded-[10px] border border-mist bg-white text-[13.5px] text-ink placeholder:text-faint focus:outline-none focus:border-ink/30"
          />
        </div>
        {filtered.length > 0 && (
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-3 py-2 rounded-[10px] border border-mist text-[13px] text-body hover:bg-surface transition-colors"
          >
            <Download size={13} /> Export CSV
          </button>
        )}
      </div>

      {allNiches.length > 0 && (
        <div className="flex items-center gap-1.5 mb-6 flex-wrap">
          <button
            onClick={() => setNicheFilter(null)}
            className={`font-mono text-[11px] px-2.5 py-1 rounded-full border transition-colors ${nicheFilter === null ? 'bg-ink text-white border-ink' : 'border-mist text-body hover:bg-surface'}`}
          >
            All
          </button>
          {allNiches.map((t) => (
            <button
              key={t}
              onClick={() => setNicheFilter(nicheFilter === t ? null : t)}
              className={`font-mono text-[11px] px-2.5 py-1 rounded-full border transition-colors ${nicheFilter === t ? 'bg-ink text-white border-ink' : 'border-mist text-body hover:bg-surface'}`}
            >
              {t}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <Loading label="Loading vault…" />
      ) : loadError ? (
        <EmptyState
          icon={X}
          title="Couldn’t load the vault"
          description="Something went wrong reading your saved creators. Check your connection and try again."
          action={
            <button onClick={() => window.location.reload()} className="px-4 py-2 bg-ink text-white rounded-[10px] text-[13px] hover:bg-ink/85 transition-all">Retry</button>
          }
        />
      ) : showLookup ? (
        <div className="flex flex-col items-center py-16 text-center">
          <BookmarkPlus size={30} className="text-faint mb-4" />
          <h2 className="text-[17px] font-semibold text-ink mb-1">
            @{lookupHandle} isn’t in your vault yet
          </h2>
          <p className="text-[13.5px] text-muted max-w-sm mb-5">
            Look them up live on Instagram and save them here — no full Seeder run needed.
            Metrics come from the last 90 days of reels.
          </p>
          {lookupStatus === 'loading' ? (
            <div className="flex flex-col items-center gap-1.5 text-faint">
              <div className="flex items-center gap-2">
                <Loader2 size={15} className="animate-spin" />
                <span className="text-sm text-body">Scraping @{lookupHandle}…</span>
              </div>
              <span className="text-xs text-faint">This usually takes 1–2 minutes.</span>
            </div>
          ) : (
            <>
              <button
                onClick={handleLookup}
                className="flex items-center gap-2 px-4 py-2.5 bg-ink text-white rounded-[10px] text-[13.5px] font-medium hover:bg-ink/85 transition-colors"
              >
                <Search size={14} /> Look up @{lookupHandle} & save
              </button>
              {lookupStatus === 'error' && (
                <div className="flex items-start gap-2 mt-4 max-w-sm text-left px-3 py-2.5 bg-rose/5 border border-rose/20 rounded-[10px]">
                  <AlertCircle size={15} className="text-rose shrink-0 mt-0.5" />
                  <p className="text-xs text-body">{lookupError}</p>
                </div>
              )}
            </>
          )}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={BookMarked}
          title="No saved creators yet"
          description="Search a handle above to add one — or click the bookmark beside any handle on a Seeder results table or a review to save that creator here."
        />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Search} title="No matches" description="No saved creators match your search or niche filter. Try clearing the filter." />
      ) : (
        <div className="border border-mist rounded-[14px] overflow-hidden">
          <div className="overflow-x-auto">
            <div className="min-w-[720px]">
              {/* Header */}
              <div className="grid items-center gap-3 px-4 py-2.5 bg-surface border-b border-mist font-mono text-[9.5px] tracking-[.12em] text-faint uppercase"
                   style={{ gridTemplateColumns: '28px 2fr 1fr 1fr 0.8fr 2fr 1fr 32px' }}>
                <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAll} className="w-4 h-4 accent-ink cursor-pointer" />
                <span>Creator</span>
                <span className="text-right">Followers</span>
                <span className="text-right">Avg likes</span>
                <span className="text-center">AI fit</span>
                <span>Niches</span>
                <span>Saved</span>
                <span />
              </div>
              {filtered.map((r) => (
                <div key={r.id}
                     className="grid items-center gap-3 px-4 py-3 border-b border-[#F0ECE2] last:border-0 hover:bg-surface transition-colors"
                     style={{ gridTemplateColumns: '28px 2fr 1fr 1fr 0.8fr 2fr 1fr 32px' }}>
                  <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleSelect(r.id)} className="w-4 h-4 accent-ink cursor-pointer" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <a href={r.profile_url || profileUrl({ username: r.handle, platform: r.platform })} target="_blank" rel="noreferrer"
                         className="font-medium text-sm text-ink hover:text-ink/70 flex items-center gap-1">
                        @{r.handle} <ExternalLink size={11} className="opacity-40" />
                      </a>
                      {r.platform === 'threads' && (
                        <span className="font-mono text-[9px] bg-ink/10 text-ink/70 px-1.5 py-0.5 rounded-[4px]">Threads</span>
                      )}
                    </div>
                    {r.display_name && <p className="text-xs text-ink/40 truncate">{r.display_name}</p>}
                  </div>
                  <span className="font-mono text-[12.5px] text-ink text-right">{num(r.follower_count)}</span>
                  <span className="font-mono text-[12.5px] text-ink text-right">{num(r.avg_likes)}</span>
                  <span className="font-mono text-[12.5px] text-center text-body">{r.ai_score != null ? `${r.ai_score}/10` : '—'}</span>
                  <div className="flex flex-wrap gap-1">
                    {(r.niche_tags || []).slice(0, 3).map((t) => (
                      <span key={t} className="font-mono text-[10px] bg-mist px-2 py-0.5 rounded-[5px] text-body">{t}</span>
                    ))}
                  </div>
                  <span className="font-mono text-[11px] text-faint">{formatDate(r.created_at)}</span>
                  <button onClick={() => handleRemove(r)} title="Remove from vault" className="text-faint hover:text-rose transition-colors flex justify-center">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 bg-ink text-white pl-5 pr-3 py-2.5 rounded-full shadow-xl">
          <span className="text-[13px] font-medium">{selected.size} selected</span>
          <button onClick={() => setSelected(new Set())} className="text-white/60 hover:text-white text-[12px]">Clear</button>
          <button
            onClick={() => setPicking(true)}
            className="flex items-center gap-1.5 bg-white text-ink px-3.5 py-1.5 rounded-full text-[13px] font-semibold hover:bg-white/90 transition-colors"
          >
            <Rocket size={13} /> Add to campaign
          </button>
        </div>
      )}

      {picking && (
        <CampaignPickerModal count={selectedRows.length} onClose={() => setPicking(false)} onPick={handlePickCampaign} />
      )}

      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-2 text-white px-4 py-2.5 rounded-full shadow-xl text-[13px] ${
            toast.kind === 'error' ? 'bg-rose' : 'bg-sage'
          }`}
        >
          {toast.kind === 'error' ? <AlertCircle size={14} /> : <Check size={14} />} {toast.text}
        </div>
      )}
    </div>
  )
}
