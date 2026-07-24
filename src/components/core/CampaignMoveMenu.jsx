import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { FolderInput, Check, Loader2, Plus, X } from 'lucide-react'

// A compact "Move to campaign" dropdown, reused by the Seeder sessions list, the
// Review Queue, and Ready to Send. Lists every campaign plus "No campaign" to
// un-group. `value` is the current campaign id (or null); `onMove(id)` performs
// the move and should resolve once persisted. Stops click propagation so it can
// live inside a clickable card.
//
// The menu is portaled to <body> with fixed positioning anchored to the trigger
// (mirroring AssigneePicker) so a card's overflow-hidden / rounded clip or a
// modal's stacking context can never hide or truncate it.
export default function CampaignMoveMenu({ campaigns = [], value = null, onMove, onCreate, label = 'Move to campaign' }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [creating, setCreating] = useState(false) // inline "new campaign" input, not a native prompt
  const [newName, setNewName] = useState('')
  const [error, setError] = useState(null)
  const [coords, setCoords] = useState(null)
  const btnRef = useRef(null)
  const menuRef = useRef(null)

  // Reset transient menu state whenever it closes.
  useEffect(() => {
    if (!open) { setCreating(false); setNewName(''); setError(null) }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => {
      if (btnRef.current?.contains(e.target) || menuRef.current?.contains(e.target)) return
      setOpen(false)
    }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Anchor the fixed menu to the trigger rect; re-place on scroll/resize. Flips
  // above when there isn't room below.
  useLayoutEffect(() => {
    if (!open) { setCoords(null); return }
    const place = () => {
      const r = btnRef.current?.getBoundingClientRect()
      if (!r) return
      const below = window.innerHeight - r.bottom
      const up = below < 300 && r.top > below
      setCoords({
        right: Math.round(window.innerWidth - r.right),
        top: up ? null : Math.round(r.bottom + 6),
        bottom: up ? Math.round(window.innerHeight - r.top + 6) : null,
      })
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => { window.removeEventListener('scroll', place, true); window.removeEventListener('resize', place) }
  }, [open])

  const pick = async (id) => {
    if (busy || id === (value || null)) { setOpen(false); return }
    setBusy(true)
    setError(null)
    try {
      await onMove(id)
      setOpen(false)
    } catch (err) {
      console.error('Move to campaign failed', err)
      setError(err?.message || 'Failed to move — please try again.')
    } finally {
      setBusy(false)
    }
  }

  const createAndMove = async () => {
    const name = newName.trim()
    if (!name) return
    setBusy(true)
    setError(null)
    try {
      const id = await onCreate(name)   // creates the campaign, returns its id
      if (id) await onMove(id)          // then files this item into it
      setOpen(false)
    } catch (err) {
      console.error('Create campaign failed', err)
      setError(err?.message || 'Failed to create campaign — please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        ref={btnRef}
        onClick={() => setOpen((o) => !o)}
        title={label}
        className="flex items-center justify-center w-9 h-9 rounded-[10px] border border-card-edge text-faint hover:text-ink hover:border-ink/30 transition-all"
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <FolderInput size={14} />}
      </button>
      {open && coords && createPortal(
        <div
          ref={menuRef}
          onClick={(e) => e.stopPropagation()}
          style={{ position: 'fixed', top: coords.top ?? undefined, bottom: coords.bottom ?? undefined, right: coords.right, zIndex: 1000 }}
          className="w-56 max-h-72 overflow-auto bg-white border border-card-edge rounded-[12px] shadow-xl py-1"
        >
          <p className="px-3 py-1.5 font-mono text-[9px] tracking-[.14em] uppercase text-faint">{label}</p>
          {error && (
            <p className="mx-2 mb-1 px-2 py-1.5 rounded-[8px] bg-rose/10 text-rose text-[11.5px] leading-snug">{error}</p>
          )}
          <button
            onClick={() => pick(null)}
            className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-[13px] text-muted hover:bg-surface transition-colors"
          >
            No campaign
            {(value || null) === null && <Check size={13} className="text-sage" />}
          </button>
          {campaigns.length > 0 && <div className="my-1 border-t border-mist/70" />}
          {campaigns.map((c) => (
            <button
              key={c.id}
              onClick={() => pick(c.id)}
              className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left text-[13px] text-ink hover:bg-surface transition-colors"
            >
              <span className="truncate">{c.name}</span>
              {value === c.id && <Check size={13} className="text-sage flex-shrink-0" />}
            </button>
          ))}
          {onCreate && (
            <>
              <div className="my-1 border-t border-mist/70" />
              {creating ? (
                <div className="px-2 py-1.5 flex items-center gap-1.5">
                  <input
                    autoFocus
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') createAndMove()
                      if (e.key === 'Escape') { e.stopPropagation(); setCreating(false); setNewName('') }
                    }}
                    placeholder="New campaign name"
                    disabled={busy}
                    className="flex-1 min-w-0 px-2 py-1.5 rounded-[8px] border border-card-edge text-[12.5px] focus:outline-none focus:border-ink/40"
                  />
                  <button
                    onClick={createAndMove}
                    disabled={busy || !newName.trim()}
                    title="Create and move here"
                    className="flex items-center justify-center w-7 h-7 rounded-[8px] bg-ink text-white disabled:opacity-40 flex-shrink-0"
                  >
                    {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                  </button>
                  <button
                    onClick={() => { setCreating(false); setNewName('') }}
                    title="Cancel"
                    className="flex items-center justify-center w-7 h-7 rounded-[8px] text-faint hover:text-ink flex-shrink-0"
                  >
                    <X size={12} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => { setCreating(true); setError(null) }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left text-[13px] text-sage hover:bg-surface transition-colors"
                >
                  <Plus size={13} /> New campaign…
                </button>
              )}
            </>
          )}
        </div>,
        document.body
      )}
    </div>
  )
}
