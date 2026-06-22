import { useState, useEffect, useCallback, useRef } from 'react'
import { ExternalLink, Loader2, Check, X, Copy, Columns, Download, Share2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { exportToCsv } from '../lib/exportCsv'

const PROXY = (import.meta.env.VITE_PROXY_URL || 'https://kol-finder-proxy.asoo.workers.dev').replace(/\/$/, '')

const DM_STATUS_OPTIONS = ['not_sent', 'sent', 'replied', 'no_response']
const DM_STATUS_LABELS = { not_sent: 'Not sent', sent: 'Sent', replied: 'Replied', no_response: 'No response' }
const DM_STATUS_STYLES = {
  not_sent:    'bg-ink/10 text-ink/50',
  sent:        'bg-blue-100 text-blue-700',
  replied:     'bg-green-100 text-green-700',
  no_response: 'bg-rose/10 text-rose/70',
}

const REVIEW_COLUMNS = [
  { id: 'follower_count',  label: 'Followers' },
  { id: 'engagement_rate', label: 'Eng. Rate' },
  { id: 'avg_likes',       label: 'Avg Likes' },
  { id: 'location',        label: 'Location' },
  { id: 'niche_signals',   label: 'Niche Tags' },
  { id: 'sample_post',     label: 'Sample Post' },
  { id: 'bio',             label: 'Bio' },
  { id: 'hashtags',        label: 'Hashtags' },
]
const DEFAULT_REVIEW_COLUMNS = ['follower_count', 'engagement_rate', 'avg_likes', 'location', 'niche_signals', 'sample_post']

// Column IDs passed to exportToCsv for the assistant return view
const ASSISTANT_EXPORT_COLS = [
  'username', 'instagram_url', 'brand', 'overall', 'engagement_rate', 'avg_likes',
  'niche_signals', 'sample_post_url', 'approve', 'dm_status', 'dm_draft',
]

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
        <Columns size={13} /> Columns
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-48 bg-white border border-mist rounded-xl shadow-lg z-10 p-3">
          <p className="text-xs font-mono text-ink/40 uppercase tracking-wider mb-2">Show columns</p>
          <div className="space-y-1">
            {REVIEW_COLUMNS.map((col) => (
              <label key={col.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-mist/50 cursor-pointer">
                <input type="checkbox" checked={selected.includes(col.id)} onChange={() => toggle(col.id)} className="accent-accent" />
                <span className="font-mono text-xs text-ink/70">{col.label}</span>
              </label>
            ))}
          </div>
          <div className="flex gap-2 mt-3 pt-2 border-t border-mist">
            <button onClick={() => onChange(REVIEW_COLUMNS.map(c => c.id))} className="text-xs text-ink/40 hover:text-ink transition-colors">Select all</button>
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

      {/* Stats row — column-controlled */}
      <div className="px-5 pb-3 flex flex-wrap gap-4 text-xs font-mono text-ink/50">
        {col('location') && account.accountLocation && <span>📍 {account.accountLocation}</span>}
        {col('follower_count') && account.followerCount != null && <span>{account.followerCount.toLocaleString()} followers</span>}
        {col('engagement_rate') && account.engagementRate != null && <span>{account.engagementRate}% ER</span>}
        {col('avg_likes') && account.avgLikes != null && <span>~{account.avgLikes.toLocaleString()} avg likes</span>}
        {col('niche_signals') && account.nicheSignals?.length > 0 && (
          <span>{account.nicheSignals.slice(0, 3).join(' · ')}</span>
        )}
        {col('sample_post') && account.samplePostUrl && (
          <a href={account.samplePostUrl} target="_blank" rel="noreferrer"
            className="text-accent hover:underline flex items-center gap-0.5">
            Sample post <ExternalLink size={10} />
          </a>
        )}
      </div>

      {/* Bio — column-controlled */}
      {col('bio') && account.bio && (
        <div className="px-5 pb-3">
          <p className="text-xs text-ink/50 line-clamp-2">{account.bio}</p>
        </div>
      )}

      {/* Hashtags — column-controlled */}
      {col('hashtags') && account.hashtags?.length > 0 && (
        <div className="px-5 pb-3 flex flex-wrap gap-1">
          {account.hashtags.slice(0, 8).map((h) => (
            <span key={h} className="tag text-xs">#{h}</span>
          ))}
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

// Read-only view rendered when the assistant opens the return link (?view=assistant)
function AssistantView({ accounts, reviewState, campaignBrief }) {
  const approvedCount = Object.values(reviewState).filter(e => e.status === 'approved').length
  const rejectedCount = Object.values(reviewState).filter(e => e.status === 'rejected').length
  const pendingCount = accounts.length - approvedCount - rejectedCount

  const handleExport = () => {
    // Pass accounts as both results and influencers — all fields live on the stored object
    exportToCsv(accounts, accounts, ASSISTANT_EXPORT_COLS, {}, reviewState).catch(console.error)
  }

  const statusConfig = {
    approved: { label: 'Approved', cls: 'bg-sage/10 text-sage border-sage/30' },
    rejected: { label: 'Rejected', cls: 'bg-rose/10 text-rose/70 border-rose/20' },
    pending:  { label: 'Pending',  cls: 'bg-ink/5 text-ink/40 border-ink/10' },
  }

  return (
    <div className="min-h-screen bg-paper px-6 py-10 max-w-6xl mx-auto">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="font-mono text-xs tracking-widest text-ink/40 uppercase mb-2">Review Results · Read Only</p>
          <h1 className="text-2xl font-semibold text-ink mb-1">{accounts.length} accounts reviewed</h1>
          <p className="text-sm text-ink/50">
            <span className="text-sage font-medium">{approvedCount} approved</span>
            {' · '}
            <span className="text-rose/70 font-medium">{rejectedCount} rejected</span>
            {' · '}
            {pendingCount} pending
          </p>
          {campaignBrief && (
            <div className="mt-4 px-4 py-3 bg-mist/50 rounded-xl max-w-xl">
              <p className="text-xs font-mono text-ink/40 uppercase tracking-wider mb-1">Campaign brief</p>
              <p className="text-sm text-ink/70">{campaignBrief}</p>
            </div>
          )}
        </div>
        <button onClick={handleExport}
          className="flex items-center gap-2 px-4 py-2 bg-ink text-white rounded-lg text-sm hover:bg-ink/80 transition-all flex-shrink-0">
          <Download size={15} /> Export XLSX
        </button>
      </div>

      <div className="border border-mist rounded-xl overflow-x-auto">
        {/* Header row */}
        <div
          className="grid gap-3 px-4 py-3 bg-mist/50 border-b border-mist text-xs font-mono text-ink/40 uppercase tracking-wider"
          style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 2fr' }}
        >
          <span>Account</span>
          <span className="text-center">Brand</span>
          <span className="text-center">Score</span>
          <span className="text-center">Avg Likes</span>
          <span className="text-center">Status</span>
          <span>DM Draft</span>
        </div>

        {accounts.map((account) => {
          const rs = reviewState[account.username]
          const status = rs?.status || 'pending'
          const cfg = statusConfig[status]
          return (
            <div
              key={account.username}
              className="grid gap-3 px-4 py-3.5 border-b border-mist/50 items-center last:border-0"
              style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr 2fr' }}
            >
              <div className="min-w-0">
                <a href={`https://instagram.com/${account.username}`} target="_blank" rel="noreferrer"
                  className="font-medium text-sm text-ink hover:text-accent flex items-center gap-1">
                  @{account.username} <ExternalLink size={11} className="opacity-40" />
                </a>
                {account.fullName && <p className="text-xs text-ink/40 truncate">{account.fullName}</p>}
              </div>
              <div className="flex justify-center">
                <span className="font-mono text-xs text-ink/60 truncate max-w-full">{account.sourceBrand || '—'}</span>
              </div>
              <div className="flex justify-center">
                <span className={`score-badge ${account.overall >= 70 ? 'score-high' : account.overall >= 45 ? 'score-mid' : 'score-low'}`}>
                  {account.overall}
                </span>
              </div>
              <div className="flex justify-center">
                <span className="font-mono text-xs text-ink/60">
                  {account.avgLikes != null ? `~${account.avgLikes.toLocaleString()}` : '—'}
                </span>
              </div>
              <div className="flex justify-center">
                <span className={`px-2 py-0.5 rounded-full text-xs border font-mono ${cfg.cls}`}>
                  {cfg.label}
                </span>
              </div>
              <div className="min-w-0">
                {rs?.dm_draft
                  ? <p className="text-xs text-ink/60 line-clamp-2">{rs.dm_draft}</p>
                  : <span className="text-xs text-ink/20 font-mono">—</span>
                }
              </div>
            </div>
          )
        })}
      </div>

      <p className="mt-6 text-xs text-ink/20 font-mono text-center">Read-only view · Changes made by brand manager are reflected here</p>
    </div>
  )
}

export default function ReviewPage({ reviewId, view }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [campaignBrief, setCampaignBrief] = useState('')
  const [accounts, setAccounts] = useState([])
  const [reviewState, setReviewState] = useState({})
  const [saving, setSaving] = useState(false)
  const [selectedColumns, setSelectedColumns] = useState(DEFAULT_REVIEW_COLUMNS)
  const [returnLinkCopied, setReturnLinkCopied] = useState(false)

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

  const handleShareBack = useCallback(async () => {
    const url = new URL(window.location.href)
    url.searchParams.set('view', 'assistant')
    await navigator.clipboard.writeText(url.toString()).catch(() => {})
    setReturnLinkCopied(true)
    setTimeout(() => setReturnLinkCopied(false), 2500)
  }, [])

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
          <p className="text-lg font-semibold text-ink mb-2">Link not found</p>
          <p className="text-sm text-ink/50">{error}</p>
        </div>
      </div>
    )
  }

  // Assistant return view — read-only
  if (view === 'assistant') {
    return <AssistantView accounts={accounts} reviewState={reviewState} campaignBrief={campaignBrief} />
  }

  // Brand manager approval view
  const approvedCount = Object.values(reviewState).filter((e) => e.status === 'approved').length
  const rejectedCount = Object.values(reviewState).filter((e) => e.status === 'rejected').length
  const pendingCount = accounts.length - approvedCount - rejectedCount

  return (
    <div className="min-h-screen bg-paper px-6 py-10 max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-8">
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
            <button
              onClick={handleShareBack}
              className="flex items-center gap-2 px-3 py-1.5 border border-mist rounded-lg text-xs text-ink/60 hover:border-ink/30 hover:text-ink transition-all"
            >
              {returnLinkCopied ? <Check size={13} className="text-sage" /> : <Share2 size={13} />}
              {returnLinkCopied ? 'Link copied!' : 'Share back'}
            </button>
          </div>
        </div>
        {campaignBrief && (
          <div className="mt-4 px-4 py-3 bg-mist/50 rounded-xl">
            <p className="text-xs font-mono text-ink/40 uppercase tracking-wider mb-1">Campaign brief</p>
            <p className="text-sm text-ink/70">{campaignBrief}</p>
          </div>
        )}
      </div>

      {/* Account cards */}
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
