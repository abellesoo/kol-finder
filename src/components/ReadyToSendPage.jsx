import { useState, useEffect, useCallback } from 'react'
import { ExternalLink, Copy, Check, Loader2, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabase'

export default function ReadyToSendPage() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [items, setItems] = useState([])
  const [copiedUser, setCopiedUser] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const { data, error: err } = await supabase
        .from('shared_results')
        .select('id, campaign_brief, accounts, review_state')
        .order('created_at', { ascending: false })
      if (err) throw new Error(err.message)

      const ready = []
      for (const row of data || []) {
        for (const account of row.accounts || []) {
          const entry = row.review_state?.[account.username]
          const dmStatus = entry?.dm_status || 'not_sent'
          if (entry?.status === 'approved' && dmStatus === 'not_sent') {
            ready.push({
              rowId: row.id,
              username: account.username,
              fullName: account.fullName || '',
              dm_draft: entry.dm_draft || '',
              campaignBrief: row.campaign_brief || '',
              reviewEntry: entry,
            })
          }
        }
      }
      setItems(ready)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleCopy = useCallback(async (item) => {
    if (item.dm_draft) {
      await navigator.clipboard.writeText(item.dm_draft).catch(() => {})
    }
    setCopiedUser(item.username)
    setTimeout(() => setCopiedUser(null), 2000)

    // Mark dm_status = sent and remove from list
    try {
      const { data: row } = await supabase
        .from('shared_results')
        .select('review_state')
        .eq('id', item.rowId)
        .single()

      const newState = {
        ...(row?.review_state || {}),
        [item.username]: { ...item.reviewEntry, dm_status: 'sent' },
      }
      await supabase.from('shared_results').update({ review_state: newState }).eq('id', item.rowId)
      setItems((prev) => prev.filter((i) => !(i.rowId === item.rowId && i.username === item.username)))
    } catch (e) {
      console.error('Failed to update dm_status', e)
    }
  }, [])

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-accent" />
      </div>
    )
  }

  return (
    <div className="min-h-screen px-6 py-10 max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <p className="font-mono text-xs tracking-widest text-ink/40 uppercase mb-2">Ready to Send</p>
          <h1 className="text-2xl font-semibold text-ink mb-1">
            {items.length} {items.length === 1 ? 'account' : 'accounts'} approved
          </h1>
          <p className="text-sm text-ink/50">Copy each DM draft and open the Instagram profile to send.</p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 px-3 py-2 border border-mist rounded-lg text-sm text-ink/50 hover:border-ink/30 hover:text-ink transition-all"
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {error && (
        <div className="mb-6 px-4 py-3 bg-rose/5 border border-rose/20 rounded-xl text-xs text-rose">{error}</div>
      )}

      {items.length === 0 && !error && (
        <div className="text-center py-24">
          <p className="text-sm text-ink/30">No approved accounts waiting for DMs.</p>
          <p className="text-xs text-ink/20 mt-1 font-mono">Accounts appear here once a brand manager approves them in the Review Queue.</p>
        </div>
      )}

      <div className="space-y-4">
        {items.map((item) => (
          <div
            key={`${item.rowId}-${item.username}`}
            className="border border-sage/30 bg-sage/5 rounded-2xl px-5 py-4"
          >
            <div className="flex items-start justify-between gap-4 mb-3">
              <div className="min-w-0">
                <a
                  href={`https://instagram.com/${item.username}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-sm text-ink hover:text-accent flex items-center gap-1"
                >
                  @{item.username} <ExternalLink size={11} className="opacity-40" />
                </a>
                {item.fullName && <p className="text-xs text-ink/40">{item.fullName}</p>}
                {item.campaignBrief && (
                  <p className="text-xs text-ink/30 font-mono mt-1 truncate max-w-sm">{item.campaignBrief}</p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => handleCopy(item)}
                  className="flex items-center gap-1.5 px-3 py-1.5 border border-mist rounded-lg text-xs text-ink/60 hover:border-ink/30 hover:text-ink transition-all"
                >
                  {copiedUser === item.username ? <Check size={12} className="text-sage" /> : <Copy size={12} />}
                  {copiedUser === item.username ? 'Copied!' : 'Copy DM'}
                </button>
                <a
                  href={`https://www.instagram.com/${item.username}/`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-ink text-white rounded-lg text-xs hover:bg-ink/80 transition-all"
                >
                  <ExternalLink size={12} /> Open
                </a>
              </div>
            </div>

            {item.dm_draft ? (
              <div className="bg-white border border-mist rounded-xl px-4 py-3">
                <p className="text-xs font-mono text-ink/40 uppercase tracking-wider mb-2">DM Draft</p>
                <p className="text-sm text-ink/70 whitespace-pre-wrap">{item.dm_draft}</p>
              </div>
            ) : (
              <p className="text-xs text-ink/30 font-mono">No DM draft — approve and generate one from the Review Queue.</p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
