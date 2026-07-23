import { useState, useRef, useEffect } from 'react'
import { FolderInput, Check, Loader2, Plus } from 'lucide-react'

// A compact "Move to campaign" dropdown, reused by the Seeder sessions list, the
// Review Queue, and Ready to Send. Lists every campaign plus "No campaign" to
// un-group. `value` is the current campaign id (or null); `onMove(id)` performs
// the move and should resolve once persisted. Stops click propagation so it can
// live inside a clickable card.
export default function CampaignMoveMenu({ campaigns = [], value = null, onMove, onCreate, label = 'Move to campaign' }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const pick = async (id) => {
    if (busy || id === (value || null)) { setOpen(false); return }
    setBusy(true)
    try {
      await onMove(id)
      setOpen(false)
    } catch (err) {
      console.error('Move to campaign failed', err)
      window.alert(err?.message || 'Failed to move — please try again.')
    } finally {
      setBusy(false)
    }
  }

  const createAndMove = async () => {
    const name = window.prompt('New campaign name')?.trim()
    if (!name) return
    setBusy(true)
    try {
      const id = await onCreate(name)   // creates the campaign, returns its id
      if (id) await onMove(id)          // then files this item into it
      setOpen(false)
    } catch (err) {
      console.error('Create campaign failed', err)
      window.alert(err?.message || 'Failed to create campaign — please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="relative" ref={ref} onClick={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen((o) => !o)}
        title={label}
        className="flex items-center justify-center w-9 h-9 rounded-[10px] border border-card-edge text-faint hover:text-ink hover:border-ink/30 transition-all"
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <FolderInput size={14} />}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-1 w-56 max-h-72 overflow-auto bg-white border border-card-edge rounded-[12px] shadow-xl py-1">
          <p className="px-3 py-1.5 font-mono text-[9px] tracking-[.14em] uppercase text-faint">{label}</p>
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
              <button
                onClick={createAndMove}
                className="w-full flex items-center gap-2 px-3 py-2 text-left text-[13px] text-sage hover:bg-surface transition-colors"
              >
                <Plus size={13} /> New campaign…
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}
