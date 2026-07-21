import { useState, useEffect, useCallback, useRef } from 'react'
import { ExternalLink, Loader2, Check, X, ArrowLeft, Pencil, LayoutGrid, Table2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { exportToCsv } from '../lib/exportCsv'
import { mergeReviewEntry, reviewKey, campaignDmDraft, DM_DRAFT_KEY } from '../lib/reviewState'
import { profileUrl } from '../lib/platforms'
import { TABLE_COLUMNS } from '../lib/columnDefs'
import { useTableControls } from '../lib/useTableControls'
import { loadColumnPrefs, saveColumnPrefs } from '../lib/columnPrefs'
import ColumnPicker from './table/ColumnPicker'
import ColumnHeaderCell from './table/ColumnHeaderCell'

const PROXY = (import.meta.env.VITE_PROXY_URL || 'https://kol-finder-proxy.asoo.workers.dev').replace(/\/$/, '')

// Structured rejection reasons — these become labeled training signal for the
// AI fit score (a bare "rejected" is ambiguous; "off-niche" vs "already
// contacted" teach very different lessons). Keep the values stable: they are
// persisted in review_state and read back by the AI scorer.
const REJECT_REASONS = [
  { value: 'off_niche', label: 'Off-niche / wrong category' },
  { value: 'audience_mismatch', label: 'Audience mismatch' },
  { value: 'content_quality', label: 'Content quality' },
  { value: 'too_small', label: 'Too small / low engagement' },
  { value: 'bot_risk', label: 'Bot / fake engagement' },
  { value: 'already_contacted', label: 'Already contacted / worked with' },
  { value: 'other', label: 'Other' },
]

// Compact reason picker shown after a reject so categorising stays optional and
// never blocks the one-click reject.
function RejectReasonSelect({ value, onChange }) {
  return (
    <select
      value={value || ''}
      onChange={(e) => onChange(e.target.value || null)}
      onClick={(e) => e.stopPropagation()}
      className="text-[11px] font-mono text-body bg-white border border-card-edge rounded-[7px] px-2 py-1 focus:outline-none focus:border-ink/30 cursor-pointer"
    >
      <option value="">Reason…</option>
      {REJECT_REASONS.map((r) => (
        <option key={r.value} value={r.value}>{r.label}</option>
      ))}
    </select>
  )
}

// 1–5 fit rating shown on approvals — lets the AI learn "great fit" vs "just
// acceptable" instead of treating every approval as equally strong.
function FitRating({ value, onChange }) {
  return (
    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()} title="How strong a fit? (feeds AI scoring)">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          onClick={() => onChange(value === n ? null : n)}
          className={`text-[13px] leading-none transition-colors ${n <= (value || 0) ? 'text-accent' : 'text-mist hover:text-faint'}`}
        >
          ★
        </button>
      ))}
    </div>
  )
}

// One DM draft per campaign — generated from the brief alone and reused for
// every approved KOL (no per-KOL personalization).
async function fetchDmDraft({ campaignBrief }) {
  // The worker now requires a Supabase Bearer token on every endpoint.
  const headers = { 'Content-Type': 'application/json' }
  if (supabase) {
    const { data } = await supabase.auth.getSession()
    const token = data?.session?.access_token
    if (token) headers['Authorization'] = `Bearer ${token}`
  }
  const res = await fetch(`${PROXY}/draft-dm`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ campaignBrief }),
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

const TABLE_ROW_COLS = {
  brand:                 { label: 'Brand',      min: '80px',  render: (a) => (
    <span className="font-mono text-xs text-body">
      {a.platform === 'threads' ? '🧵 ' : ''}{a.sourceBrand || '—'}{a.sourceTrack ? ` · ${a.sourceTrack === 'painpoint' ? 'pain-point' : 'genre'}` : ''}
    </span>
  ) },
  overall:               { label: 'Score',      min: '72px',  center: true, render: (a) => <div className="flex justify-center"><ScoreBadge score={a.overall} /></div> },
  relevancy_score:       { label: 'Relevancy',  min: '100px', render: (a) => <MiniBar value={a.scores?.relevancy ?? 0} color="bg-rose/70" /> },
  engagement_score:      { label: 'Eng. Score', min: '100px', render: (a) => <MiniBar value={a.scores?.engagement ?? 0} color="bg-ink/50" /> },
  ai_fit:                { label: 'AI Fit',      min: '100px', render: (a) => a.aiScore != null ? <span title={a.aiReason || ''}><MiniBar value={a.aiScore} color="bg-accent" /></span> : <span className="font-mono text-xs text-ink/30">—</span> },
  account_location:      { label: 'Location',   min: '80px',  render: (a) => <span className="font-mono text-xs text-body">{a.accountLocation || '—'}</span> },
  follower_count:        { label: 'Followers',  min: '80px',  render: (a) => <span className="font-mono text-xs text-ink">{a.followerCount != null ? a.followerCount.toLocaleString() : '—'}</span> },
  niche_signals:         { label: 'Niches',     min: '100px', flex: 2, render: (a) => <div className="flex flex-wrap gap-1">{(a.nicheSignals || []).slice(0, 2).map(t => <span key={t} className="font-mono text-[10px] bg-mist px-2 py-0.5 rounded-[5px] text-body">{t}</span>)}</div> },
  live_median_likes:     { label: 'Med. Likes', min: '72px',  render: (a) => <span className="font-mono text-xs text-ink">{a.medianLikes != null ? a.medianLikes.toLocaleString() : '—'}</span> },
  live_median_views:     { label: 'Med. Views', min: '72px',  render: (a) => <span className="font-mono text-xs text-ink">{a.medianViews != null ? a.medianViews.toLocaleString() : '—'}</span> },
  live_median_comments:  { label: 'Med. Cmts',  min: '72px',  render: (a) => <span className="font-mono text-xs text-ink">{a.medianComments != null ? a.medianComments.toLocaleString() : '—'}</span> },
  scraped_post_likes:    { label: 'Post Likes', min: '72px',  render: (a) => <span className="font-mono text-xs text-ink">{a.samplePostLikes != null ? a.samplePostLikes.toLocaleString() : '—'}</span> },
  scraped_post_comments: { label: 'Post Cmts',  min: '72px',  render: (a) => <span className="font-mono text-xs text-ink">{a.samplePostComments != null ? a.samplePostComments.toLocaleString() : '—'}</span> },
  scraped_post_plays:    { label: 'Post Plays', min: '72px',  render: (a) => <span className="font-mono text-xs text-ink">{a.samplePostPlays != null ? a.samplePostPlays.toLocaleString() : '—'}</span> },
  sample_post_url:       { label: 'Post',       min: '56px',  render: (a) => a.samplePostUrl ? <a href={a.samplePostUrl} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} className="text-xs text-body hover:underline flex items-center gap-1">View <ExternalLink size={10} /></a> : <span className="font-mono text-xs text-ink/30">—</span> },
  sample_caption:        { label: 'Caption',    min: '120px', flex: 3, render: (a) => <span className="font-mono text-xs text-body line-clamp-2">{a.sampleCaption || '—'}</span> },
}

// Build a CSS grid template that fills available width: each column grows from
// its minimum, with flex columns taking proportionally more of the surplus.
function buildGridTemplate(activeCols) {
  const colDefs = activeCols.map(id => {
    const { min, flex = 1 } = TABLE_ROW_COLS[id]
    return `minmax(${min}, ${flex}fr)`
  })
  return ['minmax(160px,3fr)', ...colDefs, 'minmax(130px,auto)'].join(' ')
}


function AccountCard({ account, reviewEntry, onUpdate, selectedColumns }) {
  const status = reviewEntry?.status || 'pending'
  const dmStatus = reviewEntry?.dm_status || 'not_sent'
  const rejectReason = reviewEntry?.reject_reason || null
  const fitRating = reviewEntry?.fit_rating || null

  const [localNotes, setLocalNotes] = useState(reviewEntry?.notes || '')
  const [notesSaving, setNotesSaving] = useState(false)
  const notesTimerRef = useRef(null)
  // Ref mirrors the latest local value so async callbacks don't overwrite
  // notes the user typed while a request was in flight.
  const localNotesRef = useRef(localNotes)

  useEffect(() => { setLocalNotes(reviewEntry?.notes || ''); localNotesRef.current = reviewEntry?.notes || '' }, [reviewEntry?.notes])

  // Helper so every onUpdate call includes the full current entry (from refs,
  // never a stale closure).
  const entry = (overrides) => ({
    status, dm_status: dmStatus, notes: localNotesRef.current,
    reject_reason: rejectReason, fit_rating: fitRating, ...overrides,
  })

  const handleNotesChange = (val) => {
    setLocalNotes(val)
    localNotesRef.current = val
    setNotesSaving(true)
    if (notesTimerRef.current) clearTimeout(notesTimerRef.current)
    notesTimerRef.current = setTimeout(() => {
      onUpdate(reviewKey(account), entry({ notes: val }))
      setNotesSaving(false)
    }, 800)
  }

  const handleApprove = () => {
    onUpdate(reviewKey(account), entry({ status: 'approved' }))
  }

  const handleReject = () => {
    onUpdate(reviewKey(account), entry({ status: 'rejected' }))
  }

  // Undo returns to the pending state — it must NOT flip to the opposite
  // decision.
  const handleUndo = () => {
    onUpdate(reviewKey(account), entry({ status: 'pending' }))
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
            <a href={profileUrl(account)} target="_blank" rel="noreferrer"
              className="font-semibold text-[13.5px] text-ink hover:text-ink/70 flex items-center gap-1">
              @{account.username} <ExternalLink size={11} className="opacity-40" />
            </a>
            {account.platform === 'threads' && (
              <span className="font-mono text-[10px] bg-ink/10 text-ink/70 px-2 py-0.5 rounded-[5px]">Threads</span>
            )}
            {account.sourceBrand && (
              <span className="font-mono text-[10px] bg-mist px-2 py-0.5 rounded-[5px] text-body">
                {account.sourceTrack ? `via ${account.sourceBrand} · ${account.sourceTrack === 'painpoint' ? 'pain-point' : 'genre'}` : account.sourceBrand}
              </span>
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
              <button onClick={handleApprove}
                className="flex items-center gap-1 px-3 py-1.5 rounded-[9px] bg-sage text-white text-[12px] hover:bg-sage/80 transition-all">
                <Check size={12} />
                Approve
              </button>
            </div>
          )}
          {isApproved && (
            <div className="flex flex-col items-end gap-1.5">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-sage font-mono flex items-center gap-1"><Check size={11} /> Approved</span>
                <button onClick={handleUndo} className="text-[11px] text-faint hover:text-rose transition-colors font-mono">(undo)</button>
              </div>
              <FitRating value={fitRating} onChange={(r) => onUpdate(reviewKey(account), entry({ fit_rating: r }))} />
            </div>
          )}
          {isRejected && (
            <div className="flex flex-col items-end gap-1.5">
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] text-rose/80 font-mono flex items-center gap-1"><X size={11} /> Rejected</span>
                <button onClick={handleUndo} className="text-[11px] text-faint hover:text-sage transition-colors font-mono">(undo)</button>
              </div>
              <RejectReasonSelect value={rejectReason} onChange={(r) => onUpdate(reviewKey(account), entry({ reject_reason: r }))} />
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
        {col('ai_fit') && account.aiScore != null && <span title={account.aiReason || ''}>AI fit {account.aiScore}/10</span>}
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

    </div>
  )
}

function AccountTableRow({ account, reviewEntry, onUpdate, selectedColumns }) {
  const status = reviewEntry?.status || 'pending'
  const dmStatus = reviewEntry?.dm_status || 'not_sent'
  const rejectReason = reviewEntry?.reject_reason || null
  const fitRating = reviewEntry?.fit_rating || null
  const [expanded, setExpanded] = useState(false)
  const [localNotes, setLocalNotes] = useState(reviewEntry?.notes || '')
  const [notesSaving, setNotesSaving] = useState(false)
  const notesTimerRef = useRef(null)
  const localNotesRef = useRef(localNotes)

  useEffect(() => { setLocalNotes(reviewEntry?.notes || ''); localNotesRef.current = reviewEntry?.notes || '' }, [reviewEntry?.notes])

  const entry = (overrides) => ({
    status, dm_status: dmStatus, notes: localNotesRef.current,
    reject_reason: rejectReason, fit_rating: fitRating, ...overrides,
  })

  const handleNotesChange = (val) => {
    setLocalNotes(val)
    localNotesRef.current = val
    setNotesSaving(true)
    if (notesTimerRef.current) clearTimeout(notesTimerRef.current)
    notesTimerRef.current = setTimeout(() => {
      onUpdate(reviewKey(account), entry({ notes: val }))
      setNotesSaving(false)
    }, 800)
  }

  const handleApprove = (e) => {
    e.stopPropagation()
    onUpdate(reviewKey(account), entry({ status: 'approved' }))
  }


  const handleReject = (e) => {
    e.stopPropagation()
    onUpdate(reviewKey(account), entry({ status: 'rejected' }))
  }

  const handleUndo = (e) => {
    e.stopPropagation()
    onUpdate(reviewKey(account), entry({ status: 'pending' }))
  }

  const isPending = status === 'pending'
  const isApproved = status === 'approved'
  const isRejected = status === 'rejected'

  const activeCols = (selectedColumns || []).filter(id => TABLE_ROW_COLS[id])
  const gridTemplate = buildGridTemplate(activeCols)

  return (
    <>
      <div
        className={`group grid gap-3 px-4 py-3 border-b border-[#F0ECE2] hover:bg-surface cursor-pointer transition-colors items-center ${
          isApproved ? 'bg-[#F5F8F4]/50' : isRejected ? 'opacity-60' : ''
        }`}
        style={{ gridTemplateColumns: gridTemplate }}
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="min-w-0 flex flex-col justify-center sticky left-0 z-[1] bg-white group-hover:bg-surface">
          <a
            href={profileUrl(account)}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="font-medium text-sm text-ink hover:text-ink/70 flex items-center gap-1"
          >
            @{account.username} <ExternalLink size={11} className="opacity-30" />
          </a>
          {account.fullName && <p className="text-xs text-faint truncate">{account.fullName}</p>}
        </div>
        {activeCols.map(id => (
          <div key={id} className={`flex items-center${TABLE_ROW_COLS[id].center ? ' justify-center' : ''}`}>
            {TABLE_ROW_COLS[id].render(account)}
          </div>
        ))}
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
                className="flex items-center gap-1 px-2.5 py-1 rounded-[8px] bg-sage text-white text-[12px] hover:bg-sage/80 transition-all"
              >
                <Check size={11} />
                Approve
              </button>
            </>
          )}
          {isApproved && (
            <div className="flex items-center gap-2">
              <FitRating value={fitRating} onChange={(r) => onUpdate(reviewKey(account), entry({ fit_rating: r }))} />
              <span className="text-[11px] text-sage font-mono flex items-center gap-1"><Check size={11} /> Approved</span>
              <button onClick={handleUndo} className="text-[11px] text-faint hover:text-rose transition-colors font-mono">(undo)</button>
            </div>
          )}
          {isRejected && (
            <div className="flex items-center gap-2">
              <RejectReasonSelect value={rejectReason} onChange={(r) => onUpdate(reviewKey(account), entry({ reject_reason: r }))} />
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
  // Column visibility is remembered across tabs + reloads (Phase 4).
  const [selectedColumns, setSelectedColumns] = useState(loadColumnPrefs)
  const handleColumnsChange = useCallback((next) => {
    setSelectedColumns(next)
    saveColumnPrefs(next)
  }, [])
  const [editingBrief, setEditingBrief] = useState(false)
  const [briefDraft, setBriefDraft] = useState('')
  const briefInputRef = useRef(null)
  const [criteria, setCriteria] = useState('')
  const [editingCriteria, setEditingCriteria] = useState(false)
  const [criteriaDraft, setCriteriaDraft] = useState('')
  const criteriaInputRef = useRef(null)
  // One DM draft per campaign — persisted in review_state.__dm_draft__ and
  // reused verbatim for every approved account.
  const [dmDraft, setDmDraft] = useState('')
  const [editingDm, setEditingDm] = useState(false)
  const [dmEditText, setDmEditText] = useState('')
  const dmInputRef = useRef(null)
  const [dmGenerating, setDmGenerating] = useState(false)
  const [dmError, setDmError] = useState(null)
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
      // Campaign-level values live in review_state under reserved __keys__ (same
      // pattern as __notes__) so no schema migration is needed.
      const notes = typeof rs.__notes__ === 'string' ? rs.__notes__ : ''
      const crit = typeof rs.__criteria__ === 'string' ? rs.__criteria__ : ''
      const RESERVED = new Set(['__notes__', '__criteria__', DM_DRAFT_KEY])
      const accountState = Object.fromEntries(Object.entries(rs).filter(([k]) => !RESERVED.has(k)))
      // Seed the campaign draft from a legacy per-KOL dm_draft if the
      // campaign-level key isn't set yet (old drafts were never personalized,
      // so any one of them is the campaign message). Persist the seed so it
      // survives even after legacy per-KOL fields stop being written.
      const draft = campaignDmDraft(rs)
      if (draft && typeof rs[DM_DRAFT_KEY] !== 'string') {
        mergeReviewEntry(reviewId, DM_DRAFT_KEY, draft).catch((e) => console.error('Failed to seed campaign DM draft', e))
      }
      setDmDraft(draft)
      setCampaignBrief(data.campaign_brief || '')
      setCriteria(crit)
      setAccounts(accs)
      setReviewState(accountState)
      reviewStateRef.current = accountState
      bmNotesRef.current = notes
      setViewMode(accs.length > 20 ? 'table' : 'cards')
      setLoading(false)
    }
    load()
  }, [reviewId])

  const persistUpdate = useCallback(async (username, entry) => {
    setSaving(true)
    try {
      // Per-account merge (server-side when the RPC is deployed) so concurrent
      // reviewers editing *other* accounts are never clobbered.
      const merged = await mergeReviewEntry(reviewId, username, entry)
      // Reconcile local state with authoritative server state so others'
      // concurrent edits appear here instead of being silently lost. Guard:
      // only trust the map if it actually contains the account we just wrote —
      // otherwise keep the optimistic local state rather than wiping it.
      if (merged && merged[username]) {
        const { __notes__, __criteria__, __dm_draft__, ...accountState } = merged
        reviewStateRef.current = accountState
        if (typeof __notes__ === 'string') bmNotesRef.current = __notes__
        if (typeof __criteria__ === 'string') setCriteria(__criteria__)
        if (typeof __dm_draft__ === 'string') setDmDraft(__dm_draft__)
        setReviewState(accountState)
      }
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

  const startEditCriteria = () => {
    setCriteriaDraft(criteria)
    setEditingCriteria(true)
    setTimeout(() => criteriaInputRef.current?.focus(), 0)
  }

  const cancelEditCriteria = () => setEditingCriteria(false)

  // Criteria lives in review_state.__criteria__ — persisted via the same
  // atomic merge helper as per-account entries (a bare string is valid jsonb),
  // so it can't clobber concurrent per-account edits.
  const commitCriteria = useCallback(async () => {
    const trimmed = criteriaDraft.trim()
    setEditingCriteria(false)
    if (trimmed === criteria) return
    setCriteria(trimmed)
    try {
      await mergeReviewEntry(reviewId, '__criteria__', trimmed)
    } catch (e) {
      console.error('Failed to save seeding criteria', e)
    }
  }, [criteriaDraft, criteria, reviewId])

  // Persist the single campaign DM draft under the reserved __dm_draft__ key,
  // via the same atomic merge helper as notes/criteria.
  const saveDmDraft = useCallback(async (text) => {
    setDmDraft(text)
    try {
      await mergeReviewEntry(reviewId, DM_DRAFT_KEY, text)
    } catch (e) {
      console.error('Failed to save DM draft', e)
    }
  }, [reviewId])

  const generateDmDraft = useCallback(async () => {
    setDmGenerating(true)
    setDmError(null)
    try {
      const draft = await fetchDmDraft({ campaignBrief })
      setEditingDm(false)
      await saveDmDraft(draft)
    } catch (e) {
      setDmError(e.message)
    } finally {
      setDmGenerating(false)
    }
  }, [campaignBrief, saveDmDraft])

  const startEditDm = () => {
    setDmEditText(dmDraft)
    setEditingDm(true)
    setTimeout(() => dmInputRef.current?.focus(), 0)
  }

  const cancelEditDm = () => setEditingDm(false)

  const commitDm = useCallback(async () => {
    const trimmed = dmEditText.trim()
    setEditingDm(false)
    if (trimmed === dmDraft) return
    await saveDmDraft(trimmed)
  }, [dmEditText, dmDraft, saveDmDraft])

  const handleUpdate = useCallback((username, entry) => {
    // Optimistic local update for snappy UI; persistUpdate reconciles with the
    // merged server state (picking up other reviewers' concurrent changes).
    setReviewState((prev) => ({ ...prev, [username]: entry }))
    persistUpdate(username, entry)
  }, [persistUpdate])

  // Shared sort/filter engine — same behavior as the Results table. Default to
  // the account's stored order (no sort) until a header is clicked. MUST be
  // called before any early return so the hook order is stable across the
  // loading → loaded transition (otherwise React errors with "rendered more
  // hooks than during the previous render").
  const { processed: sortedAccounts, sortId, sortDir, toggleSort, filters, setFilter, distinctValues } =
    useTableControls(accounts, { defaultSortId: null, defaultSortDir: 'desc', urlSync: true, urlKey: 'review' })

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
    <div className="min-h-screen bg-paper px-[48px] py-[40px]">
      <div className="mb-8">
        {onBack && (
          <button onClick={onBack} className="flex items-center gap-1.5 font-mono text-[11.5px] text-faint hover:text-ink mb-4 transition-colors">
            <ArrowLeft size={13} /> Back to queue
          </button>
        )}
        <p className="font-mono text-[10px] tracking-[.18em] text-faint uppercase mb-[8px]">KOL Review</p>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[34px] font-serif font-bold tracking-[0.02em] text-ink mb-1">{accounts.length} accounts to review</h1>
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
            <ColumnPicker selected={selectedColumns} onChange={handleColumnsChange} />
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

        <div className="mt-3 px-4 py-3 bg-surface border border-card-edge rounded-[12px] group/criteria">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[9.5px] font-mono text-faint uppercase tracking-[.14em]">Seeding criteria — what makes a good fit</p>
            {!editingCriteria && (
              <button
                onClick={startEditCriteria}
                className="text-faint hover:text-ink transition-colors opacity-0 group-hover/criteria:opacity-100"
                title="Edit criteria"
              >
                <Pencil size={12} />
              </button>
            )}
          </div>
          {editingCriteria ? (
            <div>
              <textarea
                ref={criteriaInputRef}
                value={criteriaDraft}
                onChange={(e) => setCriteriaDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') cancelEditCriteria() }}
                rows={3}
                placeholder="e.g. Genuine skincare enthusiasts who film real routines; HK-based; authentic engagement over follower count; avoid accounts that only do paid hauls."
                className="w-full text-[13px] text-ink bg-white border border-ink/30 rounded-[8px] px-3 py-2 focus:outline-none resize-none placeholder:text-faint"
              />
              <div className="flex gap-2 mt-2">
                <button onClick={commitCriteria} className="flex items-center gap-1 px-3 py-1 bg-ink text-white rounded-[8px] text-[12px] hover:bg-ink/80 transition-all">
                  <Check size={12} /> Save
                </button>
                <button onClick={cancelEditCriteria} className="text-[12px] text-faint hover:text-ink transition-colors px-2">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <p className="text-[13px] text-body whitespace-pre-wrap">{criteria || <span className="text-faint italic">No criteria yet — describe what you're looking for so the AI can learn your taste</span>}</p>
          )}
        </div>

        {/* One DM draft per campaign — generated from the brief and reused for
            every approved account. Editable; never regenerates on its own. */}
        <div className="mt-3 px-4 py-3 bg-surface border border-card-edge rounded-[12px] group/dm">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[9.5px] font-mono text-faint uppercase tracking-[.14em]">Campaign DM draft — sent to every approved account</p>
            <div className="flex items-center gap-3">
              {dmDraft && !editingDm && !dmGenerating && (
                <>
                  <button onClick={generateDmDraft} className="text-[10px] font-mono text-faint hover:text-ink transition-colors">Regenerate</button>
                  <button onClick={startEditDm} className="text-faint hover:text-ink transition-colors opacity-0 group-hover/dm:opacity-100" title="Edit DM draft">
                    <Pencil size={12} />
                  </button>
                </>
              )}
            </div>
          </div>
          {dmGenerating ? (
            <div className="flex items-center gap-2 text-[11px] text-faint py-1">
              <Loader2 size={13} className="animate-spin" /> Generating DM draft…
            </div>
          ) : editingDm ? (
            <div>
              <textarea
                ref={dmInputRef}
                value={dmEditText}
                onChange={(e) => setDmEditText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') cancelEditDm() }}
                rows={6}
                className="w-full text-[13px] text-ink bg-white border border-ink/30 rounded-[8px] px-3 py-2 focus:outline-none resize-none"
              />
              <div className="flex gap-2 mt-2">
                <button onClick={commitDm} className="flex items-center gap-1 px-3 py-1 bg-ink text-white rounded-[8px] text-[12px] hover:bg-ink/80 transition-all">
                  <Check size={12} /> Save
                </button>
                <button onClick={cancelEditDm} className="text-[12px] text-faint hover:text-ink transition-colors px-2">Cancel</button>
              </div>
            </div>
          ) : dmDraft ? (
            <p className="text-[13px] text-body whitespace-pre-wrap">{dmDraft}</p>
          ) : (
            <div className="flex items-center gap-3">
              <button onClick={generateDmDraft} className="text-[12px] font-mono text-faint hover:text-ink transition-colors underline">Generate DM draft</button>
              {dmError && <span className="text-[11px] text-rose">Draft failed: {dmError}</span>}
            </div>
          )}
          {dmError && dmDraft && !dmGenerating && !editingDm && (
            <p className="text-[11px] text-rose mt-2">Draft failed: {dmError}</p>
          )}
        </div>

      </div>

      {viewMode === 'table' ? (() => {
        const activeCols = selectedColumns.filter(id => TABLE_ROW_COLS[id])
        const gridTemplate = buildGridTemplate(activeCols)
        const tableMinWidth = 160 + activeCols.reduce((s, id) => s + parseInt(TABLE_ROW_COLS[id].min), 0) + 130 + (activeCols.length + 1) * 12
        return (
        <div className="overflow-auto max-h-[70vh] border border-card-edge rounded-[14px] bg-white">
        <div style={{ minWidth: tableMinWidth }}>
          <div
            className="sticky top-0 z-20 grid gap-3 px-4 py-3 bg-surface border-b border-[#EDE8DC] text-[9.5px] font-mono text-faint uppercase tracking-[.13em] items-center"
            style={{ gridTemplateColumns: gridTemplate }}
          >
            <span className="sticky left-0 z-10 bg-surface">Account</span>
            {activeCols.map(id => {
              const meta = TABLE_COLUMNS.find(c => c.id === id)
              return (
                <ColumnHeaderCell
                  key={id}
                  col={{ id, label: TABLE_ROW_COLS[id].label, type: meta?.type }}
                  align={TABLE_ROW_COLS[id].center ? 'center' : 'left'}
                  sortId={sortId}
                  sortDir={sortDir}
                  onToggleSort={toggleSort}
                  distinctValues={distinctValues(id)}
                  activeFilter={filters[id] || []}
                  onFilterChange={setFilter}
                />
              )
            })}
            <span />
          </div>
          {sortedAccounts.map((account) => (
            <AccountTableRow
              key={reviewKey(account)}
              account={account}
              reviewEntry={reviewState[reviewKey(account)]}
              onUpdate={handleUpdate}
              selectedColumns={selectedColumns}
            />
          ))}
        </div>
        </div>
        )
      })() : (
        <div className="space-y-4">
          {sortedAccounts.map((account) => (
            <AccountCard
              key={reviewKey(account)}
              account={account}
              reviewEntry={reviewState[reviewKey(account)]}
              onUpdate={handleUpdate}
              selectedColumns={selectedColumns}
            />
          ))}
        </div>
      )}

      <p className="mt-8 text-[11px] text-faint font-mono text-center">
        Approved accounts share the campaign DM draft above · Changes save automatically
      </p>
    </div>
  )
}
