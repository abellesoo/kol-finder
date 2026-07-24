import { useState, useRef, useEffect } from 'react'
import { Check, ChevronDown, UserCircle2 } from 'lucide-react'

// Avatar tint pool, keyed by a stable hash of the user id so a person keeps the
// same colour everywhere (mirrors the Team page palette).
const AVATAR_COLORS = [
  'bg-[#D6CFC4] text-[#5C5340]',
  'bg-[#C8D6CF] text-[#3A5C4A]',
  'bg-[#D4C8D6] text-[#5C3A5C]',
  'bg-[#D6D0C4] text-[#5C5040]',
]
function colorFor(id) {
  let h = 0
  for (const ch of String(id || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return AVATAR_COLORS[h % AVATAR_COLORS.length]
}
export function initialsFor(email) {
  const name = String(email || '').split('@')[0]
  const parts = name.split(/[._-]/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase() || '?'
}
function shortName(email) {
  const local = String(email || '').split('@')[0]
  return local.charAt(0).toUpperCase() + local.slice(1)
}

// Compact avatar chip — used to *display* an assignee inline (no interaction).
export function AssigneeAvatar({ user, size = 22, title }) {
  if (!user) return null
  return (
    <span
      title={title || user.email}
      className={`inline-grid place-items-center rounded-full font-semibold flex-shrink-0 ${colorFor(user.id)}`}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {initialsFor(user.email)}
    </span>
  )
}

// Assign a campaign to someone from `users` (the assignable pool). `value` is the
// assigned user id or null. Renders a chip that opens a small menu.
export default function AssigneePicker({ users = [], value, onChange, disabled = false, align = 'right' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])

  const selected = users.find((u) => u.id === value) || null

  const pick = (id) => { setOpen(false); if (id !== value) onChange?.(id) }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }}
        title={selected ? `Assigned to ${selected.email}` : 'Unassigned — click to assign'}
        className={`flex items-center gap-1.5 pl-1 pr-1.5 py-1 rounded-full border text-[12px] transition-all disabled:opacity-50 ${
          selected
            ? 'border-card-edge bg-white text-body hover:border-ink/30'
            : 'border-dashed border-mist text-faint hover:text-ink hover:border-ink/30'
        }`}
      >
        {selected ? (
          <>
            <AssigneeAvatar user={selected} size={20} />
            <span className="max-w-[92px] truncate font-medium">{shortName(selected.email)}</span>
          </>
        ) : (
          <>
            <UserCircle2 size={18} className="text-faint" strokeWidth={1.5} />
            <span>Assign</span>
          </>
        )}
        <ChevronDown size={12} className="text-faint" />
      </button>

      {open && (
        <div
          onClick={(e) => e.stopPropagation()}
          className={`absolute z-50 mt-1.5 min-w-[190px] max-h-[260px] overflow-y-auto bg-white border border-card-edge rounded-[12px] shadow-lg py-1 ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          <button
            onClick={() => pick(null)}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-[12.5px] text-left hover:bg-surface transition-colors"
          >
            <span className="w-5 h-5 grid place-items-center rounded-full border border-dashed border-mist flex-shrink-0">
              <UserCircle2 size={13} className="text-faint" strokeWidth={1.5} />
            </span>
            <span className="flex-1 text-muted">Unassigned</span>
            {value == null && <Check size={13} className="text-sage" />}
          </button>
          {users.length === 0 ? (
            <p className="px-3 py-2 text-[11.5px] text-faint">No teammates yet — people appear here once they sign in</p>
          ) : (
            users.map((u) => (
              <button
                key={u.id}
                onClick={() => pick(u.id)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-[12.5px] text-left hover:bg-surface transition-colors"
              >
                <AssigneeAvatar user={u} size={20} />
                <span className="flex-1 min-w-0 truncate text-ink">{shortName(u.email)}</span>
                {u.id === value && <Check size={13} className="text-sage" />}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
