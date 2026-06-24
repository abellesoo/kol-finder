import { useState, useEffect, useCallback } from 'react'
import { Loader2, RefreshCw, ArrowRight } from 'lucide-react'
import { supabase } from '../lib/supabase'

function formatDate(isoStr) {
  if (!isoStr) return '—'
  return new Date(isoStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function ReviewQueuePage({ onOpenReview }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [rows, setRows] = useState([])

  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); return }
    setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('shared_results')
        .select('id, campaign_brief, accounts, review_state, created_at')
        .order('created_at', { ascending: false })
      if (err) throw new Error(err.message)
      setRows(data || [])
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-accent" />
      </div>
    )
  }

  return (
    <div className="min-h-screen px-[48px] py-[40px] max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="font-mono text-[10px] tracking-[.18em] text-faint uppercase mb-[8px]">Review Queue</p>
          <h1 className="text-[27px] font-bold tracking-[-0.02em] text-ink mb-1">{rows.length} {rows.length === 1 ? 'submission' : 'submissions'}</h1>
          <p className="text-[14px] text-muted">All accounts sent for review, newest first.</p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 px-3 py-2 border border-mist rounded-[10px] text-[13px] text-muted hover:border-ink/30 hover:text-ink transition-all bg-white"
        >
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {error && (
        <div className="mb-6 px-4 py-3 bg-rose/5 border border-rose/20 rounded-[12px] text-[12px] text-rose">{error}</div>
      )}

      {rows.length === 0 && !error && (
        <div className="text-center py-24">
          <p className="text-[13.5px] text-muted">No submissions yet.</p>
          <p className="text-[11px] text-faint mt-1 font-mono">Use "Send for Review" in the Seeder to add accounts here.</p>
        </div>
      )}

      <div className="space-y-3">
        {rows.map((row) => {
          const reviewState = row.review_state || {}
          const total = (row.accounts || []).length
          const approved = Object.values(reviewState).filter((e) => e.status === 'approved').length
          const rejected = Object.values(reviewState).filter((e) => e.status === 'rejected').length
          const pending = total - approved - rejected
          const brief = row.campaign_brief || '(no brief)'

          return (
            <div
              key={row.id}
              className="border border-card-edge rounded-[14px] px-5 py-4 bg-white hover:border-[#D6CEBD] transition-all"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-medium text-[13.5px] text-ink mb-0.5 truncate">
                    {brief.length > 90 ? brief.slice(0, 90) + '…' : brief}
                  </p>
                  <p className="text-[11px] text-faint font-mono">{formatDate(row.created_at)} · {total} {total === 1 ? 'account' : 'accounts'}</p>
                  <div className="flex items-center gap-3 mt-2">
                    {pending > 0 && <span className="text-[11px] font-mono text-faint">{pending} pending</span>}
                    {approved > 0 && <span className="text-[11px] font-mono text-sage font-medium">{approved} approved</span>}
                    {rejected > 0 && <span className="text-[11px] font-mono text-rose/80">{rejected} rejected</span>}
                    {total === 0 && <span className="text-[11px] font-mono text-faint">no accounts</span>}
                  </div>
                </div>
                <button
                  onClick={() => onOpenReview(row.id)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-ink text-white rounded-[10px] text-[13px] hover:bg-ink/80 transition-all flex-shrink-0"
                >
                  Open <ArrowRight size={13} />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
