import { useState, useEffect, useMemo } from 'react'
import { Loader2, Trash2, ExternalLink, Search, BookMarked, Rocket, X, Check, Download } from 'lucide-react'
import { listVault, removeFromVault } from '../lib/vault'
import { listCampaigns, attachKols } from '../lib/campaigns'
import { profileUrl } from '../lib/platforms'
import { supabase } from '../lib/supabase'

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

function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function num(n) {
  return n != null ? Number(n).toLocaleString() : '—'
}

// Campaign picker — pick a campaign to drop the selected creators into.
function CampaignPickerModal({ count, onClose, onPick }) {
  const [campaigns, setCampaigns] = useState(null)
  const [error, setError] = useState(null)
  const [attachingId, setAttachingId] = useState(null)

  useEffect(() => {
    listCampaigns()
      .then(setCampaigns)
      .catch((e) => setError(e.message))
  }, [])

  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 px-4" onClick={onClose}>
      <div className="bg-white rounded-[16px] w-full max-w-md max-h-[80vh] flex flex-col shadow-xl" onClick={(e) => e.stopPropagation()}>
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
                    <p className="font-mono text-[10.5px] text-faint">{c.brand} · {c.market} · {c.status}</p>
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
  const [toast, setToast] = useState(null)

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
    setRows((prev) => prev.filter((r) => r.id !== row.id))
    setSelected((prev) => { const n = new Set(prev); n.delete(row.id); return n })
    try {
      await removeFromVault(row.id)
    } catch (err) {
      console.error('Failed to remove from vault', err)
      window.alert('Failed to remove. Reloading to resync.')
      window.location.reload()
    }
  }

  const handlePickCampaign = async (campaign) => {
    // campaign_kols is Instagram-only end-to-end — skip any Threads creators and
    // tell the user rather than silently dropping them.
    const igRows = selectedRows.filter((r) => (r.platform || 'instagram') !== 'threads')
    const skipped = selectedRows.length - igRows.length
    const kols = igRows.map((r) => ({ handle: r.handle, username: r.handle, runId: r.source_run_id }))
    const added = await attachKols(campaign.id, kols)
    setPicking(false)
    setSelected(new Set())
    const parts = [`Added ${added} to ${campaign.name}`]
    if (added < igRows.length) parts.push(`${igRows.length - added} already on it`)
    if (skipped) parts.push(`${skipped} Threads skipped`)
    setToast(parts.join(' · '))
    setTimeout(() => setToast(null), 4000)
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
    <div className="min-h-screen px-[48px] py-[40px] max-w-5xl mx-auto">
      <div className="mb-8">
        <p className="font-mono text-[10px] tracking-[.18em] text-faint uppercase mb-[8px]">Creator Vault</p>
        <h1 className="text-[34px] font-serif font-bold tracking-[0.02em] text-ink">Saved creators</h1>
        <p className="text-[13.5px] text-muted mt-2 max-w-xl">
          Creators you’ve starred from a run or review. Reuse them in a campaign without re-scraping.
          Metrics are a snapshot from when each was saved.
        </p>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search handle or name…"
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
        <div className="flex items-center justify-center py-16 gap-2 text-faint">
          <Loader2 size={14} className="animate-spin" /> <span className="text-sm">Loading…</span>
        </div>
      ) : loadError ? (
        <div className="flex flex-col items-center py-16">
          <X size={32} className="text-rose mb-4" />
          <h2 className="text-[17px] font-semibold text-ink mb-2">Couldn’t load the vault</h2>
          <button onClick={() => window.location.reload()} className="mt-2 px-4 py-2 bg-ink text-white rounded-[10px] text-[13px]">Retry</button>
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center">
          <BookMarked size={30} className="text-faint mb-4" />
          <h2 className="text-[17px] font-semibold text-ink mb-2">No saved creators yet</h2>
          <p className="text-[13.5px] text-muted max-w-sm">
            On a Seeder results table or a review, click the bookmark next to a handle to save that creator here.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center text-[13.5px] text-muted">No creators match your filters.</div>
      ) : (
        <div className="border border-mist rounded-[14px] overflow-hidden">
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
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 bg-[#2E7D5B] text-white px-4 py-2.5 rounded-full shadow-xl text-[13px]">
          <Check size={14} /> {toast}
        </div>
      )}
    </div>
  )
}
