import { supabase } from './supabase'

// ── Data layer for the Campaign Ops module ───────────────────────────────────
// All reads/writes against campaigns / campaign_kols live here (mirrors how
// reviewState.js and sessionHistory.js isolate their Supabase access). Tables:
// see db/campaign_ops_schema.sql. KOLs are referenced by their Instagram handle
// (kol_handle) — kol-finder has no `kols` table; approved KOLs are JSONB on
// shared_results, keyed by username. See campaign-ops-context.md §6.

// ── Normalization ────────────────────────────────────────────────────────────
// The handle is the join/dedupe key across campaign_kols ↔ shared_results
// review_state ↔ the verification worker's scraped captions. One canonical form
// everywhere, or those silently fail to line up. Strips a leading @, markdown
// backslash-escaped underscores (\_ — the worker sees these in DM drafts), stray
// backslashes, and lowercases.
export function normalizeHandle(raw) {
  if (!raw) return ''
  return String(raw)
    .trim()
    .replace(/^@+/, '')
    .replace(/\\_/g, '_')
    .replace(/\\/g, '')
    .toLowerCase()
}

// Hashtags: drop a leading #, lowercase (match is case-insensitive per handoff).
export function normalizeHashtag(raw) {
  if (!raw) return ''
  return String(raw).trim().replace(/^#+/, '').replace(/\\/g, '').toLowerCase()
}

// Parse a free-text field (comma / space / newline separated) into a deduped
// array of normalized tokens. `kind` picks the normalizer.
export function parseTokens(text, kind = 'handle') {
  const norm = kind === 'hashtag' ? normalizeHashtag : normalizeHandle
  const seen = new Set()
  const out = []
  for (const piece of String(text || '').split(/[\s,]+/)) {
    const t = norm(piece)
    if (t && !seen.has(t)) { seen.add(t); out.push(t) }
  }
  return out
}

// ── Tier labels (display layer only) ─────────────────────────────────────────
// Stored values stay 'A'/'B' (importSheet.js sets B when budget>0, else A —
// i.e. A = gifted, B = paid). The UI shows PR/Paid. Map only at render so no
// stored record or the perftracker feed contract changes.
export const TIER_LABELS = { A: 'PR', B: 'Paid' }
export function tierLabel(tier) { return TIER_LABELS[tier] || tier || '—' }

// ── Content format per KOL (manually set; mirrors the marketing-plan sheet) ───
// feed/reel are auto-verifiable via the Apify posts scrape. story is ephemeral
// (only verifiable <24h of posting, and our scraper doesn't return stories) and
// blog is off-platform — both are manual-verify-only, never auto-flagged overdue.
export const CONTENT_FORMATS = [
  { id: 'story', label: 'story',       verifiable: false },
  { id: 'feed',  label: 'Feed (post)', verifiable: true  },
  { id: 'reel',  label: 'reel',        verifiable: true  },
  { id: 'blog',  label: 'blog',        verifiable: false },
]
// Badge palette matches the reference sheet.
export const FORMAT_BADGE_CLS = {
  story: 'bg-rose/10 text-rose',
  feed:  'bg-blue-100 text-blue-700',
  reel:  'bg-accent/25 text-[#8A6A22]',
  blog:  'bg-violet-100 text-violet-700',
}
export function formatLabel(id) {
  return (CONTENT_FORMATS.find((f) => f.id === id) || {}).label || id
}
// Auto-verifiable if at least one format is feed/reel, or none is set (default
// assumption = a feed post). Story/blog-only KOLs must be verified by hand.
export function isAutoVerifiable(formats) {
  if (!formats || !formats.length) return true
  return formats.some((f) => f === 'feed' || f === 'reel')
}

export async function setKolFormats(kolId, formats) {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase
    .from('campaign_kols')
    .update({ content_formats: formats, updated_at: new Date().toISOString() })
    .eq('id', kolId)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data
}

// ── State machine (enforced in app logic, not the DB) ────────────────────────
// approved → shipped → awaiting_post → posted | overdue | opted_out
// overdue → posted (late posts still count). Any non-terminal → opted_out.
export const KOL_STATES = ['approved', 'shipped', 'awaiting_post', 'posted', 'overdue', 'opted_out']

const TRANSITIONS = {
  approved:      ['shipped', 'opted_out'],
  shipped:       ['awaiting_post', 'opted_out'],
  awaiting_post: ['posted', 'overdue', 'opted_out'],
  overdue:       ['posted', 'opted_out'],
  posted:        ['opted_out'],
  opted_out:     ['approved'],
}

// The suggested "natural" next step (used to order the status menu). Manual
// overrides to any state are always allowed — see updateKolState.
export function canTransition(from, to) {
  return (TRANSITIONS[from] || []).includes(to)
}

export function nextStates(from) {
  return TRANSITIONS[from] || []
}

function today() {
  return new Date().toISOString().slice(0, 10) // YYYY-MM-DD for a `date` column
}

export function effectiveDeadline(kol, campaign) {
  return kol?.deadline_override || campaign?.posting_deadline || null
}

// ── Campaigns ────────────────────────────────────────────────────────────────
export async function listCampaigns() {
  if (!supabase) return []
  const { data: campaigns, error } = await supabase
    .from('campaigns')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)

  // Roll up per-campaign state counts in one query rather than N.
  const ids = (campaigns || []).map((c) => c.id)
  const counts = {}
  if (ids.length) {
    const { data: kols, error: e2 } = await supabase
      .from('campaign_kols')
      .select('campaign_id, state')
      .in('campaign_id', ids)
    if (e2) throw new Error(e2.message)
    for (const k of kols || []) {
      counts[k.campaign_id] = counts[k.campaign_id] || {}
      counts[k.campaign_id][k.state] = (counts[k.campaign_id][k.state] || 0) + 1
    }
  }
  return (campaigns || []).map((c) => ({ ...c, counts: counts[c.id] || {} }))
}

export async function getCampaign(id) {
  if (!supabase) return null
  const { data, error } = await supabase.from('campaigns').select('*').eq('id', id).single()
  if (error) throw new Error(error.message)
  return data
}

export async function createCampaign(fields) {
  if (!supabase) throw new Error('Supabase not configured')
  const payload = {
    name: fields.name?.trim(),
    brand: fields.brand?.trim(),
    market: fields.market?.trim(),
    campaign_type: fields.campaign_type || 'gifted',
    start_date: fields.start_date || null,
    posting_deadline: fields.posting_deadline,
    hashtags: fields.hashtags || [],
    mention_handles: fields.mention_handles || [],
  }
  const { data, error } = await supabase.from('campaigns').insert(payload).select('*').single()
  if (error) throw new Error(error.message)
  return data
}

export async function setCampaignStatus(id, status) {
  if (!supabase) throw new Error('Supabase not configured')
  const { error } = await supabase.from('campaigns').update({ status }).eq('id', id)
  if (error) throw new Error(error.message)
}

// ── Approved KOLs (derived from shared_results, reused from the Review Queue) ──
// Each shared_results row carries accounts[] (JSONB) + review_state (JSONB map
// keyed by username). "approved" = review_state[username].status === 'approved'.
// Deduped by handle, keeping the most recent run (rows come back newest-first).
export async function getApprovedKols() {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('shared_results')
    .select('id, campaign_brief, accounts, review_state, created_at')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)

  const byHandle = new Map()
  for (const row of data || []) {
    for (const account of row.accounts || []) {
      const entry = row.review_state?.[account.username]
      if (entry?.status !== 'approved') continue
      const handle = normalizeHandle(account.username)
      if (!handle || byHandle.has(handle)) continue // newest run wins
      byHandle.set(handle, {
        handle,
        username: account.username,
        fullName: account.fullName || '',
        aiScore: account.aiScore ?? null,
        aiReason: account.aiReason || '',
        runId: row.id,
        campaignBrief: row.campaign_brief || '',
      })
    }
  }
  return Array.from(byHandle.values())
}

// Approved KOLs for ONE seeding run (shared_results row) — used by the
// "Start campaign from a run" bridge to auto-attach without re-picking.
export async function getApprovedKolsForRun(runId) {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('shared_results')
    .select('id, accounts, review_state')
    .eq('id', runId)
    .single()
  if (error) throw new Error(error.message)

  const out = []
  const seen = new Set()
  for (const account of data.accounts || []) {
    const entry = data.review_state?.[account.username]
    if (entry?.status !== 'approved') continue
    const handle = normalizeHandle(account.username)
    if (!handle || seen.has(handle)) continue
    seen.add(handle)
    out.push({
      handle,
      username: account.username,
      fullName: account.fullName || '',
      aiScore: account.aiScore ?? null,
      aiReason: account.aiReason || '',
      runId: data.id,
    })
  }
  return out
}

// ── Campaign KOLs (the per-KOL pipeline board) ───────────────────────────────
export async function getCampaignKols(campaignId) {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('campaign_kols')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('updated_at', { ascending: true })
  if (error) throw new Error(error.message)
  return data || []
}

// Attach a set of approved KOLs. Normalizes handles, skips ones already on the
// campaign, and upsert-ignores on the (campaign_id, kol_handle) unique index as
// a race backstop. Returns the number of rows inserted.
export async function attachKols(campaignId, kols, existingHandles = []) {
  if (!supabase) throw new Error('Supabase not configured')
  const have = new Set(existingHandles.map(normalizeHandle))
  const rows = []
  const seen = new Set()
  for (const k of kols) {
    const handle = normalizeHandle(k.handle || k.username)
    if (!handle || have.has(handle) || seen.has(handle)) continue
    seen.add(handle)
    rows.push({
      campaign_id: campaignId,
      kol_handle: handle,
      kol_run_id: k.runId || null,
      tier: k.tier || 'A',
    })
  }
  if (!rows.length) return 0
  const { data, error } = await supabase
    .from('campaign_kols')
    .upsert(rows, { onConflict: 'campaign_id,kol_handle', ignoreDuplicates: true })
    .select('id')
  if (error) throw new Error(error.message)
  return data ? data.length : 0
}

// Set a KOL's state. This is a manual ops tool, so a brand manager can move a
// KOL to ANY state to correct mistakes (e.g. a false-positive `posted` back to
// `awaiting_post`) — the only guard is that it's a real state. Marking `shipped`
// stamps shipped_at if not already set.
export async function updateKolState(kol, to) {
  if (!supabase) throw new Error('Supabase not configured')
  if (!KOL_STATES.includes(to)) throw new Error(`Unknown state: ${to}`)
  if (to === kol.state) return kol
  const patch = { state: to, updated_at: new Date().toISOString() }
  if (to === 'shipped' && !kol.shipped_at) patch.shipped_at = today()
  const { data, error } = await supabase
    .from('campaign_kols')
    .update(patch)
    .eq('id', kol.id)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data
}

// ── SF Express tracking (manual — no API creds needed) ───────────────────────
// Public waybill page, localized by campaign market. The number is entered by
// hand (db/campaign_ops_sf_tracking.sql); SF's page does the actual tracking.
export function sfTrackingUrl(trackingNumber, market) {
  const num = String(trackingNumber || '').trim().replace(/\s+/g, '')
  if (!num) return null
  const locale = { HK: 'hk/tc', TW: 'tw/tc' }[String(market || '').toUpperCase()] || 'hk/en'
  return `https://htm.sf-express.com/${locale}/dynamic_function/waybill/#search/bill-number/${encodeURIComponent(num)}`
}

export async function setTrackingNumber(kolId, numberOrNull) {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase
    .from('campaign_kols')
    .update({ tracking_number: numberOrNull || null, updated_at: new Date().toISOString() })
    .eq('id', kolId)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data
}

// Recipient shipping details (db/campaign_ops_shipping.sql) — typed once here,
// exported to the SF bulk-shipment Excel (see sfBulk.js).
export async function setKolShipping(kolId, fields) {
  if (!supabase) throw new Error('Supabase not configured')
  const patch = {
    recipient_name: fields.recipient_name || null,
    recipient_phone: fields.recipient_phone || null,
    recipient_district: fields.recipient_district || null,
    recipient_area: fields.recipient_area || null,
    recipient_address: fields.recipient_address || null,
    updated_at: new Date().toISOString(),
  }
  const { data, error } = await supabase
    .from('campaign_kols')
    .update(patch)
    .eq('id', kolId)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data
}

export async function setDeadlineOverride(kolId, dateOrNull) {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase
    .from('campaign_kols')
    .update({ deadline_override: dateOrNull || null, updated_at: new Date().toISOString() })
    .eq('id', kolId)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data
}

// Bulk import for historical/spreadsheet data: inserts campaign_kols with full
// state (fee, tier, dates, notes) and logs verified_posts for any row that
// already has a post URL (marked human_verified — a person recorded it).
// Idempotent-ish: re-running skips KOLs already on the campaign and posts whose
// shortcode already exists. Returns { kols, posts } counts.
export async function importCampaignKols(campaignId, rows) {
  if (!supabase) throw new Error('Supabase not configured')
  if (!rows.length) return { kols: 0, posts: 0 }

  const kolPayload = rows.map((r) => ({
    campaign_id: campaignId,
    kol_handle: r.handle,
    tier: r.tier || 'A',
    agreed_fee: r.agreed_fee || 0,
    state: r.state || 'approved',
    shipped_at: r.shipped_at || null,
    notes: r.notes || null,
  }))
  const { error: e1 } = await supabase
    .from('campaign_kols')
    .upsert(kolPayload, { onConflict: 'campaign_id,kol_handle', ignoreDuplicates: true })
  if (e1) throw new Error(e1.message)

  // Re-read to map handle → id (covers KOLs that already existed on the campaign).
  const { data: allKols, error: e2 } = await supabase
    .from('campaign_kols').select('id, kol_handle').eq('campaign_id', campaignId)
  if (e2) throw new Error(e2.message)
  const idByHandle = new Map((allKols || []).map((k) => [k.kol_handle, k.id]))

  const posts = []
  for (const r of rows) {
    if (!r.post_url) continue
    const kid = idByHandle.get(r.handle)
    if (!kid) continue
    posts.push({
      campaign_kol_id: kid,
      post_url: r.post_url,
      post_shortcode: r.post_shortcode || null,
      posted_at: r.posted_at || null,
      detection_method: 'manual',
      matched_signals: [],
      human_verified: true,
    })
  }

  let postsInserted = 0
  // Posts with a shortcode dedupe on the unique index; null-shortcode posts
  // can't (nulls never conflict), so plain-insert those.
  const withCode = posts.filter((p) => p.post_shortcode)
  const noCode = posts.filter((p) => !p.post_shortcode)
  if (withCode.length) {
    const { data, error } = await supabase.from('verified_posts')
      .upsert(withCode, { onConflict: 'post_shortcode', ignoreDuplicates: true }).select('id')
    if (error) throw new Error(error.message)
    postsInserted += data ? data.length : 0
  }
  if (noCode.length) {
    const { data, error } = await supabase.from('verified_posts').insert(noCode).select('id')
    if (error) throw new Error(error.message)
    postsInserted += data ? data.length : 0
  }
  return { kols: kolPayload.length, posts: postsInserted }
}

// ── Verified posts (Phase 2 — written by the verification worker or import) ───
// Returns a map: campaign_kol_id → array of its verified_posts (newest first).
export async function getVerifiedPostsByKol(kolIds) {
  if (!supabase || !kolIds?.length) return {}
  const { data, error } = await supabase
    .from('verified_posts')
    .select('*')
    .in('campaign_kol_id', kolIds)
    .order('posted_at', { ascending: false, nullsFirst: false })
  if (error) throw new Error(error.message)
  const byKol = {}
  for (const p of data || []) (byKol[p.campaign_kol_id] = byKol[p.campaign_kol_id] || []).push(p)
  return byKol
}

// The Phase 2 safety toggle: the worker sets state=posted but leaves
// human_verified=false; a brand manager confirms a match is genuine here.
export async function setHumanVerified(postId, verified) {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase
    .from('verified_posts')
    .update({ human_verified: !!verified })
    .eq('id', postId)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data
}

// ── Nudges (overdue reminder drafts — copy-paste send only) ───────────────────
export async function getNudgesByKol(kolIds) {
  if (!supabase || !kolIds?.length) return {}
  const { data, error } = await supabase
    .from('nudges')
    .select('*')
    .in('campaign_kol_id', kolIds)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  const byKol = {}
  for (const n of data || []) (byKol[n.campaign_kol_id] = byKol[n.campaign_kol_id] || []).push(n)
  return byKol
}

export async function saveNudge(campaignKolId, draftText, language) {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase
    .from('nudges')
    .insert({ campaign_kol_id: campaignKolId, draft_text: draftText, language })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data
}

export async function markNudgeSent(nudgeId) {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase
    .from('nudges')
    .update({ sent_manually_at: new Date().toISOString() })
    .eq('id', nudgeId)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data
}

// ── Google Sheet export (Phase 4 — one-way push, one sheet per campaign) ──────
const SHEET_STATE_LABELS = {
  approved: 'Approved', shipped: 'Shipped', awaiting_post: 'Awaiting post',
  posted: 'Posted', overdue: 'Overdue', opted_out: 'Opted out',
}

// Pull the scoring account object (from shared_results.accounts) for each KOL's
// approval run, keyed by normalized handle. Empty for imported KOLs with no run.
export async function getScoringByHandle(kols) {
  if (!supabase) return {}
  const runIds = [...new Set((kols || []).map((k) => k.kol_run_id).filter(Boolean))]
  if (!runIds.length) return {}
  const { data, error } = await supabase.from('shared_results').select('id, accounts').in('id', runIds)
  if (error) throw new Error(error.message)
  const byHandle = {}
  for (const row of data || []) {
    for (const acc of row.accounts || []) {
      const h = normalizeHandle(acc.username)
      if (h && !byHandle[h]) byHandle[h] = acc
    }
  }
  return byHandle
}

// Assemble the 2D grid the worker writes to the campaign's Google Sheet: the
// campaign-ops columns (from campaign_kols + verified_posts) plus the post's
// engagement snapshot. scoreByHandle (from shared_results) supplies only the
// full name — no scoring columns in the sheet by design. First row = headers.
// Header names matter: the worker locates the Status/Tier dropdown columns and
// the date columns by these exact strings (SHEET_DROPDOWNS/SHEET_DATE_COLUMNS
// in worker.js).
export function buildCampaignSheetValues(campaign, kols, postsByKol = {}, scoreByHandle = {}) {
  const headers = [
    'Handle', 'Full name', 'Tier', 'Format', 'Status', 'Shipped', 'Tracking #',
    'Deadline', 'Post URL', 'Posted at', 'Verified', 'Likes', 'Comments', 'Views',
    'Eng. updated',
  ]
  const day = (v) => (v ? String(v).slice(0, 10) : '')
  const rows = (kols || []).map((k) => {
    const acc = scoreByHandle[normalizeHandle(k.kol_handle)] || {}
    const post = (postsByKol[k.id] || [])[0] || null
    return [
      k.kol_handle,
      acc.fullName || '',
      k.tier ? tierLabel(k.tier) : '', // blank (not '—') so the dropdown stays clean
      (k.content_formats || []).map(formatLabel).join(', '),
      SHEET_STATE_LABELS[k.state] || k.state,
      day(k.shipped_at),
      // Leading ' keeps an all-digit waybill number as text under USER_ENTERED
      // (otherwise Sheets renders it 1.23E+11).
      k.tracking_number ? (/^\d+$/.test(k.tracking_number) ? `'${k.tracking_number}` : k.tracking_number) : '',
      day(effectiveDeadline(k, campaign)),
      post?.post_url || '',
      day(post?.posted_at),
      post ? (post.human_verified ? 'Yes' : 'Detected') : '',
      post?.likes_count ?? '',
      post?.comments_count ?? '',
      post?.views_count ?? '',
      day(post?.engagement_updated_at),
    ].map((v) => (v == null ? '' : String(v)))
  })
  return { title: `${campaign.name} Seeding`, values: [headers, ...rows] }
}

export async function detachKol(kolId) {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase
    .from('campaign_kols')
    .delete()
    .eq('id', kolId)
    .select('id')
  if (error) throw new Error(error.message)
  if (!data || data.length === 0) {
    throw new Error('Remove was blocked (0 rows) — check Supabase permissions')
  }
}
