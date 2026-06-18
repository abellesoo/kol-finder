import { useState, useEffect, useCallback } from 'react'
import { ExternalLink, Loader2, Check, X, Copy, Instagram, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabase'

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

function AccountCard({ account, reviewEntry, campaignBrief, onUpdate }) {
  const status = reviewEntry?.status || 'pending'
  const dmStatus = reviewEntry?.dm_status || 'not_sent'
  const dmDraft = reviewEntry?.dm_draft || ''

  const [drafting, setDrafting] = useState(false)
  const [draftError, setDraftError] = useState(null)
  const [copied, setCopied] = useState(false)
  const [localDraft, setLocalDraft] = useState(dmDraft)

  // Keep local draft in sync if parent updates
  useEffect(() => { setLocalDraft(dmDraft) }, [dmDraft])

  const handleApprove = async () => {
    // Optimistically mark approved
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

        {/* Score + Approve/Reject */}
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

      {/* Stats row */}
      <div className="px-5 pb-3 flex flex-wrap gap-4 text-xs font-mono text-ink/50">
        {account.accountLocation && <span>📍 {account.accountLocation}</span>}
        {account.followerCount != null && <span>{account.followerCount.toLocaleString()} followers</span>}
        {account.engagementRate != null && <span>{account.engagementRate}% ER</span>}
        {account.avgLikes != null && <span>~{account.avgLikes.toLocaleString()} avg likes</span>}
      </div>

      {/* Bio */}
      {account.bio && (
        <div className="px-5 pb-3">
          <p className="text-xs text-ink/50 line-clamp-2">{account.bio}</p>
        </div>
      )}

      {/* Hashtags */}
      {account.hashtags?.length > 0 && (
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
                {/* DM Status picker */}
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
                {/* Copy + Open */}
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

export default function ReviewPage({ reviewId }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [campaignBrief, setCampaignBrief] = useState('')
  const [accounts, setAccounts] = useState([])
  // reviewState: { username: { status, dm_status, dm_draft } }
  const [reviewState, setReviewState] = useState({})
  const [saving, setSaving] = useState(false)

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

  // Write review_state back to Supabase whenever it changes (debounced via saving flag)
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

  const approvedCount = Object.values(reviewState).filter((e) => e.status === 'approved').length
  const rejectedCount = Object.values(reviewState).filter((e) => e.status === 'rejected').length
  const pendingCount = accounts.length - approvedCount - rejectedCount

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

  return (
    <div className="min-h-screen bg-paper px-6 py-10 max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <p className="font-mono text-xs tracking-widest text-ink/40 uppercase mb-2">KOL Review</p>
        <h1 className="text-2xl font-semibold text-ink mb-1">{accounts.length} accounts to review</h1>
        <p className="text-sm text-ink/50">
          <span className="text-sage font-medium">{approvedCount} approved</span>
          {' · '}
          <span className="text-rose/70 font-medium">{rejectedCount} rejected</span>
          {' · '}
          {pendingCount} pending
          {saving && <span className="ml-3 text-ink/30 font-mono text-xs">Saving…</span>}
        </p>
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
          />
        ))}
      </div>

      <p className="mt-8 text-xs text-ink/20 font-mono text-center">
        Approve to generate a DM draft · Changes save automatically
      </p>
    </div>
  )
}
