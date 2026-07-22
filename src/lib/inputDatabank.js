// Shared "input databank" v2 — a team-wide, Supabase-backed store of Seeder
// run inputs, split into two levels:
//
//   brand   durable facts (name / background / product catalogue) in real
//           columns on public.brands
//   preset  one saved run per campaign under a brand: Get-Data scrape inputs
//           (step1) + the campaign half of the scoring form (step2), both
//           whitelisted JSON on public.brand_presets
//
// Loading a brand prefills only the brand fields; loading a preset prefills
// everything (brand + campaign config + scrape inputs). Saving upserts both
// levels through real unique constraints — no read-then-write race — and the
// DB keeps a revision of every overwritten row (db/input_databank_v2.sql), so
// a save never destroys the previous inputs.
//
// When Supabase isn't configured (local dev), every call degrades to a no-op
// so the seeder still works without a databank.

import { supabase } from './supabase'

// Field whitelists — keep rows clean snapshots and prevent an unrelated form
// field from leaking in. Mirrors the state each step owns. Brand fields live
// in brands columns, never inside step2.
const STEP1_FIELDS = ['tab', 'platforms', 'scrapeInput', 'painpointInput', 'genreInput', 'resultsLimit']
const CAMPAIGN_FIELDS = [
  'niches', 'targetAudience', 'targetKeywords', 'excludeKeywords',
  'locationTarget', 'minEngagement',
  'newProduct', 'collabFormat', 'briefNotes',
]

// Defaults for a full preset load: an old row missing a newer field must reset
// that field, not leave whatever the previous brand's run put there.
const CAMPAIGN_DEFAULTS = {
  niches: [], targetAudience: '', targetKeywords: '', excludeKeywords: '',
  locationTarget: 'Hong Kong', minEngagement: 0,
  newProduct: '', collabFormat: '', briefNotes: '',
}

function pick(obj, fields) {
  const out = {}
  if (obj) for (const k of fields) if (obj[k] !== undefined) out[k] = obj[k]
  return out
}

// ── Form-shape adapters ─────────────────────────────────────────────────────
// ConfigStep.applyConfig only touches the keys present in the object, so these
// decide the load granularity.

// Brand-only prefill: just the three brand fields.
export function brandToForm(brand) {
  return {
    brandName: brand.name || '',
    brandBackground: brand.background || '',
    products: Array.isArray(brand.products) && brand.products.length
      ? brand.products
      : [{ name: '', points: '' }],
  }
}

// Full prefill: complete step-2 form (campaign defaults ← saved campaign
// fields ← brand facts), sanitized through the whitelist so a stale key from
// an old schema never reaches the form.
export function presetToForm(brand, preset) {
  return {
    ...CAMPAIGN_DEFAULTS,
    ...pick(preset?.step2, CAMPAIGN_FIELDS),
    ...brandToForm(brand),
  }
}

export function presetToScrape(preset) {
  return pick(preset?.step1, STEP1_FIELDS)
}

// ── Queries ─────────────────────────────────────────────────────────────────

// Brands with their presets nested, newest-touched first at both levels.
export async function loadDatabank() {
  if (!supabase) return []
  const { data, error } = await supabase
    .from('brands')
    .select('id, name, background, products, updated_at, presets:brand_presets(id, name, step1, step2, updated_at, last_used_at)')
    .order('updated_at', { ascending: false })
  if (error) {
    console.error('Failed to load input databank', error)
    return []
  }
  const lastTouched = (p) => Math.max(Date.parse(p.last_used_at || 0) || 0, Date.parse(p.updated_at) || 0)
  return (data || []).map((b) => ({
    ...b,
    presets: (b.presets || []).sort((a, z) => lastTouched(z) - lastTouched(a)),
  }))
}

// Upsert brand + preset in one save. Brand facts are pulled out of the step-2
// form (`config`); the campaign remainder plus scrape inputs go on the preset.
// Unique constraints (brands.name, brand_presets(brand_id, name)) make this
// atomic per level — two teammates saving "Wellage" at once both land as
// updates instead of one erroring. Returns the refreshed databank.
export async function saveDatabankEntry({ presetName, step1, step2 }) {
  if (!supabase) throw new Error('Databank needs Supabase — not configured in this environment.')
  const brandName = String(step2?.brandName || '').trim()
  if (!brandName) throw new Error('Brief needs a 「品牌：…」 line first (自動整理 adds it for you) — entries are filed by brand.')

  const { data: brand, error: brandError } = await supabase
    .from('brands')
    .upsert(
      {
        name: brandName,
        background: String(step2?.brandBackground || '').trim(),
        products: Array.isArray(step2?.products) ? step2.products : [],
      },
      { onConflict: 'name' }
    )
    .select('id')
    .single()
  if (brandError) throw new Error(brandError.message)

  const { error: presetError } = await supabase
    .from('brand_presets')
    .upsert(
      {
        brand_id: brand.id,
        name: String(presetName || '').trim() || 'Default',
        step1: pick(step1, STEP1_FIELDS),
        step2: pick(step2, CAMPAIGN_FIELDS),
      },
      { onConflict: 'brand_id,name' }
    )
  if (presetError) throw new Error(presetError.message)

  return loadDatabank()
}

// Stamp a preset as used so "most recently loaded" sorts to the top next time.
// Fire-and-forget: a failed touch must never break the load.
export function touchPreset(id) {
  if (!supabase || !id) return
  supabase
    .from('brand_presets')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', id)
    .then(({ error }) => { if (error) console.error('Failed to touch preset', error) })
}

// Deletes are soft in effect: the revision trigger keeps the pre-image.
// Deleting a brand cascades to its presets.
export async function deleteBrand(id) {
  if (!supabase) return []
  const { error } = await supabase.from('brands').delete().eq('id', id)
  if (error) throw new Error(error.message)
  return loadDatabank()
}

export async function deletePreset(id) {
  if (!supabase) return []
  const { error } = await supabase.from('brand_presets').delete().eq('id', id)
  if (error) throw new Error(error.message)
  return loadDatabank()
}
