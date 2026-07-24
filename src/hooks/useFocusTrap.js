import { useEffect, useRef } from 'react'

// Trap keyboard focus inside a modal dialog while it's open: Tab / Shift+Tab
// cycle within the dialog instead of escaping to the page behind it, and focus
// returns to the previously-focused element on close. Attach the returned ref to
// the dialog container:  const ref = useFocusTrap(true); <div ref={ref} role="dialog" …>
const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

export function useFocusTrap(active = true) {
  const ref = useRef(null)

  useEffect(() => {
    if (!active) return
    const node = ref.current
    if (!node) return
    const previouslyFocused = document.activeElement

    // Focus the first focusable element (or the container) once mounted, unless
    // something inside already has focus (e.g. an autoFocus input).
    if (!node.contains(document.activeElement)) {
      const first = node.querySelector(FOCUSABLE)
      ;(first || node).focus?.()
    }

    const onKeyDown = (e) => {
      if (e.key !== 'Tab') return
      const items = Array.from(node.querySelectorAll(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      )
      if (items.length === 0) { e.preventDefault(); return }
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }

    node.addEventListener('keydown', onKeyDown)
    return () => {
      node.removeEventListener('keydown', onKeyDown)
      // Restore focus to whatever opened the dialog.
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus?.()
    }
  }, [active])

  return ref
}
