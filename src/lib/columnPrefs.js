// Remembered column visibility for the KOL tables (Results, Review, Ready to
// Send). The picker used to reset to DEFAULT_SELECTED_COLUMNS on every mount;
// this persists the operator's choice to localStorage so a change on one tab
// applies to all of them and survives reload. Browser-local only — column
// choices are a personal view preference, not shared data.

import { DEFAULT_SELECTED_COLUMNS, TABLE_COLUMNS } from './columnDefs'

const PREFS_KEY = 'kol_column_prefs_v1'
const VALID_IDS = new Set(TABLE_COLUMNS.map((c) => c.id))

export function loadColumnPrefs() {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) || 'null')
    if (!Array.isArray(raw)) return DEFAULT_SELECTED_COLUMNS
    // Drop any ids no longer in the schema; keep the canonical column order.
    const keep = new Set(raw.filter((id) => VALID_IDS.has(id)))
    return TABLE_COLUMNS.map((c) => c.id).filter((id) => keep.has(id))
  } catch {
    return DEFAULT_SELECTED_COLUMNS
  }
}

export function saveColumnPrefs(selected) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(selected))
  } catch {}
}
