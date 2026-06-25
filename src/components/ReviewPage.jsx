import { useState, useEffect, useCallback, useRef } from 'react'
import { ExternalLink, Loader2, Check, X, Columns, ArrowLeft, Pencil, LayoutGrid, Table2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { exportToCsv } from '../lib/exportCsv'
import { TABLE_COLUMNS, DEFAULT_SELECTED_COLUMNS } from '../lib/columnDefs'

const PROXY = (import.meta.env.VITE_PROXY_URL || 'https://kol-finder-proxy.asoo.workers.dev').replace(/\/$/, '')

async function fetchDmDraft({ username, bio, hashtags, sampleCaptions, campaignBrief }) {
  const res = await fetch(`${PROXY}/draft-dm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, bio, hashtags, sampleCaptions, campaignBrief }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`DM draft failed (${res.status}): ${text}`)
  }
  const { draft, error } = await res.json()
  if (error) throw new Error(error)
  return draft
}

// Shared primitives (mirrors ResultsStep)
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

// ColumnPicker — same pattern and TABLE_COLUMNS as ResultsStep
function ColumnPicker({ selected, onChange }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const toggle = (id) => onChange(selected.includes(id) ? selected.filter(c => c !== id) : [...selected, id])

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3 py-1.5 border border-[#E1DBCD] rounded-[9px] text-[12px] text-body hover:border-ink/30 hover:text-ink transition-all bg-white"
      >
        <Columns size={13} />
        Columns
        {selected.length < TABLE_COLUMNS.length && (
          <span className="font-mono text-[10px] bg-ink text-white rounded-full px-1.5 py-0.5 leading-none">
            {selected.length}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-52 bg-white border border-card-edge rounded-[12px] shadow-lg z-20 p-3">
          <p className="text-[10px] font-mono text-faint uppercase tracking-[.14em] mb-2">Show / export columns</p>
          <div className="space-y-1">
            {TABLE_COLUMNS.map((col) => (
              <label key={col.id} className="flex items-center gap-2 px-2 py-1.5 rounded-[6px] hover:bg-surface cursor-pointer">
                <input type="checkbox" checked={selected.includes(col.id)} onChange={() => toggle(col.id)} className="accent-ink w-[15px] h-[15px] rounded" />
                <span className="font-mono text-[11px] text-body">{col.label}</span>
              </label>
            ))}
          </div>
          <div className="flex gap-2 mt-3 pt-2 border-t border-mist">
            <button onClick={() => onChange(TABLE_COLUMNS.map(c => c.id))} className="text-[11px] text-faint hover:text-ink transition-colors">Select all</button>
            <button onClick={() => onChange([])} className="text-[11px] text-faint hover:text-ink transition-colors ml-auto">Clear</button>
          </div>
        </div>
      )}
    </div>
  )
}



function AccountCard({ account, reviewEntry, campaignBrief, onUpdate, selectedColumns }) {
  const status = reviewEntry?.status || 'pending'
  const dmStatus = reviewEntry?.dm_status || 'not_sent'
  const dmDraft = reviewEntry?.dm_draft || ''

  const [drafting, setDrafting] = useState(false)
  const [draftError, setDraftError] = useState(null)
  const [localDraft, setLocalDraft] = useState(dmDraft)
  const [localNotes, setLocalNotes] = useState(reviewEntry?.notes || '')
  const [notesSaving, setNotesSaving] = useState(false)
  const notesTimerRef = useRef(null)

  useEffect(() => { setLocalDraft(dmDraft) }, [dmDraft])
  useEffect(() => { setLocalNotes(reviewEntry?.notes || '') }, [reviewEntry?.notes])

  // Helper so every onUpdate call includes the full current entry
  const entry = (overrides) => ({
    status, dm_status: dmStatus, dm_draft: localDraft, notes: localNotes, ...overrides,
  })

  const handleNotesChange = (val) => {
    setLocalNotes(val)
    setNotesSaving(true)
    if (notesTimerRef.current) clearTimeout(notesTimerRef.current)
    notesTimerRef.current = setTimeout(() => {
      onUpdate(account.username, entry({ notes: val }))
      setNotesSaving(false)
    }, 800)
  }

  const handleApprove = async () => {
    onUpdate(account.username, entry({ status: 'approved' }))
    setDrafting(true)
    setDraftError(null)
    try {
      const draft = await fetchDmDraft({
        username: account.username,
        bio: account.bio,
        hashtags: account.hashtags,
        sampleCaptions: account.sampleCaption ? [account.sampleCaption] : [],
        campaignBrief,
      })
      setLocalDraft(draft)
      onUpdate(account.username, entry({ status: 'approved', dm_status: 'not_sent', dm_draft: draft }))
    } catch (err) {
      setDraftError(err.message)
    } finally {
      setDrafting(false)
    }
  }

  const handleReject = () => {
    onUpdate(account.username, entry({ status: 'rejected' }))
  }

  const isPending = status === 'pending'
  const isApproved = status === 'approved'
  const isRejected = status === 'rejected'

  const col = (id) => selectedColumns.includes(id)

  return (
    <div className={`border rounded-[14px] overflow-hidden transition-all ${
      isApproved ? 'border-[#BFD6C4] bg-[#F5F8F4]' :
      isRejected ? 'border-[#E6CDD3] bg-[#FBF5F6] opacity-75' :
      'border-card-edge bg-white'
    }`}>
      {/* Account header */}
      <div className="px-5 py-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <a href={`https://instagram.com/${account.username}`} target="_blank" rel="noreferrer"
              className="font-semibold text-[13.5px] text-ink hover:text-ink/70 flex items-center gap-1">
              @{account.username} <ExternalLink size={11} className="opacity-40" />
            </a>
            {account.sourceBrand && (
              <span className="font-mono text-[10px] bg-mist px-2 py-0.5 rounded-[5px] text-body">{account.sourceBrand}</span>
            )}
          </div>
          {account.fullName && <p className="text-[12px] text-faint">{account.fullName}</p>}
          <div className="flex flex-wrap gap-1 mt-1.5">
            {(account.flags || []).map((f) => (
              <span key={f} className={`tag text-[10px] ${f === 'video-creator' ? 'tag-video' : f === 'bot-risk' ? 'tag-bot' : ''}`}>{f}</span>
            ))}
          </div>
        </div>

        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className={`text-[18px] font-bold font-mono ${account.overall >= 70 ? 'text-sage' : account.overall >= 45 ? 'text-body' : 'text-faint'}`}>
              {account.overall}
            </span>
            <span className="text-[11px] text-faint font-mono">/ 100</span>
          </div>
          {isPending && (
            <div className="flex gap-2">
              <button onClick={handleReject}
                className="flex items-center gap-1 px-3 py-1.5 rounded-[9px] border border-rose/40 text-rose text-[12px] hover:bg-rose/10 transition-all">
                <X size={12} /> Reject
              </button>
              <button onClick={handleApprove} disabled={drafting}
                className="flex items-center gap-1 px-3 py-1.5 rounded-[9px] bg-sage text-white text-[12px] hover:bg-sage/80 transition-all disabled:opacity-50">
                {drafting ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                Approve
              </button>
            </div>
          )}
          {isApproved && !drafting && (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-sage font-mono flex items-center gap-1"><Check size={11} /> Approved</span>
              <button onClick={handleReject} className="text-[11px] text-faint hover:text-rose transition-colors font-mono">(undo)</button>
            </div>
          )}
          {isRejected && (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-rose/80 font-mono flex items-center gap-1"><X size={11} /> Rejected</span>
              <button onClick={handleApprove} className="text-[11px] text-faint hover:text-sage transition-colors font-mono">(undo)</button>
            </div>
          )}
        </div>
      </div>

      {/* Stats row */}
      <div className="px-5 pb-3 flex flex-wrap gap-4 text-[11px] font-mono text-muted">
        {col('account_location') && account.accountLocation && <span>📍 {account.accountLocation}</span>}
        {col('follower_count') && account.followerCount != null && <span>{account.followerCount.toLocaleString()} followers</span>}
        {col('relevancy_score') && account.scores?.relevancy != null && <span>Relevancy {account.scores.relevancy}/10</span>}
        {col('engagement_score') && account.scores?.engagement != null && <span>Eng score {account.scores.engagement}/10</span>}
        {col('niche_signals') && account.nicheSignals?.length > 0 && (
          <span>{account.nicheSignals.slice(0, 3).join(' · ')}</span>
        )}
        {col('sample_post_url') && account.samplePostUrl && (
          <a href={account.samplePostUrl} target="_blank" rel="noreferrer"
            className="text-body hover:underline flex items-center gap-0.5">
            Sample post <ExternalLink size={10} />
          </a>
        )}
        {col('scraped_post_likes') && account.samplePostLikes != null && (
          <span>{account.samplePostLikes.toLocaleString()} post likes</span>
        )}
        {col('scraped_post_comments') && account.samplePostComments != null && (
          <span>{account.samplePostComments.toLocaleString()} comments</span>
        )}
        {col('scraped_post_plays') && account.samplePostPlays != null && (
          <span>{account.samplePostPlays.toLocaleString()} plays</span>
        )}
        {col('live_median_likes') && account.medianLikes != null && (
          <span>{account.medianLikes.toLocaleString()} med. likes</span>
        )}
        {col('live_median_views') && account.medianViews != null && (
          <span>{account.medianViews.toLocaleString()} med. views</span>
        )}
      </div>

      {/* Caption */}
      {col('sample_caption') && account.sampleCaption && (
        <div className="px-5 pb-3">
          <p className="text-[9.5px] font-mono text-faint uppercase tracking-[.14em] mb-1">Scraped Caption</p>
          <p className="text-[12px] text-body line-clamp-3">{account.sampleCaption}</p>
        </div>
      )}

      {/* Notes / Remarks — always visible */}
      <div className="border-t border-card-edge/60 px-5 py-3">
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-[9.5px] font-mono text-faint uppercase tracking-[.14em]">Notes / Remarks</p>
          {notesSaving && <span className="text-[10px] font-mono text-faint">Saving…</span>}
        </div>
        <textarea
          value={localNotes}
          onChange={(e) => handleNotesChange(e.target.value)}
          rows={2}
          placeholder="Add notes for the team…"
          className="w-full px-3 py-2 border border-card-edge rounded-[8px] text-[12px] text-ink bg-white focus:outline-none focus:border-ink/30 resize-none placeholder:text-faint"
        />
      </div>

      {/* DM Draft — only when approved */}
      {isApproved && (
        <div className="border-t border-card-edge/60 px-5 py-4">
          {drafting && (
            <div className="flex items-center gap-2 text-[11px] text-faint mb-3">
              <Loader2 size={13} className="animate-spin" /> Generating DM draft…
            </div>
          )}
          {draftError && (
            <p className="text-[11px] text-rose mb-3">Draft failed: {draftError}</p>
          )}
          {localDraft && !drafting && (
            <>
              <p className="text-[9.5px] font-mono text-faint uppercase tracking-[.14em] mb-2">DM Draft</p>
              <textarea
                value={localDraft}
                onChange={(e) => {
                  setLocalDraft(e.target.value)
                  onUpdate(account.username, entry({ status: 'approved', dm_draft: e.target.value }))
                }}
                rows={5}
                className="w-full px-3 py-2.5 border border-card-edge rounded-[10px] text-[13px] text-ink bg-white focus:outline-none focus:border-ink/30 resize-none"
              />
            </>
          )}
        </div>
      )}
    </div>
  )
}

function AccountTableRow({ account, reviewEntry, campaignBrief, onUpdate }) {
  const status = reviewEntry?.status || 'pending'
  const dmStatus = reviewEntry?.dm_status || 'not_sent'
  const dmDraft = reviewEntry?.dm_draft || ''
  const [expanded, setExpanded] = useState(false)
  const [drafting, setDrafting] = useState(false)
  const [draftError, setDraftError] = useState(null)
  const [localDraft, setLocalDraft] = useState(dmDraft)
  const [localNotes, setLocalNotes] = useState(reviewEntry?.notes || '')
  const [notesSaving, setNotesSaving] = useState(false)
  const notesTimerRef = useRef(null)

  useEffect(() => { setLocalDraft(dmDraft) }, [dmDraft])
  useEffect(() => { setLocalNotes(reviewEntry?.notes || '') }, [reviewEntry?.notes])

  const entry = (overrides) => ({
    status, dm_status: dmStatus, dm_draft: localDraft, notes: localNotes, ...overrides,
  })

  const handleNotesChange = (val) => {
    setLocalNotes(val)
    setNotesSaving(true)
    if (notesTimerRef.current) clearTimeout(notesTimerRef.current)
    notesTimerRef.current = setTimeout(() => {
      onUpdate(account.username, entry({ notes: val }))
      setNotesSaving(false)
    }, 800)
  }

  const handleApprove = async (e) => {
    e.stopPropagation()
    setExpanded(true)
    onUpdate(account.username, entry({ status: 'approved' }))
    setDrafting(true)
    setDraftError(null)
    try {
      const draft = await fetchDmDraft({
        username: account.username,
        bio: account.bio,
        hashtags: account.hashtags,
        sampleCaptions: account.sampleCaption ? [account.sampleCaption] : [],
        campaignBrief,
      })
      setLocalDraft(draft)
      onUpdate(account.username, entry({ status: 'approved', dm_status: 'not_sent', dm_draft: draft }))
    } catch (err) {
      setDraftError(err.message)
    } finally {
      setDrafting(false)
    }
  }

  const handleReject = (e) => {
    e.stopPropagation()
    onUpdate(account.username, entry({ status: 'rejected' }))
  }

  const handleUndo = (e) => {
    e.stopPropagation()
    onUpdate(account.username, entry({ status: 'pending' }))
  }

  const nicheTags = (account.nicheSignals || []).slice(0, 2)
  const isPending = status === 'pending'
  const isApproved = status === 'approved'
  const isRejected = status === 'rejected'

  return (
    <>
      <div
        className={`grid gap-3 px-4 py-3 border-b border-[#F0ECE2] hover:bg-surface cursor-pointer transition-colors items-center ${
          isApproved ? 'bg-[#F5F8F4]/50' : isRejected ? 'opacity-60' : ''
        }`}
        style={{ gridTemplateColumns: '2fr 80px 90px 1fr 140px' }}
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="min-w-0">
          <a
            href={`https://instagram.com/${account.username}`}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="font-medium text-sm text-ink hover:text-ink/70 flex items-center gap-1"
          >
            @{account.username} <ExternalLink size={11} className="opacity-30" />
          </a>
          {account.fullName && <p className="text-xs text-faint truncate">{account.fullName}</p>}
        </div>
        <div className="flex justify-center">
          <ScoreBadge score={account.overall} />
        </div>
        <p className="font-mono text-sm text-ink text-center">
          {account.avgLikes != null ? account.avgLikes.toLocaleString() : '—'}
        </p>
        <div className="flex flex-wrap gap-1">
          {nicheTags.map((t) => (
            <span key={t} className="font-mono text-[10px] bg-mist px-2 py-0.5 rounded-[5px] text-body">{t}</span>
          ))}
        </div>
        <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
          {isPending && (
            <>
              <button
                onClick={handleReject}
                className="flex items-center gap-1 px-2.5 py-1 rounded-[8px] border border-rose/40 text-rose text-[12px] hover:bg-rose/10 transition-all"
              >
                <X size={11} /> Reject
              </button>
              <button
                onClick={handleApprove}
                disabled={drafting}
                className="flex items-center gap-1 px-2.5 py-1 rounded-[8px] bg-sage text-white text-[12px] hover:bg-sage/80 transition-all disabled:opacity-50"
              >
                {drafting ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                Approve
              </button>
            </>
          )}
          {isApproved && (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-sage font-mono flex items-center gap-1"><Check size={11} /> Approved</span>
              <button onClick={handleUndo} className="text-[11px] text-faint hover:text-rose transition-colors font-mono">(undo)</button>
            </div>
          )}
          {isRejected && (
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-rose/80 font-mono flex items-center gap-1"><X size={11} /> Rejected</span>
              <button onClick={handleUndo} className="text-[11px] text-faint hover:text-sage transition-colors font-mono">(undo)</button>
            </div>
          )}
        </div>
      </div>
      {expanded && (
        <>
        <div className="px-4 py-4 bg-surface border-b border-[#F0ECE2] grid grid-cols-2 gap-6 text-sm">
          <div>
            <p className="text-[9.5px] font-mono text-faint uppercase tracking-[.13em] mb-1">Stats</p>
            <div className="flex flex-wrap gap-3 text-[11px] font-mono text-muted">
              {account.accountLocation && <span>📍 {account.accountLocation}</span>}
              {account.followerCount != null && <span>{account.followerCount.toLocaleString()} followers</span>}
            </div>
            {account.bio && (
              <div className="mt-3">
                <p className="text-[9.5px] font-mono text-faint uppercase tracking-[.13em] mb-1">Bio</p>
                <p className="text-[12px] text-body">{account.bio}</p>
              </div>
            )}
            {account.sampleCaption && (
              <div className="mt-3">
                <p className="text-[9.5px] font-mono text-faint uppercase tracking-[.13em] mb-1">Sample Caption</p>
                <p className="text-[12px] text-body line-clamp-3">{account.sampleCaption}</p>
              </div>
            )}
          </div>
          <div>
            {account.nicheSignals?.length > 0 && (
              <div className="mb-3">
                <p className="text-[9.5px] font-mono text-faint uppercase tracking-[.13em] mb-1">Niche Signals</p>
                <p className="text-[12px] text-body">{account.nicheSignals.join(' · ')}</p>
              </div>
            )}
            {account.hashtags?.length > 0 && (
              <div className="mb-3">
                <p className="text-[9.5px] font-mono text-faint uppercase tracking-[.13em] mb-1">Hashtags</p>
                <div className="flex flex-wrap gap-1">
                  {account.hashtags.slice(0, 10).map((h) => (
                    <span key={h} className="tag">#{h}</span>
                  ))}
                </div>
              </div>
            )}
            {account.samplePostUrl && (
              <a href={account.samplePostUrl} target="_blank" rel="noreferrer"
                className="text-[12px] text-body hover:underline flex items-center gap-1">
                Sample post <ExternalLink size={10} />
              </a>
            )}
            {isApproved && (
              <div className="mt-3">
                {drafting && (
                  <div className="flex items-center gap-2 text-[11px] text-faint">
                    <Loader2 size={13} className="animate-spin" /> Generating DM draft…
                  </div>
                )}
                {draftError && <p className="text-[11px] text-rose">Draft failed: {draftError}</p>}
                {localDraft && !drafting && (
                  <>
                    <p className="text-[9.5px] font-mono text-faint uppercase tracking-[.13em] mb-1">DM Draft</p>
                    <textarea
                      value={localDraft}
                      onChange={(e) => {
                        setLocalDraft(e.target.value)
                        onUpdate(account.username, entry({ status: 'approved', dm_draft: e.target.value }))
                      }}
                      rows={4}
                      className="w-full px-3 py-2 border border-card-edge rounded-[10px] text-[12px] text-ink bg-white focus:outline-none focus:border-ink/30 resize-none"
                    />
                  </>
                )}
              </div>
            )}
          </div>
        </div>
        {/* Notes — always visible in expanded row */}
        <div className="px-4 pb-4 bg-surface border-b border-[#F0ECE2]">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[9.5px] font-mono text-faint uppercase tracking-[.13em]">Notes / Remarks</p>
            {notesSaving && <span className="text-[10px] font-mono text-faint">Saving…</span>}
          </div>
          <textarea
            value={localNotes}
            onChange={(e) => handleNotesChange(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            rows={2}
            placeholder="Add notes for the team…"
            className="w-full px-3 py-2 border border-card-edge rounded-[8px] text-[12px] text-ink bg-white focus:outline-none focus:border-ink/30 resize-none placeholder:text-faint"
          />
        </div>
        </>
      )}
    </>
  )
}

export default function ReviewPage({ reviewId, onBack }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [campaignBrief, setCampaignBrief] = useState('')
  const [accounts, setAccounts] = useState([])
  const [reviewState, setReviewState] = useState({})
  const [saving, setSaving] = useState(false)
  const [selectedColumns, setSelectedColumns] = useState(DEFAULT_SELECTED_COLUMNS)
  const [editingBrief, setEditingBrief] = useState(false)
  const [briefDraft, setBriefDraft] = useState('')
  const briefInputRef = useRef(null)
  const [viewMode, setViewMode] = useState(null)
  // Refs so persistUpdate can always read latest values without stale closures
  const bmNotesRef = useRef('')
  const reviewStateRef = useRef({})

  useEffect(() => {
    async function load() {
      const { data, error: err } = await supabase
        .from('shared_results')
        .select('campaign_brief, accounts, review_state')
        .eq('id', reviewId)
        .single()
      if (err || !data) {
        setError(err?.message || 'Share link not found.')
        setLoading(false)
        return
      }
      const accs = data.accounts || []
      const rs = data.review_state || {}
      // Notes are stored inside review_state under __notes__ to avoid schema changes
      const notes = typeof rs.__notes__ === 'string' ? rs.__notes__ : ''
      const accountState = Object.fromEntries(Object.entries(rs).filter(([k]) => k !== '__notes__'))
      setCampaignBrief(data.campaign_brief || '')
      setAccounts(accs)
      setReviewState(accountState)
      reviewStateRef.current = accountState
      bmNotesRef.current = notes
      setViewMode(accs.length > 20 ? 'table' : 'cards')
      setLoading(false)
    }
    load()
  }, [reviewId])

  const persistUpdate = useCallback(async (newState) => {
    reviewStateRef.current = newState
    setSaving(true)
    try {
      // Always preserve notes when writing review_state
      await supabase.from('shared_results')
        .update({ review_state: { ...newState, __notes__: bmNotesRef.current } })
        .eq('id', reviewId)
    } catch (e) {
      console.error('Failed to persist review state', e)
    } finally {
      setSaving(false)
    }
  }, [reviewId])

  const startEditBrief = () => {
    setBriefDraft(campaignBrief)
    setEditingBrief(true)
    setTimeout(() => briefInputRef.current?.focus(), 0)
  }

  const cancelEditBrief = () => setEditingBrief(false)

  const commitBrief = useCallback(async () => {
    const trimmed = briefDraft.trim()
    setEditingBrief(false)
    if (trimmed === campaignBrief) return
    setCampaignBrief(trimmed)
    try {
      await supabase.from('shared_results').update({ campaign_brief: trimmed }).eq('id', reviewId)
    } catch (e) {
      console.error('Failed to save campaign brief', e)
    }
  }, [briefDraft, campaignBrief, reviewId])

  const handleUpdate = useCallback((username, entry) => {
    setReviewState((prev) => {
      const next = { ...prev, [username]: entry }
      persistUpdate(next)
      return next
    })
  }, [persistUpdate])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-faint" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6">
        <div className="text-center max-w-sm">
          {onBack && (
            <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-ink/40 hover:text-ink mb-6 mx-auto transition-colors">
              <ArrowLeft size={13} /> Back to queue
            </button>
          )}
          <p className="text-lg font-semibold text-ink mb-2">Review not found</p>
          <p className="text-sm text-ink/50">{error}</p>
        </div>
      </div>
    )
  }

  // Brand manager approval view
  const approvedCount = Object.values(reviewState).filter((e) => e.status === 'approved').length
  const rejectedCount = Object.values(reviewState).filter((e) => e.status === 'rejected').length
  const pendingCount = accounts.length - approvedCount - rejectedCount

  return (
    <div className="min-h-screen bg-paper px-[48px] py-[40px] max-w-3xl mx-auto">
      <div className="mb-8">
        {onBack && (
          <button onClick={onBack} className="flex items-center gap-1.5 font-mono text-[11.5px] text-faint hover:text-ink mb-4 transition-colors">
            <ArrowLeft size={13} /> Back to queue
          </button>
        )}
        <p className="font-mono text-[10px] tracking-[.18em] text-faint uppercase mb-[8px]">KOL Review</p>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[27px] font-bold tracking-[-0.02em] text-ink mb-1">{accounts.length} accounts to review</h1>
            <p className="text-[13.5px] text-muted">
              <span className="text-sage font-semibold">{approvedCount} approved</span>
              {' · '}
              <span className="text-rose/80 font-semibold">{rejectedCount} rejected</span>
              {' · '}
              {pendingCount} pending
              {saving && <span className="ml-3 text-faint font-mono text-[11px]">Saving…</span>}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* View mode toggle */}
            <div className="flex items-center bg-mist rounded-[9px] p-1 gap-1">
              <button
                onClick={() => setViewMode('cards')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-[7px] text-[12px] font-medium transition-all ${viewMode === 'cards' ? 'bg-white text-ink shadow-sm' : 'text-muted hover:text-ink'}`}
              >
                <LayoutGrid size={13} /> Cards
              </button>
              <button
                onClick={() => setViewMode('table')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-[7px] text-[12px] font-medium transition-all ${viewMode === 'table' ? 'bg-white text-ink shadow-sm' : 'text-muted hover:text-ink'}`}
              >
                <Table2 size={13} /> Table
              </button>
            </div>
            <ColumnPicker selected={selectedColumns} onChange={setSelectedColumns} />
          </div>
        </div>
        <div className="mt-4 px-4 py-3 bg-surface border border-card-edge rounded-[12px] group/brief">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[9.5px] font-mono text-faint uppercase tracking-[.14em]">Campaign brief</p>
            {!editingBrief && (
              <button
                onClick={startEditBrief}
                className="text-faint hover:text-ink transition-colors opacity-0 group-hover/brief:opacity-100"
                title="Edit brief"
              >
                <Pencil size={12} />
              </button>
            )}
          </div>
          {editingBrief ? (
            <div>
              <textarea
                ref={briefInputRef}
                value={briefDraft}
                onChange={(e) => setBriefDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') cancelEditBrief() }}
                rows={3}
                className="w-full text-[13px] text-ink bg-white border border-ink/30 rounded-[8px] px-3 py-2 focus:outline-none resize-none"
              />
              <div className="flex gap-2 mt-2">
                <button onClick={commitBrief} className="flex items-center gap-1 px-3 py-1 bg-ink text-white rounded-[8px] text-[12px] hover:bg-ink/80 transition-all">
                  <Check size={12} /> Save
                </button>
                <button onClick={cancelEditBrief} className="text-[12px] text-faint hover:text-ink transition-colors px-2">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <p className="text-[13px] text-body whitespace-pre-wrap">{campaignBrief || <span className="text-faint italic">No brief — click pencil to add one</span>}</p>
          )}
        </div>

      </div>

      {viewMode === 'table' ? (
        <div className="border border-card-edge rounded-[14px] overflow-hidden bg-white">
          <div
            className="grid gap-3 px-4 py-3 bg-surface border-b border-[#EDE8DC] text-[9.5px] font-mono text-faint uppercase tracking-[.13em]"
            style={{ gridTemplateColumns: '2fr 80px 90px 1fr 140px' }}
          >
            <span>Account</span>
            <span className="text-center">Score</span>
            <span className="text-center">Avg Likes</span>
            <span>Niches</span>
            <span />
          </div>
          {accounts.map((account) => (
            <AccountTableRow
              key={account.username}
              account={account}
              reviewEntry={reviewState[account.username]}
              campaignBrief={campaignBrief}
              onUpdate={handleUpdate}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {accounts.map((account) => (
            <AccountCard
              key={account.username}
              account={account}
              reviewEntry={reviewState[account.username]}
              campaignBrief={campaignBrief}
              onUpdate={handleUpdate}
              selectedColumns={selectedColumns}
            />
          ))}
        </div>
      )}

      <p className="mt-8 text-[11px] text-faint font-mono text-center">
        Approve to generate a DM draft · Changes save automatically
      </p>
    </div>
  )
}
