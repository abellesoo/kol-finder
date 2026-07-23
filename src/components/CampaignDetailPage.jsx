import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Loader2, ArrowLeft, ExternalLink, UserPlus, X, RefreshCw, Trash2,
  Truck, CalendarClock, Search, ScanLine, CheckCircle2, Circle, Copy, Check,
  MessageSquarePlus, Info, LayoutList, Table2, ChevronDown, FileSpreadsheet,
  MapPin, Plus, ChevronRight, Pencil, Sparkles,
} from 'lucide-react'
import {
  getCampaign, getCampaignKols, getApprovedKols, attachKols,
  updateKolState, setDeadlineOverride, setTrackingNumber, sfTrackingUrl, setKolShipping, detachKol,
  effectiveDeadline, KOL_STATES,
  getVerifiedPostsByKol, getNudgesByKol, setHumanVerified,
  saveNudge, markNudgeSent,
  tierLabel, CONTENT_FORMATS, FORMAT_BADGE_CLS, isAutoVerifiable, setKolFormats,
  getScoringByHandle, buildCampaignSheetValues, updateCampaignSetup,
  getBrandById, updateBrandFacts,
} from '../lib/campaigns'
import { listSessionsForCampaign } from '../lib/sessionHistory'
import { BRAND_CATALOG } from '../lib/brandCatalog'
import { assembleBrief, briefToFields } from '../lib/brief'
import { runVerification, draftNudge, syncCampaignSheet, parseBrief } from '../lib/apifyApi'
import { exportSfBulkXlsx, getSfSender, saveSfSender, sfSenderComplete } from '../lib/sfBulk'
import { useTableControls } from '../lib/useTableControls'
import { useUrlParam } from '../lib/useUrlParam'
import ColumnHeaderCell from './table/ColumnHeaderCell'

const RESULT_LIMITS = [100, 200, 500, 1000]
// Match a campaign's brand name to a BRAND_CATALOG entry (casing/punctuation).
const normBrand = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')

function formatDate(isoStr) {
  if (!isoStr) return '—'
  return new Date(isoStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
function todayStr() { return new Date().toISOString().slice(0, 10) }

const STATE_META = {
  approved:      { label: 'Approved',      cls: 'bg-ink/10 text-ink/60' },
  shipped:       { label: 'Shipped',       cls: 'bg-blue-100 text-blue-700' },
  awaiting_post: { label: 'Awaiting post', cls: 'bg-accent/25 text-[#8A6A22]' },
  posted:        { label: 'Posted',        cls: 'bg-green-100 text-green-700' },
  overdue:       { label: 'Overdue',       cls: 'bg-rose/10 text-rose' },
  opted_out:     { label: 'Opted out',     cls: 'bg-ink/5 text-faint' },
}
const ACTION_LABEL = {
  shipped: 'Mark shipped',
  awaiting_post: 'Mark awaiting',
  posted: 'Mark posted',
  overdue: 'Mark overdue',
  opted_out: 'Opt out',
  approved: 'Reopen',
}
const BOARD_ORDER = ['approved', 'shipped', 'awaiting_post', 'overdue', 'posted', 'opted_out']

// Sort/filter config for the spreadsheet view. Ops columns don't map to the KOL
// scoring accessors, so KolTable feeds these to the shared useTableControls.
const FORMAT_LABEL = (id) => CONTENT_FORMATS.find((f) => f.id === id)?.label || id
const CAMPAIGN_COLS = [
  { id: 'tier',     label: 'Tier',     type: 'category' },
  { id: 'format',   label: 'Format',   type: 'category' },
  { id: 'status',   label: 'Status',   type: 'category' },
  { id: 'shipped',  label: 'Shipped',  type: 'number' },
  { id: 'tracking', label: 'Tracking', type: 'text' },
  { id: 'deadline', label: 'Deadline', type: 'number' },
  { id: 'post',     label: 'Post',     type: 'text' },
]
const CAMPAIGN_ACCESSORS = {
  tier:     { filterValues: (k) => [tierLabel(k.tier)] },
  format:   { filterValues: (k) => (k.content_formats || []).map(FORMAT_LABEL) },
  status:   { filterValues: (k) => [STATE_META[k.state]?.label || k.state] },
  shipped:  { sortValue: (k) => (k.shipped_at ? Date.parse(k.shipped_at) : null) },
  deadline: { sortValue: (k) => (k.deadline_override ? Date.parse(k.deadline_override) : null) },
}

function AttachModal({ campaignId, existingHandles, onClose, onAttached }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [approved, setApproved] = useState([])
  const [selected, setSelected] = useState(() => new Set())
  const [query, setQuery] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !saving) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, saving])

  useEffect(() => {
    (async () => {
      try {
        setApproved(await getApprovedKols())
      } catch (e) {
        setError(e.message)
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  const have = useMemo(() => new Set(existingHandles), [existingHandles])
  const available = useMemo(
    () => approved.filter((k) => !have.has(k.handle)),
    [approved, have]
  )
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return available
    return available.filter((k) =>
      k.handle.includes(q) || (k.fullName || '').toLowerCase().includes(q))
  }, [available, query])

  const toggle = (handle) => setSelected((prev) => {
    const next = new Set(prev)
    next.has(handle) ? next.delete(handle) : next.add(handle)
    return next
  })

  const attach = async () => {
    setSaving(true)
    setError(null)
    try {
      const picks = available.filter((k) => selected.has(k.handle))
      const n = await attachKols(campaignId, picks, existingHandles)
      onAttached(n)
    } catch (e) {
      setError(e.message)
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-[2px] px-4"
      onClick={() => !saving && onClose()}>
      <div className="w-full max-w-[540px] max-h-[86vh] flex flex-col bg-white rounded-[16px] shadow-xl"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between p-6 pb-4">
          <div>
            <p className="font-mono text-[10px] tracking-[.16em] text-faint uppercase mb-1">Attach KOLs</p>
            <h2 className="text-[18px] font-semibold text-ink">Approved from the Review Queue</h2>
          </div>
          <button onClick={() => !saving && onClose()} className="text-faint hover:text-ink transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="px-6">
          <div className="flex items-center gap-2 px-3 py-2 border border-mist rounded-[10px] bg-white mb-3">
            <Search size={14} className="text-faint" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter by handle or name"
              className="flex-1 text-[13px] text-ink bg-transparent focus:outline-none" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 min-h-[160px]">
          {loading ? (
            <div className="flex items-center justify-center py-16"><Loader2 size={20} className="animate-spin text-faint" /></div>
          ) : error ? (
            <div className="px-3 py-2 bg-rose/5 border border-rose/20 rounded-[10px] text-[12px] text-rose">{error}</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-[13px] text-muted">
                {available.length === 0
                  ? 'No approved KOLs left to attach — approve some in the Review Queue first.'
                  : 'No matches for that filter.'}
              </p>
            </div>
          ) : (
            <div className="space-y-1.5 pb-2">
              {filtered.map((k) => (
                <label key={k.handle}
                  className="flex items-center gap-3 px-3 py-2 rounded-[10px] border border-transparent hover:bg-surface cursor-pointer">
                  <input type="checkbox" checked={selected.has(k.handle)} onChange={() => toggle(k.handle)}
                    className="accent-ink w-[15px] h-[15px] rounded flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-ink truncate">@{k.handle}</p>
                    {k.fullName && <p className="text-[11px] text-faint truncate">{k.fullName}</p>}
                  </div>
                  {k.aiScore != null && (
                    <span title={k.aiReason || ''}
                      className="flex-shrink-0 font-mono text-[10px] text-body bg-surface border border-card-edge rounded-[6px] px-1.5 py-0.5">
                      AI {k.aiScore}/10
                    </span>
                  )}
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 p-6 pt-4 border-t border-mist">
          <p className="text-[12px] text-faint font-mono">{selected.size} selected</p>
          <div className="flex items-center gap-2">
            <button onClick={() => !saving && onClose()} disabled={saving}
              className="px-4 py-2 rounded-[10px] text-[13px] font-medium text-ink hover:bg-surface transition-colors disabled:opacity-50">
              Cancel
            </button>
            <button onClick={attach} disabled={saving || selected.size === 0}
              className="flex items-center gap-2 px-4 py-2 rounded-[10px] bg-ink text-white text-[13px] font-medium hover:bg-ink/80 transition-colors disabled:opacity-40">
              {saving && <Loader2 size={13} className="animate-spin" />}
              {saving ? 'Attaching…' : `Attach ${selected.size || ''}`.trim()}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Compact status control. This is a manual ops tool, so it offers EVERY state —
// a manager can correct a KOL freely (e.g. a false-positive `posted` back to
// `awaiting_post`), not just follow the pipeline forward.
function StatusSelect({ kol, onStateChange }) {
  const [busy, setBusy] = useState(false)
  const change = async (to) => {
    if (to === kol.state) return
    setBusy(true)
    try { await onStateChange(kol, to) } finally { setBusy(false) }
  }
  return (
    <div className="relative inline-flex items-center flex-shrink-0">
      <select value={kol.state} disabled={busy} onChange={(e) => change(e.target.value)}
        title="Change status"
        className={`appearance-none cursor-pointer text-[11px] font-mono pl-2.5 pr-6 py-1 rounded-full border border-transparent focus:outline-none focus:border-ink/30 disabled:opacity-50 ${STATE_META[kol.state]?.cls || ''}`}>
        {KOL_STATES.map((s) => <option key={s} value={s}>{STATE_META[s]?.label || s}</option>)}
      </select>
      {busy
        ? <Loader2 size={11} className="animate-spin absolute right-1.5 pointer-events-none opacity-60" />
        : <ChevronDown size={11} className="absolute right-1.5 pointer-events-none opacity-50" />}
    </div>
  )
}

// Per-KOL content-format toggles (manually set). feed/reel auto-verify;
// story/blog are manual-only. Shared by the board and table views.
function FormatChips({ kol, onSetFormats, showInfo = true }) {
  const [busy, setBusy] = useState(false)
  const formats = kol.content_formats || []
  const toggle = async (id) => {
    const next = formats.includes(id) ? formats.filter((x) => x !== id) : [...formats, id]
    setBusy(true)
    try { await onSetFormats(kol, next) } finally { setBusy(false) }
  }
  return (
    <div className="flex items-center flex-wrap gap-1.5">
      {CONTENT_FORMATS.map((f) => {
        const active = formats.includes(f.id)
        return (
          <button key={f.id} onClick={() => toggle(f.id)} disabled={busy}
            className={`text-[10px] font-mono px-2 py-0.5 rounded-full border transition-colors disabled:opacity-50 ${
              active ? `${FORMAT_BADGE_CLS[f.id]} border-transparent` : 'border-mist text-faint hover:border-ink/30 hover:text-ink'}`}>
            {f.label}
          </button>
        )
      })}
      {showInfo && (
        <span className="relative group inline-flex items-center">
          <Info size={12} className="text-faint cursor-help" />
          <span className="pointer-events-none absolute left-0 top-5 z-20 hidden group-hover:block w-[248px] p-2 rounded-[8px] bg-ink text-white text-[10.5px] leading-snug shadow-lg normal-case font-sans tracking-normal">
            Feed &amp; Reels are auto-verified from the scrape. Stories are only verifiable within 24h of posting — after that they expire and can’t be auto-checked, so mark them posted by hand. Blog is off-platform (manual).
          </span>
        </span>
      )}
    </div>
  )
}

// SF Express waybill number — typed/pasted by hand, saved on blur or Enter, with
// a one-click link to SF's public tracking page (no SF API creds involved).
// Shared by the board and table views.
function TrackingField({ kol, campaign, onSave }) {
  const [val, setVal] = useState(kol.tracking_number || '')
  useEffect(() => { setVal(kol.tracking_number || '') }, [kol.tracking_number])
  const save = () => {
    const v = val.trim()
    if (v !== (kol.tracking_number || '')) onSave(kol, v || null)
  }
  const url = sfTrackingUrl(kol.tracking_number, campaign?.market)
  return (
    <span className="inline-flex items-center gap-1.5">
      <input type="text" value={val} placeholder="SF waybill #" spellCheck={false}
        onChange={(e) => setVal(e.target.value)} onBlur={save}
        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
        className="w-[118px] px-2 py-1 border border-mist rounded-[8px] text-[11px] font-mono text-ink bg-white placeholder:text-faint/70 focus:outline-none focus:border-ink/40" />
      {url && (
        <a href={url} target="_blank" rel="noreferrer" title="Track on SF Express"
          className="inline-flex items-center gap-1 px-2 py-1 rounded-[8px] border border-card-edge text-[11px] text-muted hover:text-ink hover:border-ink/30 transition-colors whitespace-nowrap">
          <Truck size={11} /> Track
        </a>
      )}
    </span>
  )
}

// Markato sender details for the SF bulk file — SF requires them on every row.
// Entered once, stored in THIS browser's localStorage only (they're personal
// data — name + mobile — and the repo is public, so they never go in code).
function SfSenderModal({ onClose, onSaved }) {
  const [s, setS] = useState(() => getSfSender())
  const upd = (key) => (e) => setS((prev) => ({ ...prev, [key]: e.target.value }))
  const canSave = !!(s.name.trim() && s.mobile.trim() && s.district.trim() && s.area.trim() && s.address.trim())
  const save = () => onSaved(saveSfSender({
    name: s.name.trim(), mobile: s.mobile.trim(), company: s.company.trim(),
    district: s.district.trim(), area: s.area.trim(), address: s.address.trim(),
  }))
  const cls = 'w-full px-2 py-1.5 border border-mist rounded-[8px] text-[12.5px] text-ink bg-white placeholder:text-faint/70 focus:outline-none focus:border-ink/40'
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-[2px] px-4" onClick={onClose}>
      <div className="w-full max-w-[440px] bg-white rounded-[16px] shadow-xl p-6" onClick={(e) => e.stopPropagation()}>
        <p className="font-mono text-[10px] tracking-[.16em] text-faint uppercase mb-1">SF bulk file</p>
        <h2 className="text-[17px] font-semibold text-ink mb-1">Sender details</h2>
        <p className="text-[12px] text-muted mb-4">
          SF needs the sender on every row. Saved in this browser only — copy them from your
          SF 月結平台 sender profile. Asked once.
        </p>
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <input type="text" value={s.name} onChange={upd('name')} placeholder="Name 姓名 *" className={cls} />
            <input type="text" value={s.mobile} onChange={upd('mobile')} placeholder="Mobile 手機號碼 *" className={cls} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input type="text" value={s.company} onChange={upd('company')} placeholder="Company 公司名稱" className={cls} />
            <input type="text" value={s.district} onChange={upd('district')} placeholder="District 地區 (e.g. 南區) *" className={cls} />
          </div>
          <input type="text" value={s.area} onChange={upd('area')} placeholder="Area 區域 (e.g. 黃竹坑) *" className={cls} />
          <textarea value={s.address} onChange={upd('address')} placeholder="Detail address 詳細地址 *" rows={2} className={`${cls} resize-y`} />
        </div>
        <div className="flex items-center justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-4 py-2 rounded-[10px] text-[13px] font-medium text-ink hover:bg-surface transition-colors">Cancel</button>
          <button onClick={save} disabled={!canSave}
            className="px-4 py-2 rounded-[10px] bg-ink text-white text-[13px] font-medium hover:bg-ink/80 transition-colors disabled:opacity-40">
            Save & export
          </button>
        </div>
      </div>
    </div>
  )
}

// Recipient shipping address — typed once here, exported to the SF Express
// bulk-shipment Excel (the "SF bulk file" button). Collapsed: one summary line.
function AddressEditor({ kol, onSave }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState(kol.recipient_name || '')
  const [phone, setPhone] = useState(kol.recipient_phone || '')
  const [district, setDistrict] = useState(kol.recipient_district || '')
  const [area, setArea] = useState(kol.recipient_area || '')
  const [address, setAddress] = useState(kol.recipient_address || '')
  useEffect(() => {
    setName(kol.recipient_name || '')
    setPhone(kol.recipient_phone || '')
    setDistrict(kol.recipient_district || '')
    setArea(kol.recipient_area || '')
    setAddress(kol.recipient_address || '')
  }, [kol.recipient_name, kol.recipient_phone, kol.recipient_district, kol.recipient_area, kol.recipient_address])

  const has = !!(kol.recipient_name || kol.recipient_phone || kol.recipient_address)
  const save = async () => {
    setBusy(true)
    try {
      await onSave(kol, {
        recipient_name: name.trim(),
        recipient_phone: phone.trim(),
        recipient_district: district.trim(),
        recipient_area: area.trim(),
        recipient_address: address.trim(),
      })
      setOpen(false)
    } catch { /* parent toasts the error; keep the editor open */ } finally {
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} title={has ? 'Edit shipping address' : 'Add shipping address'}
        className="mt-2 flex items-center gap-1.5 max-w-full text-[11px] font-mono text-faint hover:text-ink transition-colors">
        <MapPin size={11} className={`flex-shrink-0 ${has ? 'text-green-600' : ''}`} />
        {has
          ? <span className="truncate">{[kol.recipient_name, kol.recipient_phone, kol.recipient_district, kol.recipient_address].filter(Boolean).join(' · ')}</span>
          : <span>Add shipping address</span>}
      </button>
    )
  }
  return (
    <div className="mt-2.5 p-3 rounded-[10px] border border-mist bg-surface/60 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Recipient name"
          className="px-2 py-1.5 border border-mist rounded-[8px] text-[12px] text-ink bg-white placeholder:text-faint/70 focus:outline-none focus:border-ink/40" />
        <input type="text" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone"
          className="px-2 py-1.5 border border-mist rounded-[8px] text-[12px] text-ink bg-white placeholder:text-faint/70 focus:outline-none focus:border-ink/40" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <input type="text" value={district} onChange={(e) => setDistrict(e.target.value)} placeholder="District 地區 (e.g. 大埔區)"
          className="px-2 py-1.5 border border-mist rounded-[8px] text-[12px] text-ink bg-white placeholder:text-faint/70 focus:outline-none focus:border-ink/40" />
        <input type="text" value={area} onChange={(e) => setArea(e.target.value)} placeholder="Area 區域 (e.g. 大埔)"
          className="px-2 py-1.5 border border-mist rounded-[8px] text-[12px] text-ink bg-white placeholder:text-faint/70 focus:outline-none focus:border-ink/40" />
      </div>
      <textarea value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Detail address 詳細地址 (street, building, floor/flat)" rows={2}
        className="w-full px-2 py-1.5 border border-mist rounded-[8px] text-[12px] text-ink bg-white placeholder:text-faint/70 focus:outline-none focus:border-ink/40 resize-y" />
      <div className="flex items-center justify-end gap-2">
        <button onClick={() => setOpen(false)} disabled={busy}
          className="px-3 py-1.5 rounded-[8px] text-[12px] text-muted hover:text-ink transition-colors disabled:opacity-50">
          Cancel
        </button>
        <button onClick={save} disabled={busy}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] bg-ink text-white text-[12px] font-medium hover:bg-ink/80 transition-colors disabled:opacity-40">
          {busy && <Loader2 size={11} className="animate-spin" />} Save
        </button>
      </div>
    </div>
  )
}

// A worker- or import-detected post. The Confirm toggle is the Phase 2 safety
// gate: the worker sets state=posted but human_verified stays false until a
// brand manager confirms the match is genuine here.
function VerifiedPost({ post, onConfirm }) {
  const [busy, setBusy] = useState(false)
  const confirm = async () => {
    setBusy(true)
    try { await onConfirm(post, !post.human_verified) } finally { setBusy(false) }
  }
  return (
    <div className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-[8px] bg-surface border border-card-edge">
      <div className="min-w-0">
        <a href={post.post_url} target="_blank" rel="noreferrer"
          className="text-[12px] font-medium text-ink hover:text-ink/70 flex items-center gap-1 truncate">
          {post.post_shortcode ? `/${post.post_shortcode}` : 'View post'}
          <ExternalLink size={10} className="opacity-40 flex-shrink-0" />
        </a>
        <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 mt-0.5 text-[10px] font-mono text-faint">
          {post.posted_at && <span>{formatDate(post.posted_at)}</span>}
          {(post.matched_signals || []).map((s) => <span key={s} className="text-body">{s}</span>)}
          {post.detection_method && (
            <span className="uppercase tracking-wide">{post.detection_method.replace('apify_', '')}</span>
          )}
        </div>
      </div>
      <button onClick={confirm} disabled={busy}
        className={`flex items-center gap-1 flex-shrink-0 px-2 py-1 rounded-[7px] text-[11px] font-medium transition-colors disabled:opacity-50 ${
          post.human_verified ? 'bg-green-100 text-green-700' : 'border border-mist text-muted hover:border-ink/30 hover:text-ink'}`}
        title={post.human_verified ? 'Confirmed by a manager — click to un-confirm' : 'Confirm this is a genuine campaign post'}>
        {busy ? <Loader2 size={11} className="animate-spin" /> : post.human_verified ? <CheckCircle2 size={11} /> : <Circle size={11} />}
        {post.human_verified ? 'Verified' : 'Confirm'}
      </button>
    </div>
  )
}

// Overdue-only: generate + store a soft reminder DM draft (copy-paste send;
// Meta API paused). Language follows the campaign market — never mixed.
function NudgeBlock({ kol, nudges, onDraft, onMarkSent }) {
  const [drafting, setDrafting] = useState(false)
  const [error, setError] = useState(null)
  const [copiedId, setCopiedId] = useState(null)

  const draft = async () => {
    setDrafting(true)
    setError(null)
    try { await onDraft(kol) } catch (e) { setError(e.message) } finally { setDrafting(false) }
  }
  const copy = async (n) => {
    try {
      await navigator.clipboard.writeText(n.draft_text)
      setCopiedId(n.id)
      setTimeout(() => setCopiedId(null), 1500)
    } catch { /* clipboard blocked — user can select manually */ }
  }

  return (
    <div className="mt-2.5 space-y-2">
      {(nudges || []).map((n) => (
        <div key={n.id} className="rounded-[8px] border border-accent/30 bg-accent/5 px-3 py-2.5">
          <div className="flex items-center justify-between mb-1.5">
            <span className="font-mono text-[10px] tracking-wide text-[#8A6A22] uppercase">Nudge draft · {n.language}</span>
            <div className="flex items-center gap-1.5">
              <button onClick={() => copy(n)}
                className="flex items-center gap-1 px-2 py-0.5 rounded-[6px] text-[11px] text-muted hover:text-ink hover:bg-white transition-colors">
                {copiedId === n.id ? <Check size={11} className="text-green-600" /> : <Copy size={11} />}
                {copiedId === n.id ? 'Copied' : 'Copy'}
              </button>
              {n.sent_manually_at ? (
                <span className="text-[10px] font-mono text-sage">sent {formatDate(n.sent_manually_at)}</span>
              ) : (
                <button onClick={() => onMarkSent(n)}
                  className="px-2 py-0.5 rounded-[6px] text-[11px] text-muted hover:text-ink hover:bg-white transition-colors">
                  Mark sent
                </button>
              )}
            </div>
          </div>
          <p className="text-[12px] text-body whitespace-pre-wrap leading-relaxed">{n.draft_text}</p>
        </div>
      ))}
      {error && <p className="text-[11px] text-rose">{error}</p>}
      <button onClick={draft} disabled={drafting}
        className="flex items-center gap-1.5 px-3 py-1.5 border border-accent/40 text-[#8A6A22] rounded-[9px] text-[12px] hover:bg-accent/10 transition-colors disabled:opacity-50">
        {drafting ? <Loader2 size={12} className="animate-spin" /> : <MessageSquarePlus size={12} />}
        {(nudges || []).length ? 'Draft another nudge' : 'Draft nudge'}
      </button>
    </div>
  )
}

// Deadline indicator: shows the effective deadline, an "(custom)" tag when it's
// a per-KOL override (NOT "overdue" — different concept), and a red "past
// deadline" note when relevant.
function DeadlineMeta({ kol, campaign }) {
  const eff = effectiveDeadline(kol, campaign)
  const pastDeadline = eff && eff < todayStr() && ['shipped', 'awaiting_post'].includes(kol.state)
  return (
    <>
      <span className="flex items-center gap-1">
        <CalendarClock size={11} /> {formatDate(eff)}
        {kol.deadline_override && (
          <span className="text-accent" title="Deadline manually set for this KOL">(custom)</span>
        )}
      </span>
      {pastDeadline && <span className="text-rose font-medium">past deadline</span>}
    </>
  )
}

function KolRow({ kol, campaign, posts = [], nudges = [], onStateChange, onOverride, onTracking, onShipping, onDetach, onConfirmPost, onDraftNudge, onMarkSent, onSetFormats }) {
  const formats = kol.content_formats || []
  // Story/blog-only KOLs can't be auto-verified (see campaigns.js) — flag it so
  // the manager knows to mark them posted by hand.
  const manualOnly = formats.length > 0 && !isAutoVerifiable(formats)

  return (
    <div className="border border-card-edge rounded-[12px] px-4 py-3 bg-white">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <a href={`https://instagram.com/${kol.kol_handle}`} target="_blank" rel="noreferrer"
            className="font-semibold text-[13.5px] text-ink hover:text-ink/70 flex items-center gap-1">
            @{kol.kol_handle} <ExternalLink size={11} className="opacity-40" />
          </a>
          <div className="flex items-center flex-wrap gap-x-2.5 gap-y-1 mt-1 text-[11px] font-mono text-faint">
            <span>{tierLabel(kol.tier)}</span>
            {kol.shipped_at && <span className="flex items-center gap-1"><Truck size={11} /> {formatDate(kol.shipped_at)}</span>}
            <DeadlineMeta kol={kol} campaign={campaign} />
            {manualOnly && ['shipped', 'awaiting_post', 'overdue'].includes(kol.state) && (
              <span className="text-[#8A6A22]">verify manually</span>
            )}
          </div>

          {/* Content format — manually set (click to toggle), mirrors the plan sheet. */}
          <div className="mt-2">
            <FormatChips kol={kol} onSetFormats={onSetFormats} />
          </div>
        </div>
        <StatusSelect kol={kol} onStateChange={onStateChange} />
      </div>

      <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-mist/70">
        <div className="flex items-center flex-wrap gap-x-3 gap-y-2">
          <label className="flex items-center gap-1.5 text-[11px] font-mono text-faint">
            <span className="hidden sm:inline">Deadline</span>
            <input type="date" value={kol.deadline_override || ''}
              onChange={(e) => onOverride(kol, e.target.value || null)}
              className="px-2 py-1 border border-mist rounded-[8px] text-[11px] text-ink bg-white focus:outline-none focus:border-ink/40" />
          </label>
          <TrackingField kol={kol} campaign={campaign} onSave={onTracking} />
        </div>
        <button onClick={() => onDetach(kol)} title="Remove from campaign"
          className="flex items-center justify-center w-8 h-8 rounded-[9px] border border-card-edge text-faint hover:text-rose hover:border-rose/30 hover:bg-rose/5 transition-all">
          <Trash2 size={13} />
        </button>
      </div>

      <AddressEditor kol={kol} onSave={onShipping} />

      {posts.length > 0 && (
        <div className="mt-2.5 space-y-1.5">
          {posts.map((p) => <VerifiedPost key={p.id} post={p} onConfirm={onConfirmPost} />)}
        </div>
      )}

      {/* Nudges only for overdue KOLs — never against a (possibly mis-tagged)
          detected post, per the Phase 2 safety rule. */}
      {kol.state === 'overdue' && (
        <NudgeBlock kol={kol} nudges={nudges} onDraft={onDraftNudge} onMarkSent={onMarkSent} />
      )}
    </div>
  )
}

// Spreadsheet-style view: one KOL per row. Same controls as the board (status,
// format, deadline, post-confirm) in a compact grid. Nudge drafting stays in the
// board view to keep the table lean.
function KolTable({ kols, campaign, postsByKol, onStateChange, onOverride, onTracking, onDetach, onConfirmPost, onSetFormats }) {
  const { processed: sortedKols, sortId, sortDir, toggleSort, filters, setFilter, distinctValues } =
    useTableControls(kols, { defaultSortId: null, accessors: CAMPAIGN_ACCESSORS, urlSync: true, urlKey: 'campaign' })

  return (
    <div className="overflow-auto max-h-[70vh] border border-card-edge rounded-[14px] bg-white">
      <table className="w-full min-w-[980px] text-[12.5px] border-collapse">
        <thead>
          <tr className="text-left font-mono text-[10px] uppercase tracking-[.12em] text-faint">
            <th className="sticky left-0 top-0 z-30 bg-surface px-4 py-3 font-normal border-b border-mist">KOL</th>
            {CAMPAIGN_COLS.map((col) => (
              <th key={col.id} className="sticky top-0 z-20 bg-surface px-3 py-3 font-normal border-b border-mist">
                <ColumnHeaderCell
                  col={col}
                  align="left"
                  sortId={sortId}
                  sortDir={sortDir}
                  onToggleSort={toggleSort}
                  distinctValues={distinctValues(col.id)}
                  activeFilter={filters[col.id] || []}
                  onFilterChange={setFilter}
                />
              </th>
            ))}
            <th className="sticky top-0 z-20 bg-surface px-4 py-3 font-normal border-b border-mist"></th>
          </tr>
        </thead>
        <tbody>
          {sortedKols.map((kol) => {
            const posts = postsByKol[kol.id] || []
            return (
              <tr key={kol.id} className="border-b border-mist/60 last:border-0 align-top">
                <td className="sticky left-0 z-[1] bg-white px-4 py-3">
                  <a href={`https://instagram.com/${kol.kol_handle}`} target="_blank" rel="noreferrer"
                    className="font-medium text-ink hover:text-ink/70 inline-flex items-center gap-1 whitespace-nowrap">
                    @{kol.kol_handle} <ExternalLink size={10} className="opacity-40" />
                  </a>
                </td>
                <td className="px-3 py-3 font-mono text-body whitespace-nowrap">{tierLabel(kol.tier)}</td>
                <td className="px-3 py-3"><FormatChips kol={kol} onSetFormats={onSetFormats} showInfo={false} /></td>
                <td className="px-3 py-3"><StatusSelect kol={kol} onStateChange={onStateChange} /></td>
                <td className="px-3 py-3 font-mono text-body whitespace-nowrap">{kol.shipped_at ? formatDate(kol.shipped_at) : '—'}</td>
                <td className="px-3 py-3 whitespace-nowrap">
                  <TrackingField kol={kol} campaign={campaign} onSave={onTracking} />
                </td>
                <td className="px-3 py-3 whitespace-nowrap">
                  <input type="date" value={kol.deadline_override || ''}
                    onChange={(e) => onOverride(kol, e.target.value || null)}
                    className="px-2 py-1 border border-mist rounded-[8px] text-[11px] text-ink bg-white focus:outline-none focus:border-ink/40" />
                </td>
                <td className="px-3 py-3">
                  {posts.length ? posts.map((p) => (
                    <div key={p.id} className="flex items-center gap-1.5 mb-1 last:mb-0 whitespace-nowrap">
                      <a href={p.post_url} target="_blank" rel="noreferrer"
                        className="text-ink hover:text-ink/70 inline-flex items-center gap-1 text-[11px]">
                        {p.post_shortcode ? `/${p.post_shortcode}` : 'post'} <ExternalLink size={9} className="opacity-40" />
                      </a>
                      <button onClick={() => onConfirmPost(p, !p.human_verified)}
                        title={p.human_verified ? 'Verified — click to un-confirm' : 'Confirm this post'}
                        className={`inline-flex items-center px-1.5 py-0.5 rounded-[6px] text-[10px] ${
                          p.human_verified ? 'bg-green-100 text-green-700' : 'border border-mist text-muted hover:text-ink'}`}>
                        {p.human_verified ? <CheckCircle2 size={10} /> : <Circle size={10} />}
                      </button>
                    </div>
                  )) : <span className="text-faint">—</span>}
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => onDetach(kol)} title="Remove from campaign"
                    className="text-faint hover:text-rose transition-colors"><Trash2 size={13} /></button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// A campaign's Seeder sessions — the runs grouped under it. Opening one loads it
// into the Seeder; "New session" starts a fresh run pre-filled from the campaign.
function SessionsPanel({ sessions, onOpenSession, onNewSession }) {
  return (
    <div className="mb-5 px-5 py-4 bg-surface border border-card-edge rounded-[14px]">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-[14px] font-semibold text-ink">
          Seeder sessions <span className="text-faint font-normal">· {sessions.length}</span>
        </h3>
        <button onClick={onNewSession}
          className="flex items-center gap-1.5 text-[12.5px] font-medium text-ink hover:text-accent transition-colors">
          <Plus size={14} /> New session
        </button>
      </div>
      <p className="text-[11.5px] text-faint mb-3">
        Each run under this campaign — all share the config above; only the scrape depth changes per run.
      </p>
      {sessions.length === 0 ? (
        <p className="text-[12.5px] text-muted">
          No sessions yet —{' '}
          <button onClick={onNewSession} className="underline underline-offset-2 hover:text-ink">start one</button>.
        </p>
      ) : (
        <div className="space-y-2">
          {sessions.map((s) => (
            <button key={s.id} onClick={() => onOpenSession(s.id)}
              className="w-full flex items-center gap-3 px-3.5 py-2.5 bg-white border border-card-edge rounded-[11px] hover:border-ink transition-colors text-left">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-ink truncate">
                  {s.config?.sessionTitle || (s.fileNames?.length ? s.fileNames.join(', ') : 'Seeding run')}
                </p>
                <p className="text-[11px] text-faint">{formatDate(s.date)}</p>
              </div>
              <span className="text-[12px] font-mono text-body flex-shrink-0">{s.accountCount} accounts</span>
              <ChevronRight size={15} className="text-faint flex-shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// The single editor for a campaign: scoring config (audience / in-niche /
// out-niche / brief / location) + the Instagram/Threads scrape targets + default
// max-results. Shared by every session under the campaign. A fresh campaign
// opens straight into edit mode. Brand → niches + scoring formula are derived
// from the fixed catalog on save, so there's no manual niche picker.
function toSetupForm(s1, s2) {
  return {
    targetAudience: s2.targetAudience || '',
    targetKeywords: s2.targetKeywords || '',
    excludeKeywords: s2.excludeKeywords || '',
    locationTarget: s2.locationTarget || 'Hong Kong',
    instagram: s1.platforms?.instagram ?? true,
    threads: s1.platforms?.threads ?? false,
    scrapeInput: s1.scrapeInput || '',
    painpointInput: s1.painpointInput || '',
    genreInput: s1.genreInput || '',
    resultsLimit: s1.resultsLimit || 200,
  }
}

// Seed the one-box brief from brand facts (shared) + the campaign's saved brief
// bits, in the labelled format 自動整理 produces.
function briefSeed(brand, s2, brandName) {
  return assembleBrief({
    brandName: brandName || '',
    brandBackground: brand?.background || '',
    products: brand?.products || [],
    newProduct: s2?.newProduct || '',
    collabFormat: s2?.collabFormat || '',
    briefNotes: s2?.briefNotes || '',
  })
}

function SetupTokens({ text }) {
  const parts = String(text || '').split(/[\n,]+/).map((x) => x.trim()).filter(Boolean)
  if (!parts.length) return <span className="text-faint">—</span>
  return <div className="flex flex-wrap gap-1.5">{parts.map((p, i) => <span key={i} className="tag">{p}</span>)}</div>
}
function SetupKV({ label, children }) {
  return (
    <div className="mb-3 last:mb-0">
      <p className="font-mono text-[9px] tracking-[.1em] uppercase text-faint mb-1">{label}</p>
      <div className="text-[13px] text-ink">{children ?? <span className="text-faint">—</span>}</div>
    </div>
  )
}

function CampaignSetupPanel({ campaign, onSaved }) {
  const s1 = campaign.default_step1 || {}
  const s2 = campaign.default_step2 || {}
  const hasSetup = Object.keys(s1).length > 0 || Object.keys(s2).length > 0
  const [editing, setEditing] = useState(!hasSetup) // fresh campaign opens ready to fill
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)
  const [form, setForm] = useState(() => toSetupForm(s1, s2))
  const [brandFacts, setBrandFacts] = useState(null)
  const [brief, setBrief] = useState('')
  const [tidying, setTidying] = useState(false)
  const [tidyErr, setTidyErr] = useState('')

  // Load brand facts (background/products, shared across the brand's campaigns)
  // so the brief box assembles from them + the campaign's saved brief bits.
  useEffect(() => {
    let alive = true
    const seed = (b) => { if (alive) { setBrandFacts(b || {}); setBrief(briefSeed(b, s2, campaign.brand)) } }
    if (!campaign.brand_id) { seed({}); return }
    getBrandById(campaign.brand_id).then(seed).catch(() => seed({}))
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaign.id])

  const startEdit = () => {
    setForm(toSetupForm(s1, s2))
    setBrief(briefSeed(brandFacts || {}, s2, campaign.brand))
    setErr(null); setTidyErr(''); setEditing(true)
  }
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  // 自動整理 — DeepSeek rewrites the freeform brief into the labelled format.
  const tidy = async () => {
    if (!brief.trim()) return
    setTidying(true); setTidyErr('')
    try {
      const out = assembleBrief(await parseBrief(brief))
      if (!out.trim()) throw new Error('DeepSeek 讀唔到呢份 brief — 檢查下內容再試')
      setBrief(out)
    } catch (e) {
      setTidyErr(e.message || 'Could not tidy the brief')
    } finally {
      setTidying(false)
    }
  }

  const save = async () => {
    setBusy(true); setErr(null)
    try {
      // Brand drives niches + scoring formula from the fixed catalog — no manual
      // niche picker; scoring still rewards the right vertical.
      const cat = BRAND_CATALOG.find((b) => normBrand(b.name) === normBrand(campaign.brand))
      const derived = cat ? { brandId: cat.id, niches: cat.niches, scoringProfile: cat.scoringProfile } : {}
      // Decompose the brief: brand facts (background/products) go to the brand
      // (shared); campaign-specific bits stay on the campaign.
      const bf = briefToFields(brief)
      if (campaign.brand_id) {
        await updateBrandFacts(campaign.brand_id, { background: bf.brandBackground, products: bf.products })
      }
      const updated = await updateCampaignSetup(campaign.id, {
        default_step2: {
          ...s2, ...derived,
          targetAudience: form.targetAudience,
          targetKeywords: form.targetKeywords,
          excludeKeywords: form.excludeKeywords,
          newProduct: bf.newProduct,
          collabFormat: bf.collabFormat,
          briefNotes: bf.briefNotes,
          locationTarget: form.locationTarget,
        },
        default_step1: {
          ...s1,
          platforms: { instagram: form.instagram, threads: form.threads },
          scrapeInput: form.scrapeInput,
          painpointInput: form.painpointInput,
          genreInput: form.genreInput,
          resultsLimit: form.resultsLimit,
        },
      })
      onSaved(updated)
      setEditing(false)
    } catch (e) {
      setErr(e.message)
    } finally {
      setBusy(false)
    }
  }

  const inputCls = 'w-full px-2.5 py-2 border border-mist rounded-[9px] text-[12.5px] text-ink bg-white focus:outline-none focus:border-ink/40'
  const lblCls = 'font-mono text-[9px] tracking-[.1em] uppercase text-faint'

  return (
    <div className="mb-6 px-5 py-4 bg-surface border border-card-edge rounded-[14px]">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-[14px] font-semibold text-ink">Campaign config</h3>
        {!editing && (
          <button onClick={startEdit}
            className="flex items-center gap-1.5 text-[12.5px] font-medium text-ink hover:text-accent transition-colors">
            <Pencil size={13} /> Edit
          </button>
        )}
      </div>
      <p className="text-[11.5px] text-faint mb-3">
        The scoring brief and scrape targets for this campaign — <span className="font-medium text-body">shared by every session</span>.
        Edit here and it changes everywhere.
      </p>

      {!editing ? (
        <div className="grid sm:grid-cols-2 gap-x-6">
          <div>
            <SetupKV label="Target audience">{s2.targetAudience}</SetupKV>
            <SetupKV label="In-niche keywords"><SetupTokens text={s2.targetKeywords} /></SetupKV>
            <SetupKV label="Out-niche keywords"><SetupTokens text={s2.excludeKeywords} /></SetupKV>
            <SetupKV label="Campaign brief">
              {brief.trim()
                ? <pre className="whitespace-pre-wrap font-sans text-[12.5px] text-body leading-relaxed">{brief}</pre>
                : undefined}
            </SetupKV>
            <SetupKV label="Target location">{s2.locationTarget}</SetupKV>
          </div>
          <div>
            <SetupKV label="Scrape — platforms">
              <div className="flex gap-1.5">
                {s1.platforms?.instagram && <span className="tag tag-video">Instagram</span>}
                {s1.platforms?.threads && <span className="tag tag-video">Threads</span>}
                {!s1.platforms?.instagram && !s1.platforms?.threads && <span className="text-faint">—</span>}
              </div>
            </SetupKV>
            {s1.platforms?.instagram && <SetupKV label="Instagram — targets"><SetupTokens text={s1.scrapeInput} /></SetupKV>}
            {s1.platforms?.threads && (
              <SetupKV label="Threads — keywords">
                <SetupTokens text={[s1.painpointInput, s1.genreInput].filter(Boolean).join('\n')} />
              </SetupKV>
            )}
            <SetupKV label="Default max results">{s1.resultsLimit || 200}</SetupKV>
          </div>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="space-y-2.5">
            <div>
              <label className={lblCls}>Target audience</label>
              <textarea rows={2} className={inputCls} value={form.targetAudience} onChange={(e) => set('targetAudience', e.target.value)} />
            </div>
            <div>
              <label className={lblCls}>In-niche keywords <span className="text-sage normal-case tracking-normal">· reward</span></label>
              <input className={inputCls} value={form.targetKeywords} onChange={(e) => set('targetKeywords', e.target.value)} placeholder="comma separated" />
            </div>
            <div>
              <label className={lblCls}>Out-niche keywords <span className="text-rose normal-case tracking-normal">· penalise</span></label>
              <input className={inputCls} value={form.excludeKeywords} onChange={(e) => set('excludeKeywords', e.target.value)} placeholder="comma separated" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-0.5">
                <label className={lblCls}>Campaign brief</label>
                <button type="button" onClick={tidy} disabled={tidying || !brief.trim()}
                  className="flex items-center gap-1 text-[11px] text-accent hover:text-ink disabled:opacity-40 transition-colors">
                  {tidying ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />} 自動整理
                </button>
              </div>
              <textarea rows={5} className={inputCls} value={brief} onChange={(e) => setBrief(e.target.value)}
                placeholder={'品牌背景：…\n新品：…\n合作形式：…\n產品詳情：\n【產品名】\n・賣點'} />
              {tidyErr && <p className="text-[11px] text-rose mt-1">{tidyErr}</p>}
            </div>
            <div>
              <label className={lblCls}>Target location</label>
              <input className={inputCls} value={form.locationTarget} onChange={(e) => set('locationTarget', e.target.value)} />
            </div>
          </div>
          <div className="space-y-2.5">
            <div className="flex items-center gap-2">
              <span className={lblCls}>Platforms</span>
              {[['instagram', 'Instagram'], ['threads', 'Threads']].map(([k, lbl]) => (
                <button key={k} type="button" onClick={() => set(k, !form[k])}
                  className={`px-2.5 py-1 rounded-[8px] text-[11px] border transition-colors ${
                    form[k] ? 'bg-ink text-white border-ink' : 'border-mist text-muted hover:border-ink/30'}`}>
                  {lbl}
                </button>
              ))}
            </div>
            {form.instagram && (
              <div>
                <label className={lblCls}>Instagram — one entry per line</label>
                <textarea rows={3} className={inputCls} value={form.scrapeInput} onChange={(e) => set('scrapeInput', e.target.value)}
                  placeholder={'https://www.instagram.com/brand/tagged/\n#skincare'} />
              </div>
            )}
            {form.threads && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={lblCls}>Pain-point</label>
                  <textarea rows={3} className={inputCls} value={form.painpointInput} onChange={(e) => set('painpointInput', e.target.value)} />
                </div>
                <div>
                  <label className={lblCls}>Content-genre</label>
                  <textarea rows={3} className={inputCls} value={form.genreInput} onChange={(e) => set('genreInput', e.target.value)} />
                </div>
              </div>
            )}
            <div>
              <label className={lblCls}>Default max results</label>
              <div className="flex gap-1.5 mt-1">
                {RESULT_LIMITS.map((n) => (
                  <button key={n} type="button" onClick={() => set('resultsLimit', n)}
                    className={`px-3 py-1 rounded-[8px] text-[12px] font-mono border transition-all ${
                      form.resultsLimit === n ? 'bg-ink text-white border-ink' : 'border-mist text-muted hover:border-ink/30'}`}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {err && <p className="sm:col-span-2 text-[11px] text-rose">{err}</p>}
          <div className="sm:col-span-2 flex items-center justify-end gap-2">
            {hasSetup && (
              <button onClick={() => setEditing(false)} disabled={busy}
                className="px-3.5 py-2 rounded-[9px] text-[12.5px] text-muted hover:text-ink transition-colors disabled:opacity-50">
                Cancel
              </button>
            )}
            <button onClick={save} disabled={busy}
              className="flex items-center gap-1.5 px-4 py-2 rounded-[9px] bg-ink text-white text-[12.5px] font-medium hover:bg-ink/80 transition-colors disabled:opacity-50">
              {busy && <Loader2 size={12} className="animate-spin" />} Save config
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function CampaignDetailPage({ campaignId, onBack, onOpenSession, onNewSession }) {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [campaign, setCampaign] = useState(null)
  const [sessions, setSessions] = useState([])
  const [kols, setKols] = useState([])
  const [postsByKol, setPostsByKol] = useState({})
  const [nudgesByKol, setNudgesByKol] = useState({})
  const [showAttach, setShowAttach] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [sheetBusy, setSheetBusy] = useState(false)
  const [sfBusy, setSfBusy] = useState(false)
  const [showSfSender, setShowSfSender] = useState(false)
  const [toast, setToast] = useState(null)
  const [view, setView] = useUrlParam('campaign_view', 'board') // 'board' | 'table' (shareable via URL)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [c, ks, ss] = await Promise.all([
        getCampaign(campaignId),
        getCampaignKols(campaignId),
        listSessionsForCampaign(campaignId),
      ])
      setCampaign(c)
      setSessions(ss)
      setKols(ks)
      const ids = ks.map((k) => k.id)
      const [posts, nudges] = await Promise.all([getVerifiedPostsByKol(ids), getNudgesByKol(ids)])
      setPostsByKol(posts)
      setNudgesByKol(nudges)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [campaignId])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])

  const handleStateChange = useCallback(async (kol, to) => {
    try {
      const updated = await updateKolState(kol, to)
      setKols((prev) => prev.map((k) => (k.id === kol.id ? updated : k)))
    } catch (e) {
      setToast({ type: 'error', message: e.message })
    }
  }, [])

  const handleOverride = useCallback(async (kol, date) => {
    // optimistic
    setKols((prev) => prev.map((k) => (k.id === kol.id ? { ...k, deadline_override: date } : k)))
    try {
      const updated = await setDeadlineOverride(kol.id, date)
      setKols((prev) => prev.map((k) => (k.id === kol.id ? updated : k)))
    } catch (e) {
      setToast({ type: 'error', message: e.message })
      load()
    }
  }, [load])

  const handleTracking = useCallback(async (kol, number) => {
    // optimistic
    setKols((prev) => prev.map((k) => (k.id === kol.id ? { ...k, tracking_number: number } : k)))
    try {
      const updated = await setTrackingNumber(kol.id, number)
      setKols((prev) => prev.map((k) => (k.id === kol.id ? updated : k)))
    } catch (e) {
      setToast({ type: 'error', message: e.message })
      load()
    }
  }, [load])

  const handleShipping = useCallback(async (kol, fields) => {
    try {
      const updated = await setKolShipping(kol.id, fields)
      setKols((prev) => prev.map((k) => (k.id === kol.id ? updated : k)))
      setToast({ type: 'success', message: `Address saved for @${kol.kol_handle}` })
    } catch (e) {
      setToast({ type: 'error', message: e.message })
      throw e // keep the editor open
    }
  }, [])

  const handleSfExport = useCallback(async (senderOverride) => {
    const sender = senderOverride || getSfSender()
    if (!sfSenderComplete(sender)) {
      setShowSfSender(true) // first run: collect the sender profile, then export
      return
    }
    setSfBusy(true)
    setToast(null)
    try {
      const { exported, skipped } = await exportSfBulkXlsx(campaign, kols, sender)
      if (!exported) {
        setToast({ type: 'error', message: 'No KOLs with a shipping address to export — add addresses first' })
      } else {
        setToast({
          type: 'success',
          message: `SF bulk file: ${exported} recipient${exported === 1 ? '' : 's'}${skipped ? ` (${skipped} skipped — no address)` : ''}`,
        })
      }
    } catch (e) {
      setToast({ type: 'error', message: e.message })
    } finally {
      setSfBusy(false)
    }
  }, [campaign, kols])

  const handleDetach = useCallback(async (kol) => {
    try {
      await detachKol(kol.id)
      setKols((prev) => prev.filter((k) => k.id !== kol.id))
      setToast({ type: 'success', message: `@${kol.kol_handle} removed` })
    } catch (e) {
      setToast({ type: 'error', message: e.message })
    }
  }, [])

  const handleVerify = useCallback(async () => {
    setVerifying(true)
    setToast(null)
    try {
      const s = await runVerification(campaignId)
      await load()
      const bits = [`${s.checked} checked`]
      if (s.matched) bits.push(`${s.matched} posted`)
      if (s.overdue) bits.push(`${s.overdue} overdue`)
      if (s.beforeShip) bits.push(`${s.beforeShip} found but before ship date`)
      setToast({ type: 'success', message: `Verification done — ${bits.join(', ')}` })
    } catch (e) {
      setToast({ type: 'error', message: e.message })
    } finally {
      setVerifying(false)
    }
  }, [campaignId, load])

  const handleSyncSheet = useCallback(async () => {
    setSheetBusy(true)
    setToast(null)
    try {
      const scoreByHandle = await getScoringByHandle(kols)
      const { title, values } = buildCampaignSheetValues(campaign, kols, postsByKol, scoreByHandle)
      const { url, created } = await syncCampaignSheet(campaignId, title, values)
      setCampaign((c) => ({ ...c, sheet_url: url }))
      setToast({ type: 'success', message: created ? 'Google Sheet created & shared' : 'Sheet synced' })
    } catch (e) {
      setToast({ type: 'error', message: e.message })
    } finally {
      setSheetBusy(false)
    }
  }, [campaign, kols, postsByKol, campaignId])

  const handleSetFormats = useCallback(async (kol, formats) => {
    // optimistic
    setKols((prev) => prev.map((k) => (k.id === kol.id ? { ...k, content_formats: formats } : k)))
    try {
      const updated = await setKolFormats(kol.id, formats)
      setKols((prev) => prev.map((k) => (k.id === kol.id ? updated : k)))
    } catch (e) {
      setToast({ type: 'error', message: e.message })
      load()
    }
  }, [load])

  const handleConfirmPost = useCallback(async (post, verified) => {
    const updated = await setHumanVerified(post.id, verified)
    setPostsByKol((prev) => ({
      ...prev,
      [post.campaign_kol_id]: (prev[post.campaign_kol_id] || []).map((p) => (p.id === post.id ? updated : p)),
    }))
  }, [])

  const handleDraftNudge = useCallback(async (kol) => {
    const { draft, language } = await draftNudge({
      handle: kol.kol_handle,
      brand: campaign?.brand,
      market: campaign?.market,
    })
    const saved = await saveNudge(kol.id, draft, language)
    setNudgesByKol((prev) => ({ ...prev, [kol.id]: [saved, ...(prev[kol.id] || [])] }))
  }, [campaign])

  const handleMarkSent = useCallback(async (nudge) => {
    try {
      const updated = await markNudgeSent(nudge.id)
      setNudgesByKol((prev) => ({
        ...prev,
        [updated.campaign_kol_id]: (prev[updated.campaign_kol_id] || []).map((n) => (n.id === updated.id ? updated : n)),
      }))
    } catch (e) {
      setToast({ type: 'error', message: e.message })
    }
  }, [])

  const existingHandles = useMemo(() => kols.map((k) => k.kol_handle), [kols])
  const grouped = useMemo(() => {
    const g = {}
    for (const k of kols) (g[k.state] = g[k.state] || []).push(k)
    return g
  }, [kols])

  if (loading) {
    return <div className="flex-1 flex items-center justify-center"><Loader2 size={24} className="animate-spin text-faint" /></div>
  }

  if (error && !campaign) {
    return (
      <div className="min-h-screen px-[48px] py-[40px] max-w-3xl mx-auto">
        <button onClick={onBack} className="flex items-center gap-1.5 text-[13px] text-muted hover:text-ink transition-colors mb-6">
          <ArrowLeft size={14} /> Back to campaigns
        </button>
        <div className="px-4 py-3 bg-rose/5 border border-rose/20 rounded-[12px] text-[12px] text-rose">{error}</div>
      </div>
    )
  }

  // ── Wrap summary (Phase 3) ──────────────────────────────────────────────
  // Fulfillment rate excludes opted-out KOLs: they were pulled from the wave by
  // agreement, so counting them against posting would understate the outcome.
  const total = kols.length
  const posted = (grouped.posted || []).length
  const shipped = (grouped.shipped || []).length
  const awaiting = (grouped.awaiting_post || []).length
  const overdue = (grouped.overdue || []).length
  const optedOut = (grouped.opted_out || []).length
  const eligible = total - optedOut
  const fulfillment = eligible > 0 ? Math.round((posted / eligible) * 100) : 0

  return (
    <div className={`min-h-screen px-[48px] py-[40px] mx-auto transition-[max-width] ${view === 'table' ? 'max-w-6xl' : 'max-w-3xl'}`}>
      <button onClick={onBack} className="flex items-center gap-1.5 text-[13px] text-muted hover:text-ink transition-colors mb-6">
        <ArrowLeft size={14} /> Back to campaigns
      </button>

      <div className="flex items-start justify-between flex-wrap gap-4 mb-6">
        <div className="min-w-0 flex-1 basis-[320px]">
          <div className="flex items-center gap-2 mb-1">
            <p className="font-mono text-[10px] tracking-[.18em] text-faint uppercase">Campaign</p>
            <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${
              campaign.status === 'active' ? 'bg-sage/10 text-sage' : 'bg-ink/5 text-faint'}`}>{campaign.status}</span>
          </div>
          <h1 className="text-[34px] font-serif font-bold tracking-[0.02em] text-ink mb-1">{campaign.name}</h1>
          <p className="text-[13px] text-muted font-mono">
            {[
              campaign.brand,
              campaign.market,
              campaign.campaign_type,
              campaign.posting_deadline && `deadline ${formatDate(campaign.posting_deadline)}`,
            ].filter(Boolean).join(' · ')}
          </p>
          {(campaign.mention_handles?.length > 0 || campaign.hashtags?.length > 0) && (
            <div className="flex items-center flex-wrap gap-1.5 mt-3">
              {(campaign.mention_handles || []).map((h) => <span key={`m-${h}`} className="tag">@{h}</span>)}
              {(campaign.hashtags || []).map((h) => <span key={`h-${h}`} className="tag tag-video">#{h}</span>)}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {total > 0 && (
            <div className="flex items-center border border-mist rounded-[10px] bg-white p-0.5 mr-1">
              <button onClick={() => setView('board')} title="Board view"
                className={`flex items-center justify-center w-8 h-8 rounded-[8px] transition-colors ${
                  view === 'board' ? 'bg-ink text-white' : 'text-faint hover:text-ink'}`}>
                <LayoutList size={14} />
              </button>
              <button onClick={() => setView('table')} title="Table view"
                className={`flex items-center justify-center w-8 h-8 rounded-[8px] transition-colors ${
                  view === 'table' ? 'bg-ink text-white' : 'text-faint hover:text-ink'}`}>
                <Table2 size={14} />
              </button>
            </div>
          )}
          <button onClick={handleVerify} disabled={verifying || total === 0}
            title="Scrape awaiting/overdue KOLs and auto-detect campaign posts"
            className="flex items-center gap-2 px-4 py-2 border border-mist rounded-[10px] text-[13px] text-ink hover:border-ink/40 transition-all bg-white disabled:opacity-40 whitespace-nowrap">
            {verifying ? <Loader2 size={14} className="animate-spin" /> : <ScanLine size={14} />}
            {verifying ? 'Verifying…' : 'Verify posts'}
          </button>
          <button onClick={() => handleSfExport()} disabled={sfBusy || total === 0}
            title="Download the SF Express bulk-shipment Excel (upload it on SF's 批量寄件 page to create all orders at once)"
            className="flex items-center gap-2 px-4 py-2 border border-mist rounded-[10px] text-[13px] text-ink hover:border-ink/40 transition-all bg-white disabled:opacity-40 whitespace-nowrap">
            {sfBusy ? <Loader2 size={14} className="animate-spin" /> : <Truck size={14} />}
            SF bulk file
          </button>
          <button onClick={handleSyncSheet} disabled={sheetBusy || total === 0}
            title={campaign.sheet_url ? 'Push the latest campaign data to its Google Sheet' : 'Create a Google Sheet for this campaign and share it with the team'}
            className="flex items-center gap-2 px-4 py-2 border border-mist rounded-[10px] text-[13px] text-ink hover:border-ink/40 transition-all bg-white disabled:opacity-40 whitespace-nowrap">
            {sheetBusy ? <Loader2 size={14} className="animate-spin" /> : <FileSpreadsheet size={14} />}
            {sheetBusy ? 'Syncing…' : campaign.sheet_url ? 'Sync sheet' : 'Create sheet'}
          </button>
          {campaign.sheet_url && (
            <a href={campaign.sheet_url} target="_blank" rel="noreferrer" title="Open Google Sheet"
              className="flex items-center justify-center w-9 h-9 border border-mist rounded-[10px] text-muted hover:border-ink/30 hover:text-ink transition-all bg-white">
              <ExternalLink size={14} />
            </a>
          )}
          <button onClick={() => setShowAttach(true)}
            className="flex items-center gap-2 px-4 py-2 bg-ink text-white rounded-[10px] text-[13px] hover:bg-ink/80 transition-all whitespace-nowrap">
            <UserPlus size={14} /> Attach KOLs
          </button>
          <button onClick={load}
            className="flex items-center gap-2 px-3 py-2 border border-mist rounded-[10px] text-[13px] text-muted hover:border-ink/30 hover:text-ink transition-all bg-white">
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      <CampaignSetupPanel campaign={campaign} onSaved={(c) => setCampaign(c)} />
      <SessionsPanel
        sessions={sessions}
        onOpenSession={(id) => onOpenSession?.(id)}
        onNewSession={() => onNewSession?.(campaign)}
      />

      {total > 0 && (
        <div className="flex items-center flex-wrap gap-x-4 gap-y-1.5 mb-6 px-4 py-3 bg-surface border border-card-edge rounded-[12px]">
          <p className="text-[12px] font-mono text-muted">{total} {total === 1 ? 'KOL' : 'KOLs'}</p>
          <span className="text-mist">·</span>
          <p className="text-[12px] font-mono text-sage">{posted} posted</p>
          {shipped > 0 && <><span className="text-mist">·</span>
            <p className="text-[12px] font-mono text-muted">{shipped} shipped</p></>}
          {awaiting > 0 && <><span className="text-mist">·</span>
            <p className="text-[12px] font-mono text-muted">{awaiting} awaiting</p></>}
          {overdue > 0 && <><span className="text-mist">·</span>
            <p className="text-[12px] font-mono text-rose">{overdue} overdue</p></>}
          {optedOut > 0 && <><span className="text-mist">·</span>
            <p className="text-[12px] font-mono text-faint">{optedOut} opted out</p></>}
          <span className="text-mist">·</span>
          <p className="text-[12px] font-mono text-ink font-medium" title="posted ÷ (attached − opted out)">
            {fulfillment}% fulfilled
          </p>
        </div>
      )}

      {error && (
        <div className="mb-6 px-4 py-3 bg-rose/5 border border-rose/20 rounded-[12px] text-[12px] text-rose">{error}</div>
      )}

      {total === 0 && !error && (
        <div className="flex flex-col items-center py-20">
          <UserPlus size={30} className="text-faint mb-4" />
          <h2 className="text-[16px] font-semibold text-ink mb-2">No KOLs attached yet</h2>
          <p className="text-[13px] text-muted text-center mb-5">Attach approved KOLs from the Review Queue to start tracking them.</p>
          <button onClick={() => setShowAttach(true)}
            className="flex items-center gap-2 px-4 py-2 bg-ink text-white rounded-[10px] text-[13px] hover:bg-ink/80 transition-all">
            <UserPlus size={14} /> Attach KOLs
          </button>
        </div>
      )}

      {total > 0 && view === 'table' ? (
        <KolTable kols={kols} campaign={campaign} postsByKol={postsByKol}
          onStateChange={handleStateChange} onOverride={handleOverride} onTracking={handleTracking} onDetach={handleDetach}
          onConfirmPost={handleConfirmPost} onSetFormats={handleSetFormats} />
      ) : (
        <div className="space-y-6">
          {BOARD_ORDER.map((state) => {
            const rows = grouped[state]
            if (!rows || rows.length === 0) return null
            return (
              <div key={state}>
                <div className="flex items-center gap-2 mb-2.5">
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full ${STATE_META[state].cls}`}>{STATE_META[state].label}</span>
                  <span className="text-[11px] font-mono text-faint">{rows.length}</span>
                </div>
                <div className="space-y-2">
                  {rows.map((kol) => (
                    <KolRow key={kol.id} kol={kol} campaign={campaign}
                      posts={postsByKol[kol.id] || []} nudges={nudgesByKol[kol.id] || []}
                      onStateChange={handleStateChange} onOverride={handleOverride} onTracking={handleTracking} onShipping={handleShipping} onDetach={handleDetach}
                      onConfirmPost={handleConfirmPost} onDraftNudge={handleDraftNudge} onMarkSent={handleMarkSent}
                      onSetFormats={handleSetFormats} />
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showAttach && (
        <AttachModal
          campaignId={campaignId}
          existingHandles={existingHandles}
          onClose={() => setShowAttach(false)}
          onAttached={(n) => {
            setShowAttach(false)
            setToast({ type: 'success', message: n > 0 ? `${n} KOL${n === 1 ? '' : 's'} attached` : 'No new KOLs to attach' })
            load()
          }}
        />
      )}

      {showSfSender && (
        <SfSenderModal
          onClose={() => setShowSfSender(false)}
          onSaved={(sender) => {
            setShowSfSender(false)
            handleSfExport(sender)
          }}
        />
      )}

      {toast && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] px-4 py-3 rounded-[12px] shadow-lg text-[13px] font-medium ${
          toast.type === 'error' ? 'bg-rose text-white' : 'bg-ink text-white'}`}>
          {toast.message}
        </div>
      )}
    </div>
  )
}
