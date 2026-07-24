import { supabase } from './supabase'
import { reviewKey } from './reviewState'
import { presetToForm, presetToScrape } from './inputDatabank'

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
  feed:  'bg-info-tint text-info',
  reel:  'bg-accent/25 text-[#8A6A22]',
  blog:  'bg-plum-tint text-plum',
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

  // Seeder-session count per campaign — same one-query rollup as the KOL counts.
  const sessionCounts = {}
  if (ids.length) {
    const { data: sess, error: e3 } = await supabase
      .from('sessions')
      .select('campaign_id')
      .in('campaign_id', ids)
    if (e3) throw new Error(e3.message)
    for (const s of sess || []) {
      if (s.campaign_id) sessionCounts[s.campaign_id] = (sessionCounts[s.campaign_id] || 0) + 1
    }
  }

  return (campaigns || []).map((c) => ({
    ...c,
    counts: counts[c.id] || {},
    sessionCount: sessionCounts[c.id] || 0,
  }))
}

export async function getCampaign(id) {
  if (!supabase) return null
  const { data, error } = await supabase.from('campaigns').select('*').eq('id', id).single()
  if (error) throw new Error(error.message)
  return data
}

// Create a campaign. As of the seeding-setup unification a campaign is created
// at Step 1 (before deadline / market are known), so posting_deadline and the
// ops fields are optional; brand_id + default_step1/step2 carry the saved setup.
export async function createCampaign(fields) {
  if (!supabase) throw new Error('Supabase not configured')
  const payload = {
    name: fields.name?.trim(),
    brand: fields.brand?.trim() || null,
    brand_id: fields.brand_id || null,
    market: fields.market?.trim() || null,
    campaign_type: fields.campaign_type || 'gifted',
    start_date: fields.start_date || null,
    posting_deadline: fields.posting_deadline || null,
    hashtags: fields.hashtags || [],
    mention_handles: fields.mention_handles || [],
    default_step1: fields.default_step1 || {},
    default_step2: fields.default_step2 || {},
    product: fields.product?.trim() || null,
  }
  const { data, error } = await supabase.from('campaigns').insert(payload).select('*').single()
  if (error) throw new Error(error.message)
  return data
}

// Edit a campaign's saved setup defaults — the copied-defaults source. Affects
// FUTURE sessions only; existing sessions keep their own config snapshot. Only
// the keys present in `fields` are touched.
export async function updateCampaignSetup(id, fields) {
  if (!supabase) throw new Error('Supabase not configured')
  const patch = {}
  if (fields.name !== undefined) patch.name = fields.name?.trim()
  if (fields.brand !== undefined) patch.brand = fields.brand?.trim() || null
  if (fields.brand_id !== undefined) patch.brand_id = fields.brand_id || null
  if (fields.product !== undefined) patch.product = fields.product?.trim() || null
  if (fields.default_step1 !== undefined) patch.default_step1 = fields.default_step1 || {}
  if (fields.default_step2 !== undefined) patch.default_step2 = fields.default_step2 || {}
  const { data, error } = await supabase.from('campaigns').update(patch).eq('id', id).select('*').single()
  if (error) throw new Error(error.message)
  return data
}

// Save the generated DM outreach copy (Initial/Reply/Follow-up × EN/ZH) shown on
// the campaign's "DM messages" sheet tab.
export async function saveDmMessages(id, dm) {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase
    .from('campaigns')
    .update({ dm_messages: dm || {} })
    .eq('id', id)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data
}

export async function setCampaignStatus(id, status) {
  if (!supabase) throw new Error('Supabase not configured')
  const { error } = await supabase.from('campaigns').update({ status }).eq('id', id)
  if (error) throw new Error(error.message)
}

// ── Assignment ───────────────────────────────────────────────────────────────
// Assign a campaign to zero or more teammates. Reviews and ops for the campaign
// inherit these owners; a campaign is "mine" when the caller is any of them.
// Pass an array of user ids (empty → Unassigned). Requires
// db/campaign_assignee.sql + db/campaign_multi_assignee.sql (uuid[] column).
export async function setCampaignAssignees(id, userIds) {
  if (!supabase) throw new Error('Supabase not configured')
  const list = (Array.isArray(userIds) ? userIds : userIds ? [userIds] : []).filter(Boolean)
  const { data, error } = await supabase
    .from('campaigns')
    .update({ assigned_to: list.length ? list : null })
    .eq('id', id)
    .select('id')
  if (error) throw new Error(error.message)
  if (!data || data.length === 0) {
    throw new Error('Assignment was blocked (0 rows updated) — check Supabase permissions')
  }
}

// The team members a campaign can be assigned to (everyone who has signed in).
// Fetched via a SECURITY DEFINER RPC because users is self-read-only under RLS.
// Cached module-side: several views (Campaigns, Review Queue, Dashboard) need
// the same small roster, so they share one request per page load.
let _assignablePromise = null
export function listAssignableUsers({ force = false } = {}) {
  if (!supabase) return Promise.resolve([])
  if (force) _assignablePromise = null
  if (!_assignablePromise) {
    _assignablePromise = supabase
      .rpc('list_assignable_users')
      .then(({ data, error }) => {
        if (error) { _assignablePromise = null; throw new Error(error.message) }
        return data || []
      })
      .catch((e) => { _assignablePromise = null; throw e })
  }
  return _assignablePromise
}

// Delete a campaign. Its attached pipeline KOLs (campaign_kols → verified_posts,
// nudges) cascade away, but Seeder sessions and review submissions survive —
// their campaign_id is FK'd ON DELETE SET NULL, so they simply return to the
// "Unassigned" group. No seeding or review data is lost.
export async function deleteCampaign(id) {
  if (!supabase) throw new Error('Supabase not configured')
  const { data, error } = await supabase.from('campaigns').delete().eq('id', id).select('id')
  if (error) throw new Error(error.message)
  if (!data || data.length === 0) {
    throw new Error('Delete was blocked (0 rows removed) — check Supabase permissions')
  }
}

// ── Campaign setup: picker source + form-shape adapters ──────────────────────
// The Step 1 campaign picker needs brands with their campaigns nested — the same
// shape loadDatabank() returned (brands → children), so the launcher UI is
// reused. Newest campaign first under each brand.
export async function loadCampaignsByBrand() {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('brands')
    .select('id, name, background, products, updated_at, campaigns:campaigns(id, name, status, default_step1, default_step2, created_at)')
    .order('updated_at', { ascending: false })
  if (error) {
    console.error('Failed to load campaigns by brand', error)
    return []
  }
  const touched = (c) => Date.parse(c.created_at || 0) || 0
  return (data || []).map((b) => ({
    ...b,
    campaigns: (b.campaigns || []).sort((a, z) => touched(z) - touched(a)),
  }))
}

// A single brand row (facts live here; setup lives on the campaign). Used to
// build a new-session prefill from a campaign.
export async function getBrandById(id) {
  if (!supabase || !id) return null
  const { data, error } = await supabase
    .from('brands')
    .select('id, name, background, products')
    .eq('id', id)
    .single()
  if (error) throw new Error(error.message)
  return data
}

// Update a brand's durable facts (background / product catalogue). Brand facts
// are shared across the brand's campaigns; the campaign brief editor writes them
// here (decomposed from the tidied brief) so scoring picks them up.
export async function updateBrandFacts(brandId, { background, products } = {}) {
  if (!supabase || !brandId) return null
  const patch = {}
  if (background !== undefined) patch.background = background || ''
  if (products !== undefined) patch.products = Array.isArray(products) ? products : []
  if (Object.keys(patch).length === 0) return null
  const { data, error } = await supabase.from('brands').update(patch).eq('id', brandId).select('id').single()
  if (error) throw new Error(error.message)
  return data
}

// Find-or-create a brand by name (citext unique ⇒ idempotent upsert). Used when
// starting a new campaign under a brand that may not exist yet. Returns the row.
export async function getOrCreateBrand(name) {
  if (!supabase) throw new Error('Supabase not configured')
  const n = String(name || '').trim()
  if (!n) return null
  const { data, error } = await supabase
    .from('brands')
    .upsert({ name: n }, { onConflict: 'name' })
    .select('id, name, background, products')
    .single()
  if (error) throw new Error(error.message)
  return data
}

// A campaign's default_step1/default_step2 use the SAME JSON shapes brand_presets
// did, so the databank's adapters map them straight into the Seeder form —
// campaignToForm fills the scoring config (+ brand facts), campaignToScrape the
// scrape inputs. Reused so there's one prefill code path, not two.
export function campaignToForm(brand, campaign) {
  const b = brand || { name: campaign?.brand || '', background: '', products: [] }
  return presetToForm(b, { step2: campaign?.default_step2 || {} })
}
export function campaignToScrape(campaign) {
  return presetToScrape({ step1: campaign?.default_step1 || {} })
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
      // Campaign Ops is Instagram-only end-to-end (kol_handle = IG handle, the
      // verification worker scrapes instagram.com) — Threads approvals stay in
      // the review queue and never flow into campaigns until that's built.
      if (account.platform === 'threads') continue
      const entry = row.review_state?.[reviewKey(account)]
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
    if (account.platform === 'threads') continue // Campaign Ops is IG-only (see getApprovedKols)
    const entry = data.review_state?.[reviewKey(account)]
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

// Set a KOL's state. This is a manual ops tool, so a reviewer can move a
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
  const { data: insertedKols, error: e1 } = await supabase
    .from('campaign_kols')
    .upsert(kolPayload, { onConflict: 'campaign_id,kol_handle', ignoreDuplicates: true })
    .select('id')
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
  return { kols: insertedKols ? insertedKols.length : 0, posts: postsInserted }
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
// human_verified=false; a reviewer confirms a match is genuine here.
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

// Also pull each KOL's review metadata (dm_status) from shared_results.review_state,
// keyed by normalized handle — drives the Reach-Out / Plan status columns. Keys in
// review_state are the reviewKey ("username" or "threads:username"); we strip the
// platform prefix so it lines up with kol_handle.
export async function getReviewMetaByHandle(kols) {
  if (!supabase) return {}
  const runIds = [...new Set((kols || []).map((k) => k.kol_run_id).filter(Boolean))]
  if (!runIds.length) return {}
  const { data, error } = await supabase.from('shared_results').select('id, review_state').in('id', runIds)
  if (error) throw new Error(error.message)
  const byHandle = {}
  for (const row of data || []) {
    for (const [key, v] of Object.entries(row.review_state || {})) {
      if (key.startsWith('__') || !v || typeof v !== 'object') continue
      const h = normalizeHandle(String(key).replace(/^threads:/, ''))
      if (h && !byHandle[h]) byHandle[h] = v
    }
  }
  return byHandle
}

// ── Sheet vocabulary + colours (from Annabelle's "Marketing Campaign Template") ─
// The worker replicates the dropdown chip colours with per-value cell background
// (conditional formatting) since the Sheets API can't set chip colours directly.
export const SHEET_TITLE_SUFFIX = '_Marketing Plan'
const HEADER_FILL = '#434343'
// Light fills so black text stays readable; "Not sent" is the lone dark chip.
const CLR = {
  grey: '#EFEFEF', red: '#F4CCCC', redStrong: '#EA9999', orange: '#FCE5CD',
  yellow: '#FFF2CC', blue: '#CFE2F3', blueStrong: '#9FC5E8', green: '#D9EAD3',
  pink: '#EAD1DC', purple: '#D9D2E9', black: '#434343',
}
export const CATEGORY_OPTIONS = ['Fashion', 'Beauty', 'Lifestyle', 'Foodie']
const CATEGORY_COLORS = { Fashion: CLR.red, Beauty: CLR.orange, Lifestyle: CLR.blue, Foodie: CLR.green }
const FORMAT_OPTIONS = ['story', 'reel', 'feed (post)', '4 week boosting', 'blog']
const FORMAT_COLORS = { story: CLR.red, reel: CLR.yellow, 'feed (post)': CLR.blue, '4 week boosting': CLR.orange, blog: CLR.pink }
const PLAN_STATUS_OPTIONS = ['Reached out', 'Product shipped', 'WIP', '1st Draft', 'Pending Review', 'Ready to-launch', 'Launched', 'Paid']
const PLAN_STATUS_COLORS = { 'Reached out': CLR.grey, 'Product shipped': CLR.blue, WIP: CLR.yellow, '1st Draft': CLR.orange, 'Pending Review': CLR.red, 'Ready to-launch': CLR.pink, Launched: CLR.green, Paid: CLR.redStrong }
const PAYMENT_OPTIONS = ['Pending', 'Paid', 'No payment required']
const PAYMENT_COLORS = { Pending: CLR.orange, Paid: CLR.redStrong, 'No payment required': CLR.grey }
const SHIP_STATUS_OPTIONS = ['Not Yet Shipped', 'Shipped']
const SHIP_STATUS_COLORS = { 'Not Yet Shipped': CLR.yellow, Shipped: CLR.purple }
const REACHOUT_OPTIONS = ['Sent', 'Accept', 'Reject', 'Waiting for reply', 'To Review', 'Posted', 'Shipped', 'no reply after follow-up', 'Not sent']
const REACHOUT_COLORS = { Sent: CLR.grey, Accept: CLR.green, Reject: CLR.red, 'Waiting for reply': CLR.blue, 'To Review': CLR.blueStrong, Posted: CLR.yellow, Shipped: CLR.purple, 'no reply after follow-up': CLR.blue, 'Not sent': CLR.black }
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// campaign_kols content_format ids → the sheet's Format vocab.
const FORMAT_ID_TO_SHEET = { story: 'story', feed: 'feed (post)', reel: 'reel', blog: 'blog' }

function platformOf(acc) {
  return String(acc?.platform || '').toLowerCase().includes('thread') ? 'Threads' : 'IG'
}
function freePaid(k) { return k.tier === 'B' ? 'Paid' : 'Free' }
function shippingAddress(k) {
  return [k.recipient_address, k.recipient_district, k.recipient_area].filter(Boolean).join(', ')
}
function sheetFormats(k) {
  return (k.content_formats || []).map((f) => FORMAT_ID_TO_SHEET[f] || f).join(', ')
}
// Best-effort auto-map of the creator's detected niche → the 4 template categories;
// falls back to the brand's category, then blank (a manual dropdown pick).
function categoryFor(acc, campaign) {
  const tags = [].concat(acc.niche_signals || [], acc.niche_tags || []).join(' ').toLowerCase()
  const brand = String(campaign?.brand || '').toLowerCase()
  const t = `${tags} ${brand}`
  if (/beauty|skincare|makeup|cosmet|derma/.test(t)) return 'Beauty'
  if (/fashion|style|ootd|apparel|outfit/.test(t)) return 'Fashion'
  if (/food|eat|restaurant|foodie|dining|cafe/.test(t)) return 'Foodie'
  if (/life|travel|daily|vlog|mom|parent/.test(t)) return 'Lifestyle'
  return ''
}
// approved ≠ "Reached out": approval only means the KOL appears on the sheet.
// "Reached out" means the DM was actually sent (dm_status).
function planStatus(k, dm) {
  switch (k.state) {
    case 'posted': return 'Launched'
    case 'overdue':
    case 'awaiting_post': return 'WIP'
    case 'shipped': return 'Product shipped'
    case 'approved': return dm === 'sent' || dm === 'replied' ? 'Reached out' : ''
    default: return '' // opted_out & anything terminal → blank
  }
}
function reachOutStatus(k, dm) {
  if (k.state === 'posted') return 'Posted'
  if (k.state === 'shipped') return 'Shipped'
  if (k.state === 'opted_out') return 'Reject'
  switch (dm) {
    case 'sent': return 'Sent'
    case 'replied': return 'Accept'
    case 'no_response': return 'no reply after follow-up'
    default: return 'Not sent'
  }
}
const s = (v) => (v == null ? '' : v)
const day = (v) => (v ? String(v).slice(0, 10) : '')
// Leading ' keeps all-digit waybills as text under USER_ENTERED (else 1.23E+11).
const asText = (v) => (v && /^\d+$/.test(String(v)) ? `'${v}` : s(v))

// Build the multi-tab workbook the worker writes to the campaign's Google Sheet
// ("<Campaign>_Marketing Plan"). Each tab carries its own styling metadata so the
// worker stays generic:
//   keyCol      – column used to preserve manual cells across re-syncs (by value)
//   manualCols  – columns the sync must NOT overwrite (seeded on create, then owned
//                 by the human in the sheet)
//   dropdowns   – { colIndex: [options] }   colorRules – { colIndex: { value: hex } }
//   dateCols    – columns to format as dates
//   sectionRows – row indices (within rows[]) that are bold section separators
//   greenCols   – columns filled pale-green (the Month block)
//   blackBarTop – text for a black full-width bar inserted above the header
//   headerFills – { colIndex: hex } per-column header colour overrides
// One-way push; rows are ordered deterministically (bucket → handle) so manual
// cells stay aligned with the same KOL across syncs.
export function buildCampaignSheetValues(campaign, kols, postsByKol = {}, scoreByHandle = {}, reviewByHandle = {}) {
  const items = (kols || [])
    .map((k) => {
      const h = normalizeHandle(k.kol_handle)
      return { k, h, acc: scoreByHandle[h] || {}, rv: reviewByHandle[h] || {}, post: (postsByKol[k.id] || [])[0] || null }
    })
    .sort((a, b) => (a.h < b.h ? -1 : a.h > b.h ? 1 : 0))

  // ── Tab: All approved ──────────────────────────────────────────────────────
  const allApproved = {
    name: 'All approved',
    headers: ['IG/ Threads', 'Username', 'Category', 'Followers', 'Link to Account', 'Remarks', 'Shipping Address', 'Other brands', 'Free/ Paid', 'Amount (if paid)', 'Reach-Out Status'],
    keyCol: 1,
    manualCols: [5, 7], // Remarks, Other brands
    dropdowns: { 2: CATEGORY_OPTIONS, 8: ['Free', 'Paid'], 10: REACHOUT_OPTIONS },
    colorRules: { 2: CATEGORY_COLORS, 10: REACHOUT_COLORS },
    headerFill: HEADER_FILL,
    rows: items.map(({ k, acc, rv }) => [
      platformOf(acc), k.kol_handle, categoryFor(acc, campaign), s(acc.follower_count),
      acc.instagram_url || acc.profile_url || '', '', shippingAddress(k), '',
      freePaid(k), k.tier === 'B' ? s(k.agreed_fee) : '', reachOutStatus(k, rv.dm_status),
    ]),
  }

  // ── Tab: Marketing Plan Master (grouped by platform bucket) ─────────────────
  const SECTIONS = ['IG Seeding', 'Threads Seeding', 'Reels', 'Media', 'Ad']
  const bucketOf = ({ acc }) => (platformOf(acc) === 'Threads' ? 'Threads Seeding' : 'IG Seeding')
  const planRows = []
  const sectionRows = []
  for (const sec of SECTIONS) {
    sectionRows.push(planRows.length)
    planRows.push(['', '', '', sec, '', '$0.00', '', '', '', '', '', '', ''])
    if (sec === 'IG Seeding' || sec === 'Threads Seeding') {
      items.filter((it) => bucketOf(it) === sec).forEach(({ k, rv, post }, i) => {
        planRows.push([
          '', '', i + 1, k.kol_handle, sheetFormats(k),
          s(k.agreed_fee ?? k.product_value), planStatus(k, rv.dm_status),
          day(post?.posted_at), post?.post_url || '', '',
          s(k.notes), freePaid(k) === 'Free' ? 'No payment required' : 'Pending', '',
        ])
      })
    }
  }
  if (planRows.length) planRows[0][0] = campaign?.start_date ? MONTHS[+campaign.start_date.slice(5, 7) - 1] || '' : ''
  const planMaster = {
    name: 'Marketing Plan Master',
    headers: ['Month', 'Monthly Total', '#', 'Handle', 'Format', 'Budget', 'Status', 'Launch Date', 'Launch Link', 'Link', 'Remarks', 'Payment', 'Payment Details'],
    keyCol: 3, // Handle
    manualCols: [0, 1, 9, 11, 12], // Month, Monthly Total, Link, Payment, Payment Details
    sectionRows,
    greenCols: [0, 1],
    dropdowns: { 4: FORMAT_OPTIONS, 6: PLAN_STATUS_OPTIONS, 11: PAYMENT_OPTIONS },
    colorRules: { 4: FORMAT_COLORS, 6: PLAN_STATUS_COLORS, 11: PAYMENT_COLORS },
    dateCols: [7], // Launch Date
    headerFill: HEADER_FILL,
    rows: planRows,
  }

  // ── Tab: Shipment Record (black "Date" bar above the header) ────────────────
  const shipment = {
    name: 'Shipment Record',
    headers: ['#', 'Name', 'Address', 'Phone Number', 'Product', 'Status', 'Remarks', 'SF Tracking'],
    blackBarTop: 'Date',
    keyCol: 1, // Name (falls back to positional when blank)
    manualCols: [6], // Remarks
    dropdowns: { 5: SHIP_STATUS_OPTIONS },
    colorRules: { 5: SHIP_STATUS_COLORS },
    headerFill: HEADER_FILL,
    rows: items.map(({ k }, i) => [
      i + 1, s(k.recipient_name), shippingAddress(k), s(k.recipient_phone),
      s(campaign?.product), k.shipped_at ? 'Shipped' : 'Not Yet Shipped', '', asText(k.tracking_number),
    ]),
  }

  // ── Tab: DM messages (generated from the brief — filled in Phase B) ─────────
  const dm = campaign?.dm_messages || {}
  const dmTab = {
    name: 'DM messages',
    headers: ['Type', 'Reach-out Message 【英】', 'Reach-out Message 【中】'],
    headerFills: { 1: '#4A86E8', 2: '#C27BA0' },
    keyCol: 0,
    manualCols: [],
    headerFill: HEADER_FILL,
    rows: [
      ['Initial DM', s(dm.initial?.en), s(dm.initial?.zh)],
      ['Reply', s(dm.reply?.en), s(dm.reply?.zh)],
      ['Follow-up', s(dm.followup?.en), s(dm.followup?.zh)],
    ],
  }

  return { title: `${campaign.name}${SHEET_TITLE_SUFFIX}`, tabs: [allApproved, planMaster, shipment, dmTab] }
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
