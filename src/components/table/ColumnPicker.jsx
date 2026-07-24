import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { Columns } from 'lucide-react'
import { TABLE_COLUMNS } from '../../lib/columnDefs'

// Shared show/export column picker. Was copy-pasted in ResultsStep, ReviewPage
// and ReadyToSendPage; consolidated here. `label` differs per surface
// ("Columns" for visible tables, "Export columns" for the cards-only page).
//
// The panel is portaled to <body> with fixed positioning anchored to the
// trigger, so a table toolbar's overflow-hidden/auto can't clip it and it always
// sits above modal overlays.
export default function ColumnPicker({ selected, onChange, label = 'Columns' }) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState(null)
  const btnRef = useRef(null)
  const menuRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => {
      if (btnRef.current?.contains(e.target) || menuRef.current?.contains(e.target)) return
      setOpen(false)
    }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])

  useLayoutEffect(() => {
    if (!open) { setCoords(null); return }
    const place = () => {
      const r = btnRef.current?.getBoundingClientRect()
      if (!r) return
      const below = window.innerHeight - r.bottom
      const up = below < 320 && r.top > below
      setCoords({
        right: Math.round(window.innerWidth - r.right),
        top: up ? null : Math.round(r.bottom + 8),
        bottom: up ? Math.round(window.innerHeight - r.top + 8) : null,
      })
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => { window.removeEventListener('scroll', place, true); window.removeEventListener('resize', place) }
  }, [open])

  const toggle = (id) => {
    if (selected.includes(id)) {
      onChange(selected.filter((c) => c !== id))
    } else {
      const order = TABLE_COLUMNS.map((c) => c.id)
      onChange([...selected, id].sort((a, b) => order.indexOf(a) - order.indexOf(b)))
    }
  }

  return (
    <div className="relative">
      <button
        ref={btnRef}
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-4 py-2 border border-[#E1DBCD] rounded-[10px] text-[13px] text-body hover:border-ink/30 hover:text-ink transition-all bg-white"
      >
        <Columns size={14} />
        {label}
        {selected.length < TABLE_COLUMNS.length && (
          <span className="font-mono text-[10px] bg-ink text-white rounded-full px-1.5 py-0.5 leading-none">
            {selected.length}
          </span>
        )}
      </button>
      {open && coords && createPortal(
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: coords.top ?? undefined, bottom: coords.bottom ?? undefined, right: coords.right, zIndex: 1000 }}
          className="w-56 max-h-[70vh] overflow-auto bg-white border border-card-edge rounded-[12px] shadow-lg p-3"
        >
          <p className="text-[10px] font-mono text-faint uppercase tracking-[.14em] mb-2">Show / export columns</p>
          <div className="space-y-1">
            {TABLE_COLUMNS.map((col) => (
              <label key={col.id} className="flex items-center gap-2 px-2 py-1.5 rounded-[6px] hover:bg-surface cursor-pointer">
                <input type="checkbox" checked={selected.includes(col.id)} onChange={() => toggle(col.id)} className="accent-ink w-[15px] h-[15px] rounded" />
                <span className="font-mono text-[11px] text-body">{col.label}</span>
              </label>
            ))}
          </div>
          <div className="flex gap-2 mt-3 pt-2 border-t border-mist">
            <button onClick={() => onChange(TABLE_COLUMNS.map((c) => c.id))} className="text-[11px] text-faint hover:text-ink transition-colors">Select all</button>
            <button onClick={() => onChange([])} className="text-[11px] text-faint hover:text-ink transition-colors ml-auto">Clear</button>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
