import { Loader2 } from 'lucide-react'

// The one loading indicator, so every tab spins the same way (TeamPage used to
// render a plain "Loading..." string).
export default function Loading({ label = 'Loading…', className = '' }) {
  return (
    <div className={`flex items-center justify-center gap-2 py-16 text-faint ${className}`}>
      <Loader2 size={16} className="animate-spin" />
      <span className="text-[13px]">{label}</span>
    </div>
  )
}
