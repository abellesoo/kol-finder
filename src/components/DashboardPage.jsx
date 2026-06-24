import { useEffect, useState } from 'react'
import { ArrowRight, AlertCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { loadHistory } from '../lib/sessionHistory'

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

export default function DashboardPage() {
  const [campaigns, setCampaigns] = useState([])
  const [loading, setLoading] = useState(true)
  const [sessions, setSessions] = useState([])

  useEffect(() => {
    loadHistory().then(setSessions)
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
      const entry = rs[a.username]
      if (!entry?.status) {
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

  return (
    <div className="px-[48px] py-[40px] pb-[64px] max-w-[1080px] mx-auto w-full">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <p className="font-mono text-[10px] tracking-[.18em] text-faint uppercase mb-[8px]">Dashboard</p>
          <h1 className="text-[27px] font-bold tracking-[-0.02em] text-ink leading-tight">Overview</h1>
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

      {/* Recent campaigns */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <p className="font-mono text-[9.5px] tracking-[.13em] text-faint uppercase">Recent campaigns</p>
        </div>

        {!supabase ? (
          <p className="text-sm text-muted py-6 text-center border border-dashed border-mist rounded-[14px]">
            Supabase not configured — campaign data unavailable locally
          </p>
        ) : loading ? (
          <p className="text-sm text-muted py-6 text-center">Loading...</p>
        ) : campaigns.length === 0 ? (
          <p className="text-sm text-muted py-6 text-center border border-dashed border-mist rounded-[14px]">
            No campaigns shared yet — use the Seeder to score and share results
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
              const approvedCount = accounts.filter((a) => rs[a.username]?.status === 'approved').length
              const pendingCount = accounts.filter((a) => !rs[a.username]?.status).length
              const brief = c.campaign_brief || '—'
              const url = `${window.location.pathname}?review=${c.id}&view=assistant`

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
                  <a
                    href={url}
                    className="flex items-center justify-center text-[#C2BAA8] hover:text-accent transition-colors"
                    title="View results"
                  >
                    <ArrowRight size={14} />
                  </a>
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
