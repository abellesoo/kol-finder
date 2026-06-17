import { useState } from 'react'
import { Clock, Trash2, Heart, Eye, Search } from 'lucide-react'
import { loadHistory, deleteSession, loadLookupHistory, deleteLookup } from '../lib/sessionHistory'

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

export default function HistoryPage({ onLoadSeederSession, onLoadLookup }) {
  const [sessions, setSessions] = useState(() => loadHistory())
  const [lookups, setLookups] = useState(() => loadLookupHistory())

  const handleDeleteSession = (e, id) => {
    e.stopPropagation()
    deleteSession(id)
    setSessions((prev) => prev.filter((s) => s.id !== id))
  }

  const handleDeleteLookup = (e, id) => {
    e.stopPropagation()
    deleteLookup(id)
    setLookups((prev) => prev.filter((l) => l.id !== id))
  }

  return (
    <div className="min-h-screen px-6 py-10 max-w-3xl mx-auto">
      <div className="mb-10">
        <p className="font-mono text-xs tracking-widest text-ink/40 uppercase mb-2">History</p>
        <h1 className="text-2xl font-semibold text-ink">Past activity</h1>
      </div>

      {/* Seeder sessions */}
      <section className="mb-12">
        <div className="flex items-center gap-2 mb-4">
          <Clock size={13} className="text-ink/30" />
          <p className="font-mono text-xs tracking-widest text-ink/40 uppercase">Seeder sessions</p>
        </div>

        {sessions.length === 0 ? (
          <p className="text-sm text-ink/30 py-6 text-center border border-dashed border-mist rounded-xl">
            No seeder sessions yet
          </p>
        ) : (
          <div className="space-y-2">
            {sessions.map((session) => (
              <div
                key={session.id}
                onClick={() => onLoadSeederSession(session)}
                className="flex items-center justify-between px-4 py-3 border border-mist rounded-xl hover:border-accent/40 hover:bg-accent-dim/10 cursor-pointer transition-all group"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink group-hover:text-accent transition-colors">
                    {session.accountCount} accounts
                    {formatConfig(session.config) ? ` · ${formatConfig(session.config)}` : ''}
                  </p>
                  <p className="font-mono text-xs text-ink/40 mt-0.5">{formatDate(session.date)}</p>
                  {session.fileNames?.length > 0 && (
                    <p className="font-mono text-xs text-ink/25 truncate mt-0.5">
                      {session.fileNames.join(', ')}
                    </p>
                  )}
                </div>
                <button
                  onClick={(e) => handleDeleteSession(e, session.id)}
                  className="ml-3 flex-shrink-0 text-ink/20 hover:text-rose transition-colors"
                  title="Delete session"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="border-t border-mist mb-10" />

      {/* Profile lookups */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Search size={13} className="text-ink/30" />
          <p className="font-mono text-xs tracking-widest text-ink/40 uppercase">Profile lookups</p>
        </div>

        {lookups.length === 0 ? (
          <p className="text-sm text-ink/30 py-6 text-center border border-dashed border-mist rounded-xl">
            No profile lookups yet
          </p>
        ) : (
          <div className="space-y-2">
            {lookups.map((entry) => (
              <div
                key={entry.id}
                onClick={() => onLoadLookup(entry.username)}
                className="flex items-center justify-between px-4 py-3 border border-mist rounded-xl hover:border-accent/40 hover:bg-accent-dim/10 cursor-pointer transition-all group"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink group-hover:text-accent transition-colors">
                    @{entry.username}
                  </p>
                  <p className="font-mono text-xs text-ink/40 mt-0.5">{formatDate(entry.date)}</p>
                </div>
                <div className="flex items-center gap-4 mx-4 flex-shrink-0">
                  {entry.medianLikes != null && (
                    <div className="flex items-center gap-1.5">
                      <Heart size={11} className="text-rose/50" />
                      <span className="font-mono text-xs text-ink/60">
                        {entry.medianLikes.toLocaleString()}
                      </span>
                    </div>
                  )}
                  {entry.medianViews != null && (
                    <div className="flex items-center gap-1.5">
                      <Eye size={11} className="text-accent/50" />
                      <span className="font-mono text-xs text-ink/60">
                        {entry.medianViews.toLocaleString()}
                      </span>
                    </div>
                  )}
                  {entry.total != null && (
                    <span className="font-mono text-xs text-ink/25">{entry.total} posts</span>
                  )}
                </div>
                <button
                  onClick={(e) => handleDeleteLookup(e, entry.id)}
                  className="flex-shrink-0 text-ink/20 hover:text-rose transition-colors"
                  title="Delete"
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
