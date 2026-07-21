import { useState, useMemo, useCallback } from 'react'
import { COLUMN_ACCESSORS } from './columnDefs'

// Shared sort + per-column filter engine for the KOL tables. Each table feeds
// its already-computed rows in and renders `processed`; the hook owns sort state
// (one active numeric column, desc → asc → off) and category filters
// ({ colId: string[] of selected values }). Sort/filter values are read through
// COLUMN_ACCESSORS so every table behaves identically.
export function useTableControls(rows, { defaultSortId = 'overall', defaultSortDir = 'desc', accessors = COLUMN_ACCESSORS } = {}) {
  const [sortId, setSortId] = useState(defaultSortId)
  const [sortDir, setSortDir] = useState(defaultSortDir)
  const [filters, setFilters] = useState({}) // { [colId]: string[] }

  // Header click on a numeric column: same column cycles desc → asc → off;
  // a new column starts at desc. Two flat setStates (no nested updater) so it
  // stays correct under StrictMode's double-invoked updaters.
  const toggleSort = useCallback((colId) => {
    if (sortId !== colId) { setSortId(colId); setSortDir('desc'); return }
    if (sortDir === 'desc') { setSortDir('asc'); return }
    setSortId(null) // third click clears the sort
  }, [sortId, sortDir])

  const setFilter = useCallback((colId, values) => {
    setFilters((f) => {
      const next = { ...f }
      if (!values || values.length === 0) delete next[colId]
      else next[colId] = values
      return next
    })
  }, [])

  const clearFilters = useCallback(() => setFilters({}), [])

  // Distinct category values present in the current rows, for a filter dropdown.
  const distinctValues = useCallback((colId) => {
    const acc = accessors[colId]
    if (!acc?.filterValues) return []
    const set = new Set()
    for (const r of rows) for (const v of acc.filterValues(r)) if (v) set.add(v)
    return [...set].sort((a, b) => a.localeCompare(b))
  }, [rows, accessors])

  const processed = useMemo(() => {
    let list = rows

    const activeFilters = Object.entries(filters)
    if (activeFilters.length) {
      list = list.filter((r) =>
        activeFilters.every(([colId, vals]) => {
          const acc = accessors[colId]
          if (!acc?.filterValues) return true
          const rowVals = acc.filterValues(r)
          return rowVals.some((v) => vals.includes(v))
        })
      )
    }

    if (sortId) {
      const acc = accessors[sortId]
      if (acc?.sortValue) {
        list = [...list].sort((a, b) => {
          const av = acc.sortValue(a)
          const bv = acc.sortValue(b)
          if (av == null && bv == null) return 0
          if (av == null) return 1 // nulls always sort last
          if (bv == null) return -1
          return sortDir === 'desc' ? bv - av : av - bv
        })
      }
    }

    return list
  }, [rows, filters, sortId, sortDir, accessors])

  return {
    processed,
    sortId,
    sortDir,
    toggleSort,
    filters,
    setFilter,
    clearFilters,
    distinctValues,
    activeFilterCount: Object.keys(filters).length,
  }
}
