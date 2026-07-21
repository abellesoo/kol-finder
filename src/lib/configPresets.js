// Saved step-2 (Configure your search) presets. Step 2 starts blank every run,
// so an operator re-typing the same brand's brief each time is the main pain.
// A preset captures the whole ConfigStep form keyed by a name (usually the
// brand), so the first run types it and every repeat is one click to prefill.
//
// Browser-local only (same pattern as sfBulk sender): this repo is PUBLIC and a
// brief can carry unreleased product details, so it never leaves localStorage.

const PRESETS_KEY = 'config_presets_v1'

// Fields we persist — everything the operator fills on step 2. Kept as an
// explicit list so an unrelated ConfigStep state field can't leak into a preset.
const PRESET_FIELDS = [
  'niches', 'targetAudience', 'targetKeywords', 'excludeKeywords',
  'locationTarget', 'minEngagement',
  'brandName', 'brandBackground', 'newProduct', 'collabFormat', 'products', 'briefNotes',
]

export function loadPresets() {
  try {
    const arr = JSON.parse(localStorage.getItem(PRESETS_KEY) || '[]')
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

// Keep only the whitelisted fields, so a preset is a clean snapshot.
function pickFields(config) {
  const out = {}
  for (const k of PRESET_FIELDS) if (config[k] !== undefined) out[k] = config[k]
  return out
}

// Upsert by name (case-insensitive) — saving "Wellage" twice updates in place
// rather than piling up duplicates. Most-recently-saved sorts first.
export function savePreset(name, config) {
  const clean = String(name || '').trim()
  if (!clean) throw new Error('Preset name is required')
  const entry = { name: clean, savedAt: new Date().toISOString(), config: pickFields(config) }
  const rest = loadPresets().filter((p) => p.name.toLowerCase() !== clean.toLowerCase())
  const next = [entry, ...rest]
  localStorage.setItem(PRESETS_KEY, JSON.stringify(next))
  return next
}

export function deletePreset(name) {
  const next = loadPresets().filter((p) => p.name.toLowerCase() !== String(name).toLowerCase())
  localStorage.setItem(PRESETS_KEY, JSON.stringify(next))
  return next
}
