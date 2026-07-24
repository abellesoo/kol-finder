import { useState, useEffect, useRef } from 'react'

// Sync one piece of view state (e.g. a cards/table toggle) into a namespaced URL
// query param, so the address bar is a complete, shareable link — open it and
// the view is reproduced. Drop-in for useState: `const [v, setV] = useUrlParam(key, default)`.
//
// Only writes when the value differs from `defaultValue`, keeping untouched
// views' URLs clean. Touches only its own key — page/id/session (owned by
// urlState.js) and other params/tables are preserved. replaceState is used so
// changes never spam browser history or trip the router's popstate handler.
export function useUrlParam(key, defaultValue) {
  const initialRef = useRef(null)
  if (initialRef.current === null) {
    const raw = new URLSearchParams(window.location.search).get(key)
    initialRef.current = { value: raw == null ? defaultValue : raw }
  }
  const [value, setValue] = useState(initialRef.current.value)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (value == null || value === defaultValue) params.delete(key)
    else params.set(key, String(value))
    const qs = params.toString()
    const next = window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash
    if (next !== window.location.pathname + window.location.search + window.location.hash) {
      window.history.replaceState(window.history.state, '', next)
    }
  }, [key, value, defaultValue])

  // Strip our key on unmount so this view toggle doesn't leak onto other pages
  // after navigating away (stable dep → cleanup runs only on unmount).
  useEffect(() => () => {
    const params = new URLSearchParams(window.location.search)
    if (!params.has(key)) return
    params.delete(key)
    const qs = params.toString()
    const next = window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash
    window.history.replaceState(window.history.state, '', next)
  }, [key])

  return [value, setValue]
}
