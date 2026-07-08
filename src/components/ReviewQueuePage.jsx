import { useState, useEffect, useCallback } from 'react'
import { Loader2, RefreshCw, ArrowRight, CheckCircle2, Trash2, AlertTriangle } from 'lucide-react'
import { supabase } from '../lib/supabase'

function formatDate(isoStr) {
  if (!isoStr) return '—'
  return new Date(isoStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function ReviewQueuePage({ onOpenReview }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [rows, setRows] = useState([])
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [toast, setToast] = useState(null)

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

  useEffect(() => {
    if (!deleteTarget) return
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setDeleteTarget(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [deleteTarget])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

  const requestDeleteCampaign = (row) => setDeleteTarget(row)

  const confirmDeleteCampaign = async () => {
    if (!deleteTarget) return
    const { id, campaign_brief } = deleteTarget
    setDeleting(true)
    const { error: deleteError } = await supabase.from('shared_results').delete().eq('id', id)
    setDeleting(false)
    if (deleteError) {
      setToast({ type: 'error', message: deleteError.message || 'Failed to delete campaign' })
      return
    }
    setRows((prev) => prev.filter((r) => r.id !== id))
    setDeleteTarget(null)
    const label = campaign_brief ? (campaign_brief.length > 60 ? campaign_brief.slice(0, 60) + '…' : campaign_brief) : 'Campaign'
    setToast({ type: 'success', message: `${label} deleted` })
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-faint" />
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
        <div className="flex flex-col items-center py-24">
          <CheckCircle2 size={32} className="text-faint mb-4" />
          <h2 className="text-[17px] font-semibold text-ink mb-2">All caught up</h2>
          <p className="text-[13.5px] text-muted text-center">No accounts are waiting for brand manager review right now</p>
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
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={() => onOpenReview(row.id)}
                    className="flex items-center gap-1.5 px-4 py-2 bg-ink text-white rounded-[10px] text-[13px] hover:bg-ink/80 transition-all"
                  >
                    Open <ArrowRight size={13} />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); requestDeleteCampaign(row) }}
                    title="Delete campaign"
                    className="flex items-center justify-center w-9 h-9 rounded-[10px] border border-card-edge text-faint hover:text-rose hover:border-rose/30 hover:bg-rose/5 transition-all"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-[2px] px-4"
          onClick={() => !deleting && setDeleteTarget(null)}
        >
          <div
            className="w-full max-w-[380px] bg-white rounded-[16px] shadow-xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-rose/10 mb-4">
              <AlertTriangle size={18} className="text-rose" />
            </div>
            <h2 className="text-[16px] font-semibold text-ink mb-1.5">Delete campaign?</h2>
            <p className="text-[13px] text-muted mb-6 leading-relaxed">
              {`Are you sure you want to delete "${deleteTarget.campaign_brief || '(no brief)'}"? This action cannot be undone.`}
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="px-4 py-2 rounded-[10px] text-[13px] font-medium text-ink hover:bg-surface transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteCampaign}
                disabled={deleting}
                className="flex items-center gap-2 px-4 py-2 rounded-[10px] bg-rose text-white text-[13px] font-medium hover:bg-rose/90 transition-colors disabled:opacity-60"
              >
                {deleting && <Loader2 size={13} className="animate-spin" />}
                {deleting ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div
          className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] px-4 py-3 rounded-[12px] shadow-lg text-[13px] font-medium ${
            toast.type === 'error' ? 'bg-rose text-white' : 'bg-ink text-white'
          }`}
        >
          {toast.message}
        </div>
      )}
    </div>
  )
}
