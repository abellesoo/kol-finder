// Shared "input databank" — a team-wide, Supabase-backed store of Seeder run
// inputs (Get-Data scrape inputs + Configure-scoring form), keyed by a name
// (usually the brand/campaign). Repeat runs for the same brand load an entry to
// prefill BOTH steps instead of re-typing everything.
//
// This is the shared successor to the browser-local configPresets (step-2 only).
// When Supabase isn't configured (local dev), every call degrades to a no-op so
// the seeder still works without a databank.
//
// Backing table + RLS: db/input_databank.sql.

import { supabase } from './supabase'

const TABLE = 'input_databank'

// Field whitelists — keep entries clean snapshots and prevent an unrelated form
// field from leaking in. Mirrors the state each step owns.
const STEP1_FIELDS = ['tab', 'platforms', 'scrapeInput', 'painpointInput', 'genreInput', 'resultsLimit']
const STEP2_FIELDS = [
  'niches', 'targetAudience', 'targetKeywords', 'excludeKeywords',
  'locationTarget', 'minEngagement',
  'brandName', 'brandBackground', 'newProduct', 'collabFormat', 'products', 'briefNotes',
]

function pick(obj, fields) {
  const out = {}
  if (obj) for (const k of fields) if (obj[k] !== undefined) out[k] = obj[k]
  return out
}

// Newest-updated first, so the most recently touched brand sorts to the top.
export async function loadDatabank() {
  if (!supabase) return []
  const { data, error } = await supabase
    .from(TABLE)
    .select('id, name, step1, step2, updated_at')
    .order('updated_at', { ascending: false })
  if (error) {
    console.error('Failed to load input databank', error)
    return []
  }
  return data || []
}

// Upsert by case-insensitive name (unique index handles the collision). Returns
// the refreshed list so the caller can update its dropdown in one round-trip.
export async function saveDatabankEntry(name, { step1, step2 }) {
  if (!supabase) throw new Error('Databank needs Supabase — not configured in this environment.')
  const clean = String(name || '').trim()
  if (!clean) throw new Error('Give this databank entry a name (usually the brand).')

  const { data: existing } = await supabase
    .from(TABLE)
    .select('id')
    .ilike('name', clean)
    .maybeSingle()

  const row = {
    name: clean,
    step1: pick(step1, STEP1_FIELDS),
    step2: pick(step2, STEP2_FIELDS),
    updated_at: new Date().toISOString(),
  }

  const { error } = existing
    ? await supabase.from(TABLE).update(row).eq('id', existing.id)
    : await supabase.from(TABLE).insert(row)
  if (error) throw new Error(error.message)

  return loadDatabank()
}

export async function deleteDatabankEntry(id) {
  if (!supabase) return []
  const { error } = await supabase.from(TABLE).delete().eq('id', id)
  if (error) throw new Error(error.message)
  return loadDatabank()
}
