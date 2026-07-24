import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
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

// A row of overlapping assignee avatars — used to *display* one or more owners
// inline (no interaction). Shows up to `max`, then a "+N" chip.
export function AssigneeAvatarStack({ users = [], size = 20, max = 3 }) {
  const shown = users.slice(0, max)
  const extra = users.length - shown.length
  return (
    <span className="flex -space-x-1.5 items-center">
      {shown.map((u) => (
        <span key={u.id} className="rounded-full ring-1 ring-white">
          <AssigneeAvatar user={u} size={size} />
        </span>
      ))}
      {extra > 0 && (
        <span
          className="inline-grid place-items-center rounded-full ring-1 ring-white bg-[#E4DECF] text-[#5C5340] font-semibold"
          style={{ width: size, height: size, fontSize: size * 0.4 }}
        >
          +{extra}
        </span>
      )}
    </span>
  )
}

// Assign a campaign to zero or more people from `users` (the assignable pool).
// `value` is an array of assigned user ids (tolerates a legacy scalar / null).
// `onChange` receives the next array of ids. The menu stays open so several
// people can be toggled in one go; "Unassigned" clears all and closes.
export default function AssigneePicker({ users = [], value, onChange, disabled = false, align = 'right' }) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState(null)
  const btnRef = useRef(null)
  const menuRef = useRef(null)

  // Click-outside / Escape. The menu is portaled to <body>, so it's outside
  // btnRef — check both the trigger and the menu before closing.
  useEffect(() => {
    if (!open) return
    const onDoc = (e) => {
      if (btnRef.current?.contains(e.target) || menuRef.current?.contains(e.target)) return
      setOpen(false)
    }
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])

  // Anchor the fixed-position menu to the trigger's rect. Recomputed on open and
  // on scroll/resize so it tracks the button. Flips above when there's no room
  // below. Rendered in a portal so no card's stacking context can cover it.
  useLayoutEffect(() => {
    if (!open) { setCoords(null); return }
    const place = () => {
      const r = btnRef.current?.getBoundingClientRect()
      if (!r) return
      const below = window.innerHeight - r.bottom
      const up = below < 280 && r.top > below
      setCoords({
        left: align === 'right' ? null : Math.round(r.left),
        right: align === 'right' ? Math.round(window.innerWidth - r.right) : null,
        top: up ? null : Math.round(r.bottom + 6),
        bottom: up ? Math.round(window.innerHeight - r.top + 6) : null,
      })
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => { window.removeEventListener('scroll', place, true); window.removeEventListener('resize', place) }
  }, [open, align])

  const ids = Array.isArray(value) ? value : value ? [value] : []
  const idSet = new Set(ids)
  const selected = users.filter((u) => idSet.has(u.id))

  const toggle = (id) => {
    const next = idSet.has(id) ? ids.filter((x) => x !== id) : [...ids, id]
    onChange?.(next)
  }
  const clearAll = () => { setOpen(false); if (ids.length) onChange?.([]) }

  return (
    <div className="relative">
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }}
        title={selected.length ? `Assigned to ${selected.map((s) => s.email).join(', ')}` : 'Unassigned — click to assign'}
        className={`flex items-center gap-1.5 pl-1 pr-1.5 py-1 rounded-full border text-[12px] transition-all disabled:opacity-50 ${
          selected.length
            ? 'border-card-edge bg-white text-body hover:border-ink/30'
            : 'border-dashed border-mist text-faint hover:text-ink hover:border-ink/30'
        }`}
      >
        {selected.length === 0 ? (
          <>
            <UserCircle2 size={18} className="text-faint" strokeWidth={1.5} />
            <span>Assign</span>
          </>
        ) : selected.length === 1 ? (
          <>
            <AssigneeAvatar user={selected[0]} size={20} />
            <span className="max-w-[92px] truncate font-medium">{shortName(selected[0].email)}</span>
          </>
        ) : (
          <>
            <AssigneeAvatarStack users={selected} size={20} />
            <span className="font-medium">{selected.length} people</span>
          </>
        )}
        <ChevronDown size={12} className="text-faint" />
      </button>

      {open && coords && createPortal(
        <div
          ref={menuRef}
          onClick={(e) => e.stopPropagation()}
          style={{ position: 'fixed', top: coords.top ?? undefined, bottom: coords.bottom ?? undefined, left: coords.left ?? undefined, right: coords.right ?? undefined, zIndex: 1000 }}
          className="min-w-[190px] max-h-[260px] overflow-y-auto bg-white border border-card-edge rounded-[12px] shadow-lg py-1"
        >
          <button
            onClick={clearAll}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-[12.5px] text-left hover:bg-surface transition-colors"
          >
            <span className="w-5 h-5 grid place-items-center rounded-full border border-dashed border-mist flex-shrink-0">
              <UserCircle2 size={13} className="text-faint" strokeWidth={1.5} />
            </span>
            <span className="flex-1 text-muted">Unassigned</span>
            {ids.length === 0 && <Check size={13} className="text-sage" />}
          </button>
          {users.length === 0 ? (
            <p className="px-3 py-2 text-[11.5px] text-faint">No teammates yet — people appear here once they sign in</p>
          ) : (
            users.map((u) => (
              <button
                key={u.id}
                onClick={() => toggle(u.id)}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-[12.5px] text-left hover:bg-surface transition-colors"
              >
                <AssigneeAvatar user={u} size={20} />
                <span className="flex-1 min-w-0 truncate text-ink">{shortName(u.email)}</span>
                {idSet.has(u.id) && <Check size={13} className="text-sage" />}
              </button>
            ))
          )}
        </div>,
        document.body
      )}
    </div>
  )
}
