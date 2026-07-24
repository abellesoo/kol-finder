import { useState, useEffect, useRef, useMemo } from 'react'
import { Trash2, Loader2, Pencil, Check, X, Clock, ArrowRight, AlertTriangle, FolderOpen } from 'lucide-react'
import { loadHistory, loadSessionFull, deleteSession, updateSessionTitle, setSessionCampaign } from '../lib/sessionHistory'
import { listCampaigns, createCampaign } from '../lib/campaigns'
import CampaignMoveMenu from './core/CampaignMoveMenu'
import PageHeader from './core/PageHeader'
import Loading from './core/Loading'
import EmptyState from './core/EmptyState'
import Toast, { useAutoDismissToast } from './core/Toast'
import { formatDateTime, groupByCampaign } from '../lib/utils'
import { useFocusTrap } from '../hooks/useFocusTrap'

function formatConfig(config) {
  if (!config) return ''
  const parts = [config.locationTarget, config.niches?.slice(0, 2).join(', ')].filter(Boolean)
  return parts.join(' · ')
}

export default function HistoryPage({ onLoadSeederSession, onNavigate, onSessionDeleted }) {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [loadingId, setLoadingId] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [campaigns, setCampaigns] = useState([])
  const [toast, setToast] = useState(null)
  useAutoDismissToast(toast, setToast)
  const inputRef = useRef(null)
  const deleteDialogRef = useFocusTrap(!!deleteTarget)

  useEffect(() => {
    loadHistory()
      .then((data) => {
        setSessions(data)
        setLoadError(false)
        setLoading(false)
      })
      .catch((err) => {
        console.error('Failed to load history', err)
        setLoadError(true)
        setLoading(false)
      })
    listCampaigns().then(setCampaigns).catch((err) => console.error('Failed to load campaigns', err))
  }, [])

  const groups = useMemo(() => groupByCampaign(sessions, campaigns, (s) => s.campaignId), [sessions, campaigns])

  const moveSession = async (session, campaignId) => {
    await setSessionCampaign(session.id, campaignId)
    setSessions((prev) => prev.map((s) => (s.id === session.id ? { ...s, campaignId: campaignId || null } : s)))
  }

  const createCampaignInline = async (name) => {
    const c = await createCampaign({ name })
    setCampaigns((prev) => [c, ...prev])
    return c.id
  }

  useEffect(() => {
    if (editingId && inputRef.current) inputRef.current.focus()
  }, [editingId])

  useEffect(() => {
    if (!deleteTarget) return
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setDeleteTarget(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [deleteTarget])

  const startEdit = (e, session) => {
    e.stopPropagation()
    setEditingId(session.id)
    setEditingTitle(session.config?.sessionTitle || '')
  }

  const cancelEdit = (e) => {
    e?.stopPropagation()
    setEditingId(null)
    setEditingTitle('')
  }

  const commitEdit = async (e) => {
    e?.stopPropagation()
    const id = editingId
    if (id == null) return // input blur already committed — the Save click is a no-op
    const title = editingTitle.trim()
    setEditingId(null)
    setEditingTitle('')
    try {
      await updateSessionTitle(id, title)
      setSessions((prev) =>
        prev.map((s) =>
          s.id === id ? { ...s, config: { ...(s.config || {}), sessionTitle: title || undefined } } : s
        )
      )
    } catch (err) {
      console.error('Failed to update session title', err)
      setToast({ type: 'error', message: 'Failed to rename session. Please try again.' })
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') commitEdit(e)
    if (e.key === 'Escape') cancelEdit(e)
  }

  const requestDeleteSession = (e, session) => {
    e.stopPropagation()
    setDeleteTarget(session)
  }

  const confirmDeleteSession = async () => {
    if (!deleteTarget) return
    const id = deleteTarget.id
    setDeleting(true)
    try {
      await deleteSession(id)
      setSessions((prev) => prev.filter((s) => s.id !== id))
      onSessionDeleted?.(id)
      setDeleteTarget(null)
    } catch (err) {
      console.error('Failed to delete session', err)
      setToast({ type: 'error', message: 'Failed to delete session. Please try again.' })
    } finally {
      setDeleting(false)
    }
  }

  const handleClickSession = async (session) => {
    if (loadingId || editingId) return
    if (session.results?.length > 0) {
      onLoadSeederSession(session)
      return
    }
    setLoadingId(session.id)
    const full = await loadSessionFull(session.id)
    setLoadingId(null)
    if (full) onLoadSeederSession(full)
  }

  return (
    <div className="min-h-screen px-[48px] py-[40px] max-w-6xl mx-auto">
      <PageHeader
        className="mb-9"
        label="History"
        title="Past activity"
        count={!loading && !loadError && sessions.length ? sessions.length : null}
        subtitle="Every seeding session you’ve run, grouped by campaign. Open one to pick up where you left off."
      />

      <section>
        {loading ? (
          <Loading label="Loading sessions…" />
        ) : loadError ? (
          <EmptyState
            icon={X}
            title="Couldn’t load history"
            description="Something went wrong while loading your sessions. Check your connection and try again."
            action={
              <button
                onClick={() => window.location.reload()}
                className="flex items-center gap-2 px-4 py-2 bg-ink text-white rounded-[10px] text-[13px] hover:bg-ink/85 transition-all"
              >
                Retry
              </button>
            }
          />
        ) : sessions.length === 0 ? (
          <EmptyState
            icon={Clock}
            title="No sessions yet"
            description="Your seeding sessions will appear here after you run your first score."
            action={
              onNavigate && (
                <button
                  onClick={() => onNavigate('seeder')}
                  className="flex items-center gap-2 px-4 py-2 bg-ink text-white rounded-[10px] text-[13px] hover:bg-ink/85 transition-all"
                >
                  Go to Seeder <ArrowRight size={14} />
                </button>
              )
            }
          />
        ) : (
          <div className="space-y-8">
            {groups.map((grp) => (
              <div key={grp.id || 'unassigned'}>
                <div className="flex items-center gap-2 mb-3">
                  <FolderOpen size={14} className={grp.id ? 'text-sage' : 'text-faint'} />
                  <p className="text-[15px] font-serif font-bold text-ink">{grp.name}</p>
                  <span className="font-mono text-[10px] text-faint tabular-nums">{grp.items.length}</span>
                </div>
                <div className="space-y-2">
            {grp.items.map((session) => (
              <div
                key={session.id}
                onClick={() => handleClickSession(session)}
                className="flex items-center justify-between px-[16px] py-[12px] border border-card-edge rounded-[12px] bg-white hover:border-ink/30 hover:bg-surface cursor-pointer transition-all group"
              >
                <div className="min-w-0 flex-1">
                  {editingId === session.id ? (
                    <input
                      ref={inputRef}
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onKeyDown={handleKeyDown}
                      onBlur={commitEdit}
                      onClick={(e) => e.stopPropagation()}
                      placeholder="Session name…"
                      className="text-[13.5px] font-medium text-ink bg-transparent border-b border-ink/40 outline-none w-full max-w-xs"
                    />
                  ) : (
                    <p className="text-[13.5px] font-medium text-ink group-hover:text-ink/70 transition-colors">
                      {session.config?.sessionTitle || `${session.accountCount} accounts`}
                      {!session.config?.sessionTitle && formatConfig(session.config) ? ` · ${formatConfig(session.config)}` : ''}
                    </p>
                  )}
                  {session.config?.sessionTitle && (
                    <p className="text-[11.5px] text-muted mt-[1px]">{session.accountCount} accounts{formatConfig(session.config) ? ` · ${formatConfig(session.config)}` : ''}</p>
                  )}
                  <p className="font-mono text-[11px] text-faint mt-0.5">{formatDateTime(session.date)}</p>
                  {session.fileNames?.length > 0 && (
                    <p className="font-mono text-[10px] text-faint/60 truncate mt-0.5">
                      {session.fileNames.join(', ')}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 ml-3 flex-shrink-0">
                  {loadingId === session.id && <Loader2 size={13} className="animate-spin text-faint" />}
                  {editingId === session.id ? (
                    <>
                      <button
                        onClick={commitEdit}
                        className="text-sage hover:text-sage/70 transition-colors"
                        title="Save"
                      >
                        <Check size={14} />
                      </button>
                      <button
                        onMouseDown={(e) => { e.preventDefault(); cancelEdit(e) }}
                        className="text-faint hover:text-ink transition-colors"
                        title="Cancel"
                      >
                        <X size={14} />
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={(e) => startEdit(e, session)}
                      className="text-faint hover:text-ink transition-colors opacity-0 group-hover:opacity-100"
                      title="Rename"
                    >
                      <Pencil size={13} />
                    </button>
                  )}
                  <CampaignMoveMenu
                    campaigns={campaigns}
                    value={session.campaignId || null}
                    onMove={(cid) => moveSession(session, cid)}
                    onCreate={createCampaignInline}
                    label="Move to campaign"
                  />
                  <button
                    onClick={(e) => requestDeleteSession(e, session)}
                    className="text-faint hover:text-rose transition-colors"
                    title="Delete session"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-[2px] px-4"
          onClick={() => !deleting && setDeleteTarget(null)}
        >
          <div
            ref={deleteDialogRef}
            role="dialog"
            aria-modal="true"
            className="w-full max-w-[380px] bg-white rounded-[16px] shadow-xl p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-rose/10 mb-4">
              <AlertTriangle size={18} className="text-rose" />
            </div>
            <h2 className="text-[16px] font-semibold text-ink mb-1.5">Delete this session?</h2>
            <p className="text-[13px] text-muted mb-6 leading-relaxed">
              {`"${deleteTarget.config?.sessionTitle || `${deleteTarget.accountCount} accounts`}"`} will be permanently
              deleted for the whole team. This cannot be undone.
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
                onClick={confirmDeleteSession}
                disabled={deleting}
                className="flex items-center gap-2 px-4 py-2 rounded-[10px] bg-rose text-white text-[13px] font-medium hover:bg-rose/90 transition-colors disabled:opacity-60"
              >
                {deleting && <Loader2 size={13} className="animate-spin" />}
                Delete permanently
              </button>
            </div>
          </div>
        </div>
      )}
      <Toast toast={toast} onClose={() => setToast(null)} />
    </div>
  )
}
