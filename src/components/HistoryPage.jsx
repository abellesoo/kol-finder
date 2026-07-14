import { useState, useEffect, useRef } from 'react'
import { Trash2, Loader2, Pencil, Check, X, Clock, ArrowRight, AlertTriangle } from 'lucide-react'
import { loadHistory, loadSessionFull, deleteSession, updateSessionTitle } from '../lib/sessionHistory'

function formatDate(iso) {
  const d = new Date(iso)
  return (
    d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) +
    ' · ' +
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  )
}

function formatConfig(config) {
  if (!config) return ''
  const parts = [config.locationTarget, config.niches?.slice(0, 2).join(', ')].filter(Boolean)
  return parts.join(' · ')
}

export default function HistoryPage({ onLoadSeederSession, onNavigate }) {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [loadingId, setLoadingId] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [editingTitle, setEditingTitle] = useState('')
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const inputRef = useRef(null)

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
  }, [])

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
      window.alert('Failed to rename session. Please try again.')
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
      setDeleteTarget(null)
    } catch (err) {
      console.error('Failed to delete session', err)
      window.alert('Failed to delete session. Please try again.')
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
    <div className="min-h-screen px-[48px] py-[40px] max-w-3xl mx-auto">
      <div className="mb-10">
        <p className="font-mono text-[10px] tracking-[.18em] text-faint uppercase mb-[8px]">History</p>
        <h1 className="text-[34px] font-serif font-bold tracking-[0.02em] text-ink">Past activity</h1>
      </div>

      <section>
        <div className="flex items-center gap-2 mb-4">
          <p className="font-mono text-[9.5px] tracking-[.13em] text-faint uppercase">Seeder sessions</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10 gap-2 text-faint">
            <Loader2 size={14} className="animate-spin" />
            <span className="text-sm">Loading…</span>
          </div>
        ) : loadError ? (
          <div className="flex flex-col items-center py-16">
            <X size={32} className="text-rose mb-4" />
            <h2 className="text-[17px] font-semibold text-ink mb-2">Couldn’t load history</h2>
            <p className="text-[13.5px] text-muted mb-6 text-center">Something went wrong while loading your sessions. Check your connection and try again.</p>
            <button
              onClick={() => window.location.reload()}
              className="flex items-center gap-2 px-4 py-2 bg-ink text-white rounded-[10px] text-[13px] hover:bg-ink/80 transition-all"
            >
              Retry
            </button>
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex flex-col items-center py-16">
            <Clock size={32} className="text-faint mb-4" />
            <h2 className="text-[17px] font-semibold text-ink mb-2">No sessions recorded</h2>
            <p className="text-[13.5px] text-muted mb-6 text-center">Your past seeding sessions will appear here after you run your first score</p>
            {onNavigate && (
              <button
                onClick={() => onNavigate('seeder')}
                className="flex items-center gap-2 px-4 py-2 bg-ink text-white rounded-[10px] text-[13px] hover:bg-ink/80 transition-all"
              >
                Go to Seeder <ArrowRight size={14} />
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {sessions.map((session) => (
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
                  <p className="font-mono text-[11px] text-faint mt-0.5">{formatDate(session.date)}</p>
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
                        onClick={cancelEdit}
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
        )}
      </section>

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
    </div>
  )
}
