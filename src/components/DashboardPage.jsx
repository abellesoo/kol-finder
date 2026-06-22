import { useEffect, useState } from 'react'
import { Users, CheckCircle, Send, Layers, Clock, ArrowRight, AlertCircle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { loadHistory } from '../lib/sessionHistory'

function formatDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function KpiCard({ icon: Icon, label, value, sub }) {
  return (
    <div className="border border-mist rounded-xl px-5 py-4 bg-paper flex flex-col gap-2">
      <div className="flex items-center gap-2 text-ink/30">
        <Icon size={13} strokeWidth={1.5} />
        <span className="font-mono text-xs tracking-widest uppercase">{label}</span>
      </div>
      <p className="text-3xl font-semibold text-ink tabular-nums">{value}</p>
      {sub && <p className="text-xs text-ink/40">{sub}</p>}
    </div>
  )
}

export default function DashboardPage() {
  const [campaigns, setCampaigns] = useState([])
  const [loading, setLoading] = useState(true)

  const sessions = loadHistory()

  useEffect(() => {
    if (!supabase) { setLoading(false); return }
    supabase
      .from('shared_results')
      .select('id, campaign_brief, accounts, review_state, created_at')
      .order('created_at', { ascending: false })
      .limit(10)
      .then(({ data }) => {
        setCampaigns(data || [])
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
    <div className="px-8 py-10 max-w-5xl mx-auto w-full">
      {/* Header */}
      <div className="mb-8">
        <p className="font-mono text-xs tracking-widest text-ink/30 uppercase mb-1">Dashboard</p>
        <h1 className="text-2xl font-semibold text-ink">Overview</h1>
      </div>

      {/* Attention banner */}
      {supabase && !loading && hasAttention && (
        <div className="mb-8 border border-accent/30 bg-accent-dim/30 rounded-xl px-5 py-4 flex items-start gap-3">
          <AlertCircle size={15} className="text-accent mt-0.5 shrink-0" />
          <div className="text-sm text-ink/70 flex flex-col gap-1">
            {pendingReview > 0 && (
              <span>
                <span className="font-medium text-ink">{pendingReview}</span> account{pendingReview !== 1 ? 's' : ''} pending brand manager review
              </span>
            )}
            {dmReady > 0 && (
              <span>
                <span className="font-medium text-ink">{dmReady}</span> approved DM draft{dmReady !== 1 ? 's' : ''} ready to send
              </span>
            )}
          </div>
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-4 gap-4 mb-10">
        <KpiCard icon={Layers} label="Sessions" value={totalSessions} sub="saved locally" />
        <KpiCard icon={Users} label="Scored" value={accountsScored} sub="across all sessions" />
        <KpiCard
          icon={CheckCircle}
          label="Approved"
          value={loading ? '—' : approved}
          sub={supabase ? 'from recent campaigns' : 'requires Supabase'}
        />
        <KpiCard
          icon={Send}
          label="DMs Sent"
          value={loading ? '—' : dmsSent}
          sub={supabase ? 'sent or replied' : 'requires Supabase'}
        />
      </div>

      {/* Recent campaigns */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Clock size={13} className="text-ink/30" />
          <p className="font-mono text-xs tracking-widest text-ink/40 uppercase">Recent campaigns</p>
        </div>

        {!supabase ? (
          <p className="text-sm text-ink/30 py-6 text-center border border-dashed border-mist rounded-xl">
            Supabase not configured — campaign data unavailable locally
          </p>
        ) : loading ? (
          <p className="text-sm text-ink/30 py-6 text-center">Loading...</p>
        ) : campaigns.length === 0 ? (
          <p className="text-sm text-ink/30 py-6 text-center border border-dashed border-mist rounded-xl">
            No campaigns shared yet — use the Seeder to score and share results
          </p>
        ) : (
          <div className="border border-mist rounded-xl overflow-hidden">
            {/* Table header */}
            <div className="grid grid-cols-[1fr_80px_80px_80px_110px_36px] gap-4 px-4 py-2.5 border-b border-mist bg-mist/30">
              {['Brief', 'Accounts', 'Approved', 'Pending', 'Date', ''].map((h) => (
                <span key={h} className="font-mono text-xs text-ink/40 uppercase tracking-widest">{h}</span>
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
                  className={`grid grid-cols-[1fr_80px_80px_80px_110px_36px] gap-4 px-4 py-3 items-center ${
                    i !== campaigns.length - 1 ? 'border-b border-mist' : ''
                  }`}
                >
                  <p className="text-sm text-ink truncate" title={brief}>{brief}</p>
                  <span className="font-mono text-sm text-ink/60">{total}</span>
                  <span className="font-mono text-sm text-sage">{approvedCount}</span>
                  <span className="font-mono text-sm text-ink/40">{pendingCount}</span>
                  <span className="font-mono text-xs text-ink/40">{formatDate(c.created_at)}</span>
                  <a
                    href={url}
                    className="flex items-center justify-center text-ink/30 hover:text-accent transition-colors"
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
