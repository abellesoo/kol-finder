import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

// Make a non-<button> element (a clickable row/card) keyboard-operable. Spread
// the result onto the element together with the same onClick:
//   <div onClick={open} {...clickableRow(open)}>
// It adds role/tabIndex and fires the handler on Enter/Space so keyboard and
// screen-reader users get the same affordance as mouse users.
export function clickableRow(onActivate) {
  return {
    role: 'button',
    tabIndex: 0,
    onKeyDown: (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        onActivate(e)
      }
    },
  }
}

// One canonical date format across the app (was split between en-GB and en-US,
// so the same campaign read "24 Jul 2026" on the Dashboard and "Jul 24, 2026" on
// the Campaigns page). Markato is HK-based → day-month-year.
export function formatDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

// Date + time, for the seeder session history where the clock matters.
export function formatDateTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  return (
    d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) +
    ' · ' +
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  )
}

// Roll a campaign's per-state counts up to the numbers the cards/table/dashboard
// show. Was duplicated verbatim in DashboardPage and CampaignsPage.
// Coerce a campaign's assigned_to to an id array. Tolerates the pre-migration
// scalar uuid (db/campaign_multi_assignee.sql) and null, so the "mine" filters
// never run .includes() against a bare string (substring match → false owners).
export const toIdArray = (v) => (Array.isArray(v) ? v : v ? [v] : [])

export function campaignMetrics(c) {
  const counts = c.counts || {}
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  const posted = counts.posted || 0
  const overdue = counts.overdue || 0
  // Opted-out KOLs are dropped from the denominator so fulfilment reflects who
  // could still post — matching CampaignDetailPage's header. Otherwise the card
  // ring and the detail page disagree for any campaign with opt-outs.
  const optedOut = counts.opted_out || 0
  const eligible = total - optedOut
  return { total, posted, overdue, optedOut, eligible, fulfilled: eligible > 0 ? Math.round((posted / eligible) * 100) : 0 }
}

// Group rows by their campaign (campaigns in listing order, only those with
// rows) plus a trailing "Unassigned" bucket for rows with no campaign or one
// that no longer exists. `getId` reads the campaign id off a row — it differs
// per source (`campaign_id` on review submissions, `campaignId` on seeder
// sessions / ready-to-send groups). Returns `[{ id, name, items }]`.
export function groupByCampaign(rows, campaigns, getId) {
  const byId = new Map()
  const unassigned = []
  for (const r of rows) {
    const cid = getId(r) || null
    if (!cid) { unassigned.push(r); continue }
    if (!byId.has(cid)) byId.set(cid, [])
    byId.get(cid).push(r)
  }
  const groups = []
  for (const c of campaigns) {
    const items = byId.get(c.id)
    if (items && items.length) groups.push({ id: c.id, name: c.name, items })
  }
  const known = new Set(campaigns.map((c) => c.id))
  for (const [cid, items] of byId) if (!known.has(cid)) unassigned.push(...items)
  if (unassigned.length) groups.push({ id: null, name: 'Unassigned', items: unassigned })
  return groups
}
