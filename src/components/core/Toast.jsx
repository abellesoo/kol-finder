import { useEffect } from 'react'
import { Check, AlertCircle } from 'lucide-react'

// Shared non-blocking toast — the app's replacement for jarring window.alert()
// popups. `toast` is `{ type: 'success' | 'error', message } | null`.
//
// Pattern in a page:
//   const [toast, setToast] = useState(null)
//   useAutoDismissToast(toast, setToast)
//   ...setToast({ type: 'error', message: '…' })
//   <Toast toast={toast} onClose={() => setToast(null)} />
export function useAutoDismissToast(toast, setToast, ms = 4000) {
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), ms)
    return () => clearTimeout(t)
  }, [toast, setToast, ms])
}

export default function Toast({ toast, onClose }) {
  if (!toast) return null
  const isError = toast.type === 'error'
  return (
    <button
      type="button"
      onClick={onClose}
      title="Dismiss"
      className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] flex items-center gap-2 text-white px-4 py-2.5 rounded-full shadow-xl text-[13px] max-w-[90vw] text-left ${
        isError ? 'bg-rose' : 'bg-sage'
      }`}
    >
      {isError ? <AlertCircle size={14} className="flex-shrink-0" /> : <Check size={14} className="flex-shrink-0" />}
      <span className="truncate">{toast.message}</span>
    </button>
  )
}
