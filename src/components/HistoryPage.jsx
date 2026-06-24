import { useState, useEffect, useRef } from 'react'
import { Trash2, Loader2, Pencil, Check, X } from 'lucide-react'
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

export default function HistoryPage({ onLoadSeederSession }) {
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingId, setLoadingId] = useState(null)
  const [editingId, setEditingId] = useState(null)
  const [editingTitle, setEditingTitle] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    loadHistory().then((data) => {
      setSessions(data)
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    if (editingId && inputRef.current) inputRef.current.focus()
  }, [editingId])

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
    await updateSessionTitle(id, title)
    setSessions((prev) =>
      prev.map((s) =>
        s.id === id ? { ...s, config: { ...(s.config || {}), sessionTitle: title || undefined } } : s
      )
    )
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') commitEdit(e)
    if (e.key === 'Escape') cancelEdit(e)
  }

  const handleDeleteSession = async (e, id) => {
    e.stopPropagation()
    await deleteSession(id)
    setSessions((prev) => prev.filter((s) => s.id !== id))
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
        <h1 className="text-[27px] font-bold tracking-[-0.02em] text-ink">Past activity</h1>
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
        ) : sessions.length === 0 ? (
          <p className="text-sm text-muted py-6 text-center border border-dashed border-mist rounded-[14px]">
            No seeder sessions yet
          </p>
        ) : (
          <div className="space-y-2">
            {sessions.map((session) => (
              <div
                key={session.id}
                onClick={() => handleClickSession(session)}
                className="flex items-center justify-between px-[16px] py-[12px] border border-card-edge rounded-[12px] bg-white hover:border-accent/40 hover:bg-accent-dim/10 cursor-pointer transition-all group"
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
                      className="text-[13.5px] font-medium text-ink bg-transparent border-b border-accent outline-none w-full max-w-xs"
                    />
                  ) : (
                    <p className="text-[13.5px] font-medium text-ink group-hover:text-accent transition-colors">
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
                  {loadingId === session.id && <Loader2 size={13} className="animate-spin text-accent/50" />}
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
                    onClick={(e) => handleDeleteSession(e, session.id)}
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
    </div>
  )
}
