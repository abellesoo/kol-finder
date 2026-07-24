import { useState, useRef, useEffect } from 'react'
import { Columns } from 'lucide-react'
import { TABLE_COLUMNS } from '../../lib/columnDefs'

// Shared show/export column picker. Was copy-pasted in ResultsStep, ReviewPage
// and ReadyToSendPage; consolidated here. `label` differs per surface
// ("Columns" for visible tables, "Export columns" for the cards-only page).
export default function ColumnPicker({ selected, onChange, label = 'Columns' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
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
    <div className="relative" ref={ref}>
      <button
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
      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 bg-white border border-card-edge rounded-[12px] shadow-lg z-50 p-3">
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
        </div>
      )}
    </div>
  )
}
