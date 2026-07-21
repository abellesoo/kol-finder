import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { ChevronUp, ChevronDown, Filter } from 'lucide-react'

// One header cell for a KOL table. Numeric columns render a sort toggle
// (desc → asc → off); category columns render a filter dropdown over the
// distinct values present in the data. `infoSlot` lets a table pass its own
// info tooltip (e.g. the scoring explainers in ResultsStep). Shared by every
// KOL table so the header behaves identically everywhere.
export default function ColumnHeaderCell({
  col,
  sortId,
  sortDir,
  onToggleSort,
  distinctValues = [],
  activeFilter = [],
  onFilterChange,
  infoSlot = null,
  align = 'center',
}) {
  const justify = align === 'left' ? 'justify-start' : 'justify-center'

  if (col.type === 'number' && onToggleSort) {
    const active = sortId === col.id
    return (
      <button
        onClick={() => onToggleSort(col.id)}
        className={`flex items-center ${justify} gap-1 hover:text-ink transition-colors w-full`}
      >
        {col.label}
        {active ? (
          sortDir === 'desc' ? <ChevronDown size={12} /> : <ChevronUp size={12} />
        ) : (
          <ChevronUp size={12} className="opacity-20" />
        )}
        {infoSlot}
      </button>
    )
  }

  if (col.type === 'category' && onFilterChange) {
    return (
      <span className={`flex items-center ${justify} gap-1`}>
        {col.label}
        <FilterDropdown
          colId={col.id}
          label={col.label}
          options={distinctValues}
          selected={activeFilter}
          onChange={onFilterChange}
        />
        {infoSlot}
      </span>
    )
  }

  return (
    <span className={`flex items-center ${justify} gap-1`}>
      {col.label}
      {infoSlot}
    </span>
  )
}

function FilterDropdown({ colId, label, options, selected, onChange }) {
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState(null)
  const btnRef = useRef(null)
  const panelRef = useRef(null)
  const active = selected.length > 0

  // Fixed positioning (like the info tooltips) so the panel isn't clipped by the
  // table's overflow-auto / sticky header.
  useLayoutEffect(() => {
    if (!open) return
    const r = btnRef.current?.getBoundingClientRect()
    if (r) setPos({ top: r.bottom + 6, left: Math.max(8, r.left + r.width / 2) })
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (panelRef.current?.contains(e.target) || btnRef.current?.contains(e.target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const toggle = (val) => {
    onChange(colId, selected.includes(val) ? selected.filter((v) => v !== val) : [...selected, val])
  }

  return (
    <span className="inline-flex items-center" onClick={(e) => e.stopPropagation()}>
      <button
        ref={btnRef}
        onClick={() => setOpen((o) => !o)}
        className={`transition-colors ${active ? 'text-accent' : 'text-ink/30 hover:text-ink'}`}
        title={active ? `Filtered: ${selected.join(', ')}` : `Filter by ${label}`}
      >
        <Filter size={11} className={active ? 'fill-accent/20' : ''} />
      </button>
      {open && pos && (
        <div
          ref={panelRef}
          className="fixed w-52 max-h-72 overflow-auto bg-white border border-card-edge rounded-[10px] shadow-xl z-50 p-2 -translate-x-1/2 text-left normal-case tracking-normal"
          style={{ top: pos.top, left: pos.left }}
        >
          <p className="text-[9px] font-mono text-faint uppercase tracking-[.14em] px-1.5 pb-1.5">Filter · {label}</p>
          {options.length === 0 ? (
            <p className="px-1.5 py-1 text-[11px] text-faint">No values</p>
          ) : (
            options.map((val) => (
              <label key={val} className="flex items-center gap-2 px-1.5 py-1 rounded-[6px] hover:bg-surface cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.includes(val)}
                  onChange={() => toggle(val)}
                  className="accent-ink w-[14px] h-[14px] rounded flex-shrink-0"
                />
                <span className="text-[11.5px] text-body truncate" title={val}>{val}</span>
              </label>
            ))
          )}
          {active && (
            <button
              onClick={() => onChange(colId, [])}
              className="mt-1 pt-1.5 border-t border-mist w-full text-left px-1.5 text-[10.5px] text-faint hover:text-ink"
            >
              Clear filter
            </button>
          )}
        </div>
      )}
    </span>
  )
}
