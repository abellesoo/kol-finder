import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import { COLUMN_ACCESSORS } from './columnDefs'

// --- Shareable-link (URL) sync ------------------------------------------------
// When a table opts in (urlSync), its sort + per-column filters are mirrored into
// the page's query string under a per-table namespace (e.g. `review_sort`,
// `review_f_account_location`). Opening that URL restores the exact same view, so
// a filtered/sorted table can be copied and shared. We only write params that
// DIFFER from the table's defaults, so untouched tables leave the URL clean.
//
// Params are namespaced so multiple tables never collide, and we touch only our
// own keys — `page`/`id`/`session` (owned by urlState.js) and any other params
// are preserved. Writes use replaceState so live filtering never spams history
// or trips the app router's popstate handler.

function readUrlTableState(prefix, defaultSortId, defaultSortDir) {
  const params = new URLSearchParams(window.location.search)
  let sortId = defaultSortId
  let sortDir = defaultSortDir
  const sortRaw = params.get(`${prefix}sort`)
  if (sortRaw != null) {
    if (sortRaw === 'none') {
      sortId = null
    } else {
      const [id, dir] = sortRaw.split(':')
      sortId = id || null
      sortDir = dir === 'asc' ? 'asc' : 'desc'
    }
  }
  const filters = {}
  const fpref = `${prefix}f_`
  for (const key of new Set([...params.keys()])) {
    if (key.startsWith(fpref)) {
      const vals = params.getAll(key).filter(Boolean)
      if (vals.length) filters[key.slice(fpref.length)] = vals
    }
  }
  return { sortId, sortDir, filters }
}

function writeUrlTableState(prefix, { sortId, sortDir, filters, defaultSortId, defaultSortDir }) {
  const params = new URLSearchParams(window.location.search)
  const sortParam = `${prefix}sort`
  const fpref = `${prefix}f_`
  // Clear our previously-written params (a plain delete removes all repeats).
  for (const key of new Set([...params.keys()])) {
    if (key === sortParam || key.startsWith(fpref)) params.delete(key)
  }
  // Sort — encode only when it differs from the table default. A cleared sort
  // that differs from a non-null default is encoded as `none` so it reproduces.
  if (sortId !== defaultSortId || (sortId && sortDir !== defaultSortDir)) {
    params.set(sortParam, sortId ? `${sortId}:${sortDir}` : 'none')
  }
  for (const [colId, vals] of Object.entries(filters)) {
    for (const v of vals) params.append(`${fpref}${colId}`, v)
  }
  const qs = params.toString()
  const next = window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash
  if (next !== window.location.pathname + window.location.search + window.location.hash) {
    window.history.replaceState(window.history.state, '', next)
  }
}

// Shared sort + per-column filter engine for the KOL tables. Each table feeds
// its already-computed rows in and renders `processed`; the hook owns sort state
// (one active numeric column, desc → asc → off) and category filters
// ({ colId: string[] of selected values }). Sort/filter values are read through
// COLUMN_ACCESSORS so every table behaves identically. Pass `urlSync: true` with
// a unique `urlKey` to make the view shareable via the page URL.
export function useTableControls(rows, {
  defaultSortId = 'overall',
  defaultSortDir = 'desc',
  accessors = COLUMN_ACCESSORS,
  urlSync = false,
  urlKey = 'tbl',
} = {}) {
  const urlPrefix = `${urlKey}_`

  // Seed initial state from the URL exactly once (shareable-link restore).
  const initialRef = useRef(null)
  if (initialRef.current === null) {
    initialRef.current = urlSync
      ? readUrlTableState(urlPrefix, defaultSortId, defaultSortDir)
      : { sortId: defaultSortId, sortDir: defaultSortDir, filters: {} }
  }

  const [sortId, setSortId] = useState(initialRef.current.sortId)
  const [sortDir, setSortDir] = useState(initialRef.current.sortDir)
  const [filters, setFilters] = useState(initialRef.current.filters) // { [colId]: string[] }

  // Mirror sort/filter changes into the URL so the link stays shareable.
  useEffect(() => {
    if (!urlSync) return
    writeUrlTableState(urlPrefix, { sortId, sortDir, filters, defaultSortId, defaultSortDir })
  }, [urlSync, urlPrefix, sortId, sortDir, filters, defaultSortId, defaultSortDir])

  // On unmount, strip our namespaced params so a table's sort/filters don't leak
  // onto other pages — or silently pre-filter a fresh session — after navigating
  // away. Stable deps → cleanup runs only on unmount. While mounted the write
  // effect above keeps the URL populated and shareable.
  useEffect(() => {
    if (!urlSync) return
    return () => {
      const params = new URLSearchParams(window.location.search)
      const sortParam = `${urlPrefix}sort`
      const fpref = `${urlPrefix}f_`
      let changed = false
      for (const key of new Set([...params.keys()])) {
        if (key === sortParam || key.startsWith(fpref)) { params.delete(key); changed = true }
      }
      if (!changed) return
      const qs = params.toString()
      const next = window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash
      window.history.replaceState(window.history.state, '', next)
    }
  }, [urlSync, urlPrefix])

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
