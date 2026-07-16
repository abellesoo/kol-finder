import { useEffect, useState } from 'react'
import { ArrowRight, AlertCircle, Rocket } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { reviewKey } from '../lib/reviewState'
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

function KpiCard({ label, value, sub }) {
  return (
    <div className="border border-card-edge rounded-[14px] px-[18px] pt-[18px] pb-[16px] bg-white flex flex-col">
      <p className="font-mono text-[9.5px] tracking-[.14em] uppercase text-faint mb-[14px]">{label}</p>
      <p className="font-mono text-[30px] font-semibold tracking-[-0.02em] text-ink leading-none tabular-nums">{value}</p>
      {sub && <p className="text-[12px] text-[#8E8775] mt-[8px]">{sub}</p>}
    </div>
  )
}

export default function DashboardPage({ onNavigate, onOpenReview, onOpenCampaign }) {
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
    supabase
      .from('shared_results')
      .select('id, campaign_brief, accounts, review_state, created_at')
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data, error }) => {
        if (!error) setCampaigns(data || [])
        setLoading(false)
      })
  }, [])

  // KPIs from localStorage
  const totalSessions = sessions.length
  const accountsScored = sessions.reduce((sum, s) => sum + (s.accountCount || 0), 0)

  // KPIs + attention summary from Supabase campaigns
  let approved = 0
  let dmsSent = 0
  let pendingReview = 0
  let dmReady = 0

  campaigns.forEach((c) => {
    const rs = c.review_state || {}
    const accounts = c.accounts || []
    accounts.forEach((a) => {
      const entry = rs[reviewKey(a)]
      if (!entry?.status || entry.status === 'pending') {
        pendingReview++
      } else if (entry.status === 'approved') {
        approved++
        const dmStatus = entry.dm_status || 'not_sent'
        if (dmStatus === 'sent' || dmStatus === 'replied') dmsSent++
        if (dmStatus === 'not_sent' && entry.dm_draft) dmReady++
      }
    })
  })

  const hasAttention = pendingReview > 0 || dmReady > 0

  const isEmpty = campaigns.length === 0 && sessions.length === 0 && campaignOps.length === 0 && !loading && !campaignsLoading

  if (isEmpty) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-8 py-24">
        <Rocket size={32} className="text-faint mb-4" />
        <h2 className="text-[17px] font-semibold text-ink mb-2">No campaigns yet</h2>
        <p className="text-[13.5px] text-muted mb-6 text-center">Run your first seeding session to see results here</p>
        {onNavigate && (
          <button
            onClick={() => onNavigate('seeder')}
            className="flex items-center gap-2 px-4 py-2 bg-ink text-white rounded-[10px] text-[13px] hover:bg-ink/80 transition-all"
          >
            Start a session <ArrowRight size={14} />
          </button>
        )}
      </div>
    )
  }

  return (
    <div className="px-[48px] py-[40px] pb-[64px] max-w-[1080px] mx-auto w-full">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <p className="font-mono text-[10px] tracking-[.18em] text-faint uppercase mb-[8px]">Dashboard</p>
          <h1 className="text-[34px] font-serif font-bold tracking-[0.02em] text-ink leading-tight">Overview</h1>
          <p className="text-[14px] text-muted mt-1">Your KOL seeding workspace</p>
        </div>
      </div>

      {/* Attention banner */}
      {supabase && !loading && hasAttention && (
        <div className="mb-8 border border-[#E7D3A8] bg-[#F6ECD6] rounded-[13px] px-5 py-4 flex items-start gap-3">
          <div className="w-[34px] h-[34px] rounded-[9px] bg-[#E6D4A8] flex items-center justify-center flex-shrink-0">
            <AlertCircle size={16} className="text-[#8A6A22]" />
          </div>
          <div className="text-[13.5px] text-body flex flex-col gap-1 pt-[1px]">
            {pendingReview > 0 && (
              <span>
                <span className="font-semibold text-ink">{pendingReview}</span> account{pendingReview !== 1 ? 's' : ''} pending brand manager review
              </span>
            )}
            {dmReady > 0 && (
              <span>
                <span className="font-semibold text-ink">{dmReady}</span> approved DM draft{dmReady !== 1 ? 's' : ''} ready to send
              </span>
            )}
          </div>
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-4 gap-4 mb-10">
        <KpiCard label="Sessions" value={totalSessions} sub="across the team" />
        <KpiCard label="Scored" value={accountsScored} sub="across all sessions" />
        <KpiCard
          label="Approved"
          value={loading ? '—' : approved}
          sub={supabase ? 'from recent campaigns' : 'requires Supabase'}
        />
        <KpiCard
          label="DMs Sent"
          value={loading ? '—' : dmsSent}
          sub={supabase ? 'sent or replied' : 'requires Supabase'}
        />
      </div>

      {/* Campaigns (Campaign Ops) */}
      <section className="mb-10">
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
          <p className="text-sm text-muted py-6 text-center">Loading...</p>
        ) : campaignOps.length === 0 ? (
          <div className="py-8 text-center border border-dashed border-mist rounded-[14px]">
            <p className="text-sm text-muted mb-3">No campaigns yet</p>
            {onNavigate && (
              <button
                onClick={() => onNavigate('campaigns')}
                className="inline-flex items-center gap-2 px-4 py-2 bg-ink text-white rounded-[10px] text-[13px] hover:bg-ink/80 transition-all"
              >
                Create a campaign <ArrowRight size={14} />
              </button>
            )}
          </div>
        ) : (
          <div className="border border-card-edge rounded-[14px] overflow-hidden bg-white">
            {/* Table header */}
            <div className="grid grid-cols-[1fr_64px_64px_72px_84px_36px] gap-4 px-[20px] py-[11px] border-b border-[#EDE8DC] bg-surface">
              {['Campaign', 'KOLs', 'Posted', 'Overdue', 'Fulfilled', ''].map((h, i) => (
                <span key={h || i} className={`font-mono text-[9.5px] text-faint uppercase tracking-[.13em] ${i > 0 && i < 5 ? 'text-right' : ''}`}>{h}</span>
              ))}
            </div>

            {campaignOps.map((c, i) => {
              const m = campaignMetrics(c)
              return (
                <div
                  key={c.id}
                  onClick={() => onOpenCampaign?.(c.id)}
                  className={`grid grid-cols-[1fr_64px_64px_72px_84px_36px] gap-4 px-[20px] py-[13px] items-center cursor-pointer hover:bg-surface transition-colors ${
                    i !== campaignOps.length - 1 ? 'border-b border-[#F0ECE2]' : ''
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-[13.5px] text-[#322E26] font-medium truncate">{c.name}</p>
                      <span className={`flex-shrink-0 text-[9px] font-mono px-1.5 py-0.5 rounded-full ${
                        c.status === 'active' ? 'bg-sage/10 text-sage' : 'bg-ink/5 text-faint'}`}>{c.status}</span>
                    </div>
                    <p className="text-[11px] text-faint font-mono truncate">
                      {[c.brand, c.market, c.posting_deadline ? `deadline ${formatDate(c.posting_deadline)}` : null].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <span className="font-mono text-[13px] text-body text-right">{m.total || '—'}</span>
                  <span className="font-mono text-[13px] text-sage font-medium text-right">{m.posted || '—'}</span>
                  <span className="font-mono text-[13px] text-rose/80 text-right">{m.overdue || '—'}</span>
                  <span className="font-mono text-[13px] text-body text-right">{m.total ? `${m.fulfilled}%` : '—'}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); onOpenCampaign?.(c.id) }}
                    className="flex items-center justify-center text-[#C2BAA8] hover:text-ink transition-colors"
                    title="Open campaign"
                  >
                    <ArrowRight size={14} />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* Recent seeding sessions (shared_results) */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <p className="font-mono text-[9.5px] tracking-[.13em] text-faint uppercase">Recent seeding sessions</p>
        </div>

        {!supabase ? (
          <p className="text-sm text-muted py-6 text-center border border-dashed border-mist rounded-[14px]">
            Supabase not configured — session data unavailable locally
          </p>
        ) : loading ? (
          <p className="text-sm text-muted py-6 text-center">Loading...</p>
        ) : campaigns.length === 0 ? (
          <p className="text-sm text-muted py-6 text-center border border-dashed border-mist rounded-[14px]">
            No seeding sessions shared yet — use the Seeder to score and share results
          </p>
        ) : (
          <div className="border border-card-edge rounded-[14px] overflow-hidden bg-white">
            {/* Table header */}
            <div className="grid grid-cols-[1fr_80px_80px_80px_110px_36px] gap-4 px-[20px] py-[11px] border-b border-[#EDE8DC] bg-surface">
              {['Brief', 'Accounts', 'Approved', 'Pending', 'Date', ''].map((h) => (
                <span key={h} className="font-mono text-[9.5px] text-faint uppercase tracking-[.13em]">{h}</span>
              ))}
            </div>

            {campaigns.map((c, i) => {
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
                  className={`grid grid-cols-[1fr_80px_80px_80px_110px_36px] gap-4 px-[20px] py-[14px] items-center hover:bg-surface transition-colors ${
                    i !== campaigns.length - 1 ? 'border-b border-[#F0ECE2]' : ''
                  }`}
                >
                  <p className="text-[13.5px] text-[#322E26] font-medium truncate" title={brief}>{brief}</p>
                  <span className="font-mono text-[13px] text-muted">{total}</span>
                  <span className="font-mono text-[13px] text-sage font-medium">{approvedCount}</span>
                  <span className="font-mono text-[13px] text-faint">{pendingCount}</span>
                  <span className="font-mono text-[11.5px] text-faint">{formatDate(c.created_at)}</span>
                  <button
                    onClick={() => (onOpenReview ? onOpenReview(c.id) : onNavigate?.('review_queue'))}
                    className="flex items-center justify-center text-[#C2BAA8] hover:text-ink transition-colors"
                    title="View results"
                  >
                    <ArrowRight size={14} />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
