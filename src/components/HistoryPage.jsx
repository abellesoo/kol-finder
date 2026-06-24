import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { loadHistory, deleteSession } from '../lib/sessionHistory'

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
  const [sessions, setSessions] = useState(() => loadHistory())

  const handleDeleteSession = (e, id) => {
    e.stopPropagation()
    deleteSession(id)
    setSessions((prev) => prev.filter((s) => s.id !== id))
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

        {sessions.length === 0 ? (
          <p className="text-sm text-muted py-6 text-center border border-dashed border-mist rounded-[14px]">
            No seeder sessions yet
          </p>
        ) : (
          <div className="space-y-2">
            {sessions.map((session) => (
              <div
                key={session.id}
                onClick={() => onLoadSeederSession(session)}
                className="flex items-center justify-between px-[16px] py-[12px] border border-card-edge rounded-[12px] bg-white hover:border-accent/40 hover:bg-accent-dim/10 cursor-pointer transition-all group"
              >
                <div className="min-w-0">
                  <p className="text-[13.5px] font-medium text-ink group-hover:text-accent transition-colors">
                    {session.config?.sessionTitle || `${session.accountCount} accounts`}
                    {!session.config?.sessionTitle && formatConfig(session.config) ? ` · ${formatConfig(session.config)}` : ''}
                  </p>
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
                <button
                  onClick={(e) => handleDeleteSession(e, session.id)}
                  className="ml-3 flex-shrink-0 text-faint hover:text-rose transition-colors"
                  title="Delete session"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
