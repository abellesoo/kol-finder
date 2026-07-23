import { useEffect, useState } from 'react'
import { ArrowRight, ClipboardCheck, Send, Rocket, CheckCircle2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { reviewKey, campaignDmDraft, loadReviewSubmissions } from '../lib/reviewState'
import { loadHistory } from '../lib/sessionHistory'
import { listCampaigns } from '../lib/campaigns'

// Roll a campaign's per-state counts up to the numbers the dashboard shows.
function campaignMetrics(c) {
  const counts = c.counts || {}
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  const posted = counts.posted || 0
  const overdue = counts.overdue || 0
  return { total, posted, overdue, fulfilled: total ? Math.round((posted / total) * 100) : 0 }
}

function formatDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// Time-of-day greeting — the dashboard's first job is to feel like it knows who
// just walked in.
function greeting() {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

// First name from Google OAuth metadata, falling back to the email prefix
// (capitalized) so the greeting still lands even without a full_name.
function firstName(user) {
  const full = user?.user_metadata?.full_name
  if (full) return full.trim().split(/\s+/)[0]
  const local = user?.email?.split('@')[0]
  if (local) return local.charAt(0).toUpperCase() + local.slice(1)
  return 'there'
}

const todayLabel = () =>
  new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

// One stage of the seeding pipeline. `fill` is the bar width relative to the
// widest stage (Scored); `pct` is conversion from the previous stage.
function FunnelStage({ label, value, fill, tone }) {
  const barColor = tone === 'accent' ? 'var(--fn-accent)' : 'var(--fn-sage)'
  return (
    <div className="flex-1 min-w-0">
      <p className="font-mono text-[9.5px] tracking-[.14em] uppercase text-faint">{label}</p>
      <p className="font-serif font-bold text-[30px] leading-none tracking-[-0.01em] text-ink tabular-nums mt-2 mb-3">
        {value.toLocaleString()}
      </p>
      <div className="h-2 bg-mist rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-500" style={{ width: `${fill}%`, background: barColor }} />
      </div>
    </div>
  )
}

function Conversion({ pct, verb }) {
  return (
    <div className="flex flex-col items-center justify-center px-1 pt-5 flex-shrink-0" style={{ width: 62 }}>
      <ArrowRight size={14} className="text-card-edge mb-1" />
      <span className="text-[13px] font-semibold text-sage tabular-nums leading-none">{pct == null ? '—' : `${pct}%`}</span>
      <span className="text-[10px] text-faint mt-0.5">{verb}</span>
    </div>
  )
}

function ActionCard({ tone, icon: Icon, value, label, onClick }) {
  const cls =
    tone === 'amber'
      ? 'bg-[#F6ECD6] border-[#E7D3A8]'
      : 'bg-sage/8 border-sage/25'
  const iconCls = tone === 'amber' ? 'bg-[#E6D4A8] text-[#8A6A22]' : 'bg-sage/15 text-sage'
  const textCls = tone === 'amber' ? 'text-[#8A6A22]' : 'text-sage'
  return (
    <button
      onClick={onClick}
      className={`group flex items-center gap-4 px-[18px] py-4 rounded-[14px] border text-left transition-all hover:-translate-y-0.5 hover:shadow-[0_6px_18px_rgba(34,30,24,0.06)] ${cls}`}
    >
      <span className={`w-[38px] h-[38px] rounded-[10px] grid place-items-center flex-shrink-0 ${iconCls}`}>
        <Icon size={17} />
      </span>
      <span className="min-w-0">
        <span className="block font-serif font-bold text-[22px] leading-none text-ink tabular-nums">{value}</span>
        <span className={`block text-[12.5px] mt-1 ${textCls}`}>{label}</span>
      </span>
      <ArrowRight size={16} className="ml-auto text-ink/30 group-hover:text-ink/60 transition-colors flex-shrink-0" />
    </button>
  )
}

export default function DashboardPage({ user, onNavigate, onOpenReview, onOpenCampaign }) {
  const [campaigns, setCampaigns] = useState([])
  const [loading, setLoading] = useState(true)
  const [sessions, setSessions] = useState([])
  const [campaignOps, setCampaignOps] = useState([])
  const [campaignsLoading, setCampaignsLoading] = useState(true)

  useEffect(() => {
    loadHistory().then(setSessions)
  }, [])

  // Campaign Ops campaigns (the `campaigns` table) — distinct from the seeding
  // sessions below, which live on shared_results.
  useEffect(() => {
    let alive = true
    listCampaigns()
      .then((rows) => { if (alive) setCampaignOps(rows) })
      .catch(() => { if (alive) setCampaignOps([]) })
      .finally(() => { if (alive) setCampaignsLoading(false) })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    if (!supabase) { setLoading(false); return }
    loadReviewSubmissions()
      .then((rows) => setCampaigns(rows))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  // KPIs from session history
  const totalSessions = sessions.length
  const accountsScored = sessions.reduce((sum, s) => sum + (s.accountCount || 0), 0)

  // Pipeline + attention numbers from the Supabase review submissions. "Mine"
  // = submissions whose campaign is assigned to the current user (assignment
  // lives on the campaigns table, inherited via campaign_id).
  const userId = user?.id || null
  const ownerByCampaign = new Map(campaignOps.map((c) => [c.id, c.assigned_to || null]))
  let approved = 0
  let dmsSent = 0
  let pendingReview = 0
  let dmReady = 0
  let pendingReviewMine = 0
  let dmReadyMine = 0
  let reviewedAccounts = 0

  campaigns.forEach((c) => {
    const rs = c.review_state || {}
    const accounts = c.accounts || []
    reviewedAccounts += accounts.length
    const mine = !!(userId && c.campaign_id && ownerByCampaign.get(c.campaign_id) === userId)
    // One DM draft per campaign — an approved account is "ready" when the
    // campaign has a draft and its own DM hasn't gone out yet.
    const hasDraft = !!campaignDmDraft(rs)
    accounts.forEach((a) => {
      const entry = rs[reviewKey(a)]
      if (!entry?.status || entry.status === 'pending') {
        pendingReview++
        if (mine) pendingReviewMine++
      } else if (entry.status === 'approved') {
        approved++
        const dmStatus = entry.dm_status || 'not_sent'
        if (dmStatus === 'sent' || dmStatus === 'replied') dmsSent++
        if (dmStatus === 'not_sent' && hasDraft) {
          dmReady++
          if (mine) dmReadyMine++
        }
      }
    })
  })

  // Prefer the "yours" figure whenever the user owns any of the outstanding work;
  // fall back to the team-wide total otherwise.
  const hasMine = pendingReviewMine > 0 || dmReadyMine > 0
  const reviewValue = hasMine ? pendingReviewMine : pendingReview
  const dmValue = hasMine ? dmReadyMine : dmReady

  const totalPosted = campaignOps.reduce((sum, c) => sum + campaignMetrics(c).posted, 0)

  // Funnel: Scored → Approved → DM sent → Posted. Scored is the widest bar; keep
  // it >= downstream so the funnel never inverts visually even when the numbers
  // come from different sources.
  const scored = Math.max(accountsScored, reviewedAccounts, approved)
  const stages = [
    { key: 'scored', label: 'Scored', value: scored, tone: 'accent' },
    { key: 'approved', label: 'Approved', value: approved, tone: 'sage', verb: 'passed' },
    { key: 'dm', label: 'DM sent', value: dmsSent, tone: 'sage', verb: 'DM’d' },
    { key: 'posted', label: 'Posted', value: totalPosted, tone: 'sage', verb: 'posted' },
  ]
  const widest = Math.max(1, scored)
  const convPct = (curr, prev) => (prev > 0 ? Math.min(100, Math.round((curr / prev) * 100)) : null)

  const hasAttention = pendingReview > 0 || dmReady > 0
  const isEmpty =
    campaigns.length === 0 && sessions.length === 0 && campaignOps.length === 0 && !loading && !campaignsLoading

  if (isEmpty) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-8 py-24">
        <span className="w-14 h-14 rounded-[16px] bg-accent-dim grid place-items-center mb-5">
          <Rocket size={24} className="text-[#8A6A22]" />
        </span>
        <h2 className="text-[19px] font-serif font-bold text-ink mb-2">Welcome, {firstName(user)}</h2>
        <p className="text-[13.5px] text-muted mb-6 text-center max-w-xs">
          Run your first seeding session and your pipeline will take shape right here.
        </p>
        {onNavigate && (
          <button
            onClick={() => onNavigate('seeder')}
            className="flex items-center gap-2 px-4 py-2.5 bg-ink text-white rounded-[11px] text-[13px] font-medium hover:bg-ink/85 transition-all"
          >
            Start a session <ArrowRight size={14} />
          </button>
        )}
      </div>
    )
  }

  return (
    <div
      className="px-[48px] py-[40px] pb-[64px] max-w-[1120px] mx-auto w-full"
      style={{ '--fn-accent': '#C8A96E', '--fn-sage': '#4A7C59' }}
    >
      {/* Greeting hero */}
      <header className="mb-8 anim-rise">
        <p className="font-mono text-[10px] tracking-[.18em] text-faint uppercase mb-[10px] tabular-nums">{todayLabel()}</p>
        <h1 className="text-[34px] font-serif font-bold tracking-[0.01em] text-ink leading-tight text-balance">
          {greeting()}, <span className="italic text-accent">{firstName(user)}</span>
        </h1>
        <p className="text-[14px] text-muted mt-1.5">
          {hasAttention ? (
            <>
              {reviewValue > 0 && (
                <>
                  <span className="font-semibold text-ink tabular-nums">{reviewValue}</span> account{reviewValue !== 1 ? 's' : ''} awaiting {hasMine ? 'your review' : 'review'}
                </>
              )}
              {reviewValue > 0 && dmValue > 0 && ' · '}
              {dmValue > 0 && (
                <>
                  <span className="font-semibold text-ink tabular-nums">{dmValue}</span> DM{dmValue !== 1 ? 's' : ''} ready to send
                </>
              )}
            </>
          ) : (
            'Your KOL seeding workspace.'
          )}
        </p>
      </header>

      {/* Needs-you-now action strip */}
      {supabase && !loading && hasAttention && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 mb-9 anim-rise anim-d1">
          {reviewValue > 0 && (
            <ActionCard
              tone="amber"
              icon={ClipboardCheck}
              value={reviewValue}
              label={
                hasMine
                  ? `pending your review${pendingReview > pendingReviewMine ? ` · ${pendingReview} in all` : ''}`
                  : `account${reviewValue !== 1 ? 's' : ''} pending review`
              }
              onClick={() => onNavigate?.('review_queue')}
            />
          )}
          {dmValue > 0 && (
            <ActionCard
              tone="sage"
              icon={Send}
              value={dmValue}
              label={
                hasMine
                  ? `your DM${dmValue !== 1 ? 's' : ''} ready to send${dmReady > dmReadyMine ? ` · ${dmReady} in all` : ''}`
                  : `approved DM${dmValue !== 1 ? 's' : ''} ready to send`
              }
              onClick={() => onNavigate?.('ready_to_send')}
            />
          )}
        </div>
      )}

      {/* Pipeline funnel — the signature */}
      <section className="mb-10 anim-rise anim-d2">
        <div className="flex items-center justify-between mb-4">
          <p className="font-mono text-[9.5px] tracking-[.13em] text-faint uppercase">Seeding pipeline</p>
          <p className="font-mono text-[9.5px] tracking-[.13em] text-faint uppercase tabular-nums">
            {totalSessions} session{totalSessions !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="border border-card-edge rounded-[16px] bg-white px-7 pt-6 pb-7">
          <div className="flex items-stretch">
            {stages.map((s, i) => (
              <div key={s.key} className="flex items-stretch flex-1 min-w-0">
                <FunnelStage
                  label={s.label}
                  value={s.value}
                  tone={s.tone}
                  fill={Math.max(s.value > 0 ? 4 : 0, Math.round((s.value / widest) * 100))}
                />
                {i < stages.length - 1 && (
                  <Conversion pct={convPct(stages[i + 1].value, s.value)} verb={stages[i + 1].verb} />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Campaigns */}
      <section className="mb-10 anim-rise anim-d3">
        <div className="flex items-center justify-between mb-4">
          <p className="font-mono text-[9.5px] tracking-[.13em] text-faint uppercase">Campaigns</p>
          {onNavigate && campaignOps.length > 0 && (
            <button
              onClick={() => onNavigate('campaigns')}
              className="flex items-center gap-1 font-mono text-[10.5px] uppercase tracking-[.1em] text-faint hover:text-ink transition-colors"
            >
              All campaigns <ArrowRight size={12} />
            </button>
          )}
        </div>

        {!supabase ? (
          <p className="text-sm text-muted py-6 text-center border border-dashed border-mist rounded-[14px]">
            Supabase not configured — campaign data unavailable locally
          </p>
        ) : campaignsLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="border border-card-edge rounded-[14px] bg-white h-[132px] animate-pulse" />
            ))}
          </div>
        ) : campaignOps.length === 0 ? (
          <div className="py-8 text-center border border-dashed border-mist rounded-[14px]">
            <p className="text-sm text-muted mb-3">No campaigns yet</p>
            {onNavigate && (
              <button
                onClick={() => onNavigate('campaigns')}
                className="inline-flex items-center gap-2 px-4 py-2 bg-ink text-white rounded-[10px] text-[13px] hover:bg-ink/85 transition-all"
              >
                Create a campaign <ArrowRight size={14} />
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {campaignOps.slice(0, 6).map((c) => {
              const m = campaignMetrics(c)
              return (
                <button
                  key={c.id}
                  onClick={() => onOpenCampaign?.(c.id)}
                  className="group text-left border border-card-edge rounded-[14px] bg-white px-[18px] py-4 transition-all hover:border-accent hover:-translate-y-0.5 hover:shadow-[0_6px_18px_rgba(34,30,24,0.05)]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[14px] font-semibold text-[#322E26] truncate leading-snug">{c.name}</p>
                    <span
                      className={`flex-shrink-0 text-[9px] font-medium uppercase tracking-[.04em] px-2 py-0.5 rounded-full ${
                        c.status === 'active' ? 'bg-sage/10 text-sage' : 'bg-ink/5 text-faint'
                      }`}
                    >
                      {c.status}
                    </span>
                  </div>
                  <p className="text-[11px] text-faint truncate mt-1 mb-3.5">
                    {[c.brand, c.market, c.posting_deadline ? `deadline ${formatDate(c.posting_deadline)}` : null]
                      .filter(Boolean)
                      .join(' · ') || 'No details set'}
                  </p>
                  <div className="flex items-center justify-between text-[10.5px] text-muted mb-1.5 tabular-nums">
                    <span>Fulfilled</span>
                    <span className="font-semibold text-ink">{m.total ? `${m.fulfilled}%` : '—'}</span>
                  </div>
                  <div className="h-[7px] bg-mist rounded-full overflow-hidden">
                    <div className="h-full bg-sage rounded-full transition-all duration-500" style={{ width: `${m.fulfilled}%` }} />
                  </div>
                  <div className="flex gap-4 mt-3.5 text-[11px] text-muted tabular-nums">
                    <span><span className="font-semibold text-ink">{m.total || 0}</span> KOLs</span>
                    <span><span className="font-semibold text-ink">{m.posted || 0}</span> posted</span>
                    {m.overdue > 0 && <span className="text-rose-strong"><span className="font-semibold">{m.overdue}</span> overdue</span>}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </section>

      {/* Recent seeding sessions */}
      <section className="anim-rise anim-d4">
        <div className="flex items-center justify-between mb-4">
          <p className="font-mono text-[9.5px] tracking-[.13em] text-faint uppercase">Recent seeding sessions</p>
        </div>

        {!supabase ? (
          <p className="text-sm text-muted py-6 text-center border border-dashed border-mist rounded-[14px]">
            Supabase not configured — session data unavailable locally
          </p>
        ) : loading ? (
          <div className="border border-card-edge rounded-[14px] bg-white h-[120px] animate-pulse" />
        ) : campaigns.length === 0 ? (
          <div className="py-8 text-center border border-dashed border-mist rounded-[14px]">
            <CheckCircle2 size={20} className="text-faint mx-auto mb-2" />
            <p className="text-sm text-muted">No seeding sessions shared yet — score and share results from the Seeder</p>
          </div>
        ) : (
          <div className="border border-card-edge rounded-[14px] overflow-hidden bg-white">
            {/* Table header */}
            <div className="grid grid-cols-[1fr_80px_80px_80px_110px_36px] gap-4 px-[20px] py-[11px] border-b border-[#EDE8DC] bg-surface">
              {['Brief', 'Accounts', 'Approved', 'Pending', 'Date', ''].map((h, i) => (
                <span key={h || i} className="font-mono text-[9.5px] text-faint uppercase tracking-[.13em]">{h}</span>
              ))}
            </div>

            {campaigns.slice(0, 6).map((c, i) => {
              const rs = c.review_state || {}
              const accounts = c.accounts || []
              const total = accounts.length
              const approvedCount = accounts.filter((a) => rs[reviewKey(a)]?.status === 'approved').length
              const pendingCount = accounts.filter((a) => {
                const s = rs[reviewKey(a)]?.status
                return !s || s === 'pending'
              }).length
              const brief = c.campaign_brief || '—'

              return (
                <div
                  key={c.id}
                  onClick={() => (onOpenReview ? onOpenReview(c.id) : onNavigate?.('review_queue'))}
                  className={`grid grid-cols-[1fr_80px_80px_80px_110px_36px] gap-4 px-[20px] py-[14px] items-center cursor-pointer hover:bg-surface transition-colors ${
                    i !== Math.min(campaigns.length, 6) - 1 ? 'border-b border-[#F0ECE2]' : ''
                  }`}
                >
                  <p className="text-[13.5px] text-[#322E26] font-medium truncate" title={brief}>{brief}</p>
                  <span className="font-mono text-[13px] text-muted tabular-nums">{total}</span>
                  <span className="font-mono text-[13px] text-sage font-medium tabular-nums">{approvedCount}</span>
                  <span className="font-mono text-[13px] text-faint tabular-nums">{pendingCount}</span>
                  <span className="font-mono text-[11.5px] text-faint">{formatDate(c.created_at)}</span>
                  <span className="flex items-center justify-center text-[#C2BAA8]">
                    <ArrowRight size={14} />
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
