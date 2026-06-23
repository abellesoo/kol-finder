import { useState, useEffect, useCallback, useRef } from 'react'
import { ExternalLink, Loader2, Check, X, Copy, Columns, Download, ArrowLeft } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { exportToCsv } from '../lib/exportCsv'
import { TABLE_COLUMNS, DEFAULT_SELECTED_COLUMNS } from '../lib/columnDefs'

const PROXY = (import.meta.env.VITE_PROXY_URL || 'https://kol-finder-proxy.asoo.workers.dev').replace(/\/$/, '')

const DM_STATUS_OPTIONS = ['not_sent', 'sent', 'replied', 'no_response']
const DM_STATUS_LABELS = { not_sent: 'Not sent', sent: 'Sent', replied: 'Replied', no_response: 'No response' }
const DM_STATUS_STYLES = {
  not_sent:    'bg-ink/10 text-ink/50',
  sent:        'bg-blue-100 text-blue-700',
  replied:     'bg-green-100 text-green-700',
  no_response: 'bg-rose/10 text-rose/70',
}

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
      <div className="w-16 h-1.5 bg-mist rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${(value / max) * 100}%` }} />
      </div>
      <span className="font-mono text-xs text-ink/50">{value}</span>
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
        className="flex items-center gap-2 px-3 py-1.5 border border-mist rounded-lg text-xs text-ink/60 hover:border-ink/30 hover:text-ink transition-all"
      >
        <Columns size={13} />
        Columns
        {selected.length < TABLE_COLUMNS.length && (
          <span className="font-mono text-xs bg-accent text-white rounded-full px-1.5 py-0.5 leading-none">
            {selected.length}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-52 bg-white border border-mist rounded-xl shadow-lg z-20 p-3">
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
            <button onClick={() => onChange(TABLE_COLUMNS.map(c => c.id))} className="text-xs text-ink/40 hover:text-ink transition-colors">Select all</button>
            <button onClick={() => onChange([])} className="text-xs text-ink/40 hover:text-ink transition-colors ml-auto">Clear</button>
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
  const [copied, setCopied] = useState(false)
  const [localDraft, setLocalDraft] = useState(dmDraft)

  useEffect(() => { setLocalDraft(dmDraft) }, [dmDraft])

  const handleApprove = async () => {
    onUpdate(account.username, { status: 'approved', dm_status: dmStatus, dm_draft: localDraft })
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
      onUpdate(account.username, { status: 'approved', dm_status: 'not_sent', dm_draft: draft })
    } catch (err) {
      setDraftError(err.message)
    } finally {
      setDrafting(false)
    }
  }

  const handleReject = () => {
    onUpdate(account.username, { status: 'rejected', dm_status: dmStatus, dm_draft: localDraft })
  }

  const handleCopyAndOpen = async () => {
    if (localDraft) {
      await navigator.clipboard.writeText(localDraft).catch(() => {})
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
    window.open(`https://www.instagram.com/${account.username}/`, '_blank', 'noreferrer')
    onUpdate(account.username, { status: 'approved', dm_status: 'sent', dm_draft: localDraft })
  }

  const handleDmStatusChange = (newStatus) => {
    onUpdate(account.username, { status, dm_status: newStatus, dm_draft: localDraft })
  }

  const isPending = status === 'pending'
  const isApproved = status === 'approved'
  const isRejected = status === 'rejected'

  const col = (id) => selectedColumns.includes(id)

  return (
    <div className={`border rounded-2xl overflow-hidden transition-all ${
      isApproved ? 'border-sage/40 bg-sage/5' :
      isRejected ? 'border-rose/20 bg-rose/5 opacity-60' :
      'border-mist bg-white'
    }`}>
      {/* Account header */}
      <div className="px-5 py-4 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <a href={`https://instagram.com/${account.username}`} target="_blank" rel="noreferrer"
              className="font-semibold text-sm text-ink hover:text-accent flex items-center gap-1">
              @{account.username} <ExternalLink size={11} className="opacity-40" />
            </a>
            {account.sourceBrand && (
              <span className="font-mono text-xs bg-mist px-2 py-0.5 rounded text-ink/50">{account.sourceBrand}</span>
            )}
          </div>
          {account.fullName && <p className="text-xs text-ink/40">{account.fullName}</p>}
          <div className="flex flex-wrap gap-1 mt-1.5">
            {(account.flags || []).map((f) => (
              <span key={f} className={`tag text-xs ${f === 'video-creator' ? 'tag-video' : f === 'bot-risk' ? 'tag-bot' : ''}`}>{f}</span>
            ))}
          </div>
        </div>

        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          <div className="flex items-center gap-2">
            <span className={`text-lg font-bold font-mono ${account.overall >= 70 ? 'text-sage' : account.overall >= 45 ? 'text-accent' : 'text-ink/40'}`}>
              {account.overall}
            </span>
            <span className="text-xs text-ink/30 font-mono">/ 100</span>
          </div>
          {isPending && (
            <div className="flex gap-2">
              <button onClick={handleReject}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-rose/40 text-rose text-xs hover:bg-rose/10 transition-all">
                <X size={12} /> Reject
              </button>
              <button onClick={handleApprove} disabled={drafting}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-sage text-white text-xs hover:bg-sage/80 transition-all disabled:opacity-50">
                {drafting ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                Approve
              </button>
            </div>
          )}
          {isApproved && !drafting && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-sage font-mono flex items-center gap-1"><Check size={11} /> Approved</span>
              <button onClick={handleReject} className="text-xs text-ink/30 hover:text-rose transition-colors font-mono">(undo)</button>
            </div>
          )}
          {isRejected && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-rose/70 font-mono flex items-center gap-1"><X size={11} /> Rejected</span>
              <button onClick={handleApprove} className="text-xs text-ink/30 hover:text-sage transition-colors font-mono">(undo)</button>
            </div>
          )}
        </div>
      </div>

      {/* Stats row — driven by TABLE_COLUMNS selection */}
      <div className="px-5 pb-3 flex flex-wrap gap-4 text-xs font-mono text-ink/50">
        {col('account_location') && account.accountLocation && <span>📍 {account.accountLocation}</span>}
        {col('follower_count') && account.followerCount != null && <span>{account.followerCount.toLocaleString()} followers</span>}
        {col('engagement') && account.engagementRate != null && <span>{account.engagementRate}% ER</span>}
        {col('engagement') && account.avgLikes != null && <span>~{account.avgLikes.toLocaleString()} avg likes</span>}
        {col('relevancy_score') && account.scores?.relevancy != null && <span>Relevancy {account.scores.relevancy}/10</span>}
        {col('engagement_score') && account.scores?.engagement != null && <span>Eng score {account.scores.engagement}/10</span>}
        {col('niche_signals') && account.nicheSignals?.length > 0 && (
          <span>{account.nicheSignals.slice(0, 3).join(' · ')}</span>
        )}
        {col('sample_post_url') && account.samplePostUrl && (
          <a href={account.samplePostUrl} target="_blank" rel="noreferrer"
            className="text-accent hover:underline flex items-center gap-0.5">
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

      {/* Caption — shown separately when selected */}
      {col('sample_caption') && account.sampleCaption && (
        <div className="px-5 pb-3">
          <p className="text-xs font-mono text-ink/40 uppercase tracking-wider mb-1">Scraped Caption</p>
          <p className="text-xs text-ink/50 line-clamp-3">{account.sampleCaption}</p>
        </div>
      )}

      {/* DM Draft — only when approved */}
      {isApproved && (
        <div className="border-t border-mist/50 px-5 py-4">
          {drafting && (
            <div className="flex items-center gap-2 text-xs text-ink/40 mb-3">
              <Loader2 size={13} className="animate-spin" /> Generating DM draft…
            </div>
          )}
          {draftError && (
            <p className="text-xs text-rose mb-3">Draft failed: {draftError}</p>
          )}
          {localDraft && !drafting && (
            <>
              <p className="text-xs font-mono text-ink/40 uppercase tracking-wider mb-2">DM Draft</p>
              <textarea
                value={localDraft}
                onChange={(e) => {
                  setLocalDraft(e.target.value)
                  onUpdate(account.username, { status: 'approved', dm_status: dmStatus, dm_draft: e.target.value })
                }}
                rows={5}
                className="w-full px-3 py-2.5 border border-mist rounded-lg text-sm text-ink bg-white focus:outline-none focus:border-accent resize-none"
              />
              <div className="flex items-center justify-between mt-3">
                <div className="flex gap-1.5">
                  {DM_STATUS_OPTIONS.map((s) => (
                    <button key={s} onClick={() => handleDmStatusChange(s)}
                      className={`px-2 py-1 rounded-full text-xs border transition-all ${
                        dmStatus === s ? DM_STATUS_STYLES[s] + ' border-current' : 'border-mist text-ink/40 hover:border-ink/30'
                      }`}>
                      {DM_STATUS_LABELS[s]}
                    </button>
                  ))}
                </div>
                <button onClick={handleCopyAndOpen}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-ink text-white rounded-lg text-xs hover:bg-ink/80 transition-all">
                  {copied ? <Check size={12} /> : <Copy size={12} />}
                  {copied ? 'Copied!' : 'Copy & open profile'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
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
      setCampaignBrief(data.campaign_brief || '')
      setAccounts(data.accounts || [])
      setReviewState(data.review_state || {})
      setLoading(false)
    }
    load()
  }, [reviewId])

  const persistUpdate = useCallback(async (newState) => {
    setSaving(true)
    try {
      await supabase
        .from('shared_results')
        .update({ review_state: newState })
        .eq('id', reviewId)
    } catch (e) {
      console.error('Failed to persist review state', e)
    } finally {
      setSaving(false)
    }
  }, [reviewId])

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
        <Loader2 size={24} className="animate-spin text-accent" />
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
    <div className="min-h-screen bg-paper px-6 py-10 max-w-3xl mx-auto">
      <div className="mb-8">
        {onBack && (
          <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-ink/40 hover:text-ink mb-4 transition-colors">
            <ArrowLeft size={13} /> Back to queue
          </button>
        )}
        <p className="font-mono text-xs tracking-widest text-ink/40 uppercase mb-2">KOL Review</p>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-ink mb-1">{accounts.length} accounts to review</h1>
            <p className="text-sm text-ink/50">
              <span className="text-sage font-medium">{approvedCount} approved</span>
              {' · '}
              <span className="text-rose/70 font-medium">{rejectedCount} rejected</span>
              {' · '}
              {pendingCount} pending
              {saving && <span className="ml-3 text-ink/30 font-mono text-xs">Saving…</span>}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <ColumnPicker selected={selectedColumns} onChange={setSelectedColumns} />
          </div>
        </div>
        {campaignBrief && (
          <div className="mt-4 px-4 py-3 bg-mist/50 rounded-xl">
            <p className="text-xs font-mono text-ink/40 uppercase tracking-wider mb-1">Campaign brief</p>
            <p className="text-sm text-ink/70">{campaignBrief}</p>
          </div>
        )}
      </div>

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

      <p className="mt-8 text-xs text-ink/20 font-mono text-center">
        Approve to generate a DM draft · Changes save automatically
      </p>
    </div>
  )
}
