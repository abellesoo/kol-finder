// The one canonical page header for list/detail views: a mono eyebrow label, a
// serif title (with an optional muted count), a subtitle, and a right-aligned
// actions slot. Adopting this everywhere fixes the three-different-header drift
// the app had accumulated.
export default function PageHeader({ label, title, subtitle, count, actions, className = '' }) {
  return (
    <div className={`flex items-start justify-between gap-4 ${className}`}>
      <div className="min-w-0">
        {label && (
          <p className="font-mono text-[10px] tracking-[.18em] text-faint uppercase mb-[8px]">{label}</p>
        )}
        <h1 className="text-[34px] font-serif font-bold tracking-[0.02em] text-ink leading-tight text-balance">
          {title}
          {count != null && (
            <span className="text-faint font-normal ml-2.5 tabular-nums">{count}</span>
          )}
        </h1>
        {subtitle && <p className="text-[14px] text-muted mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-shrink-0 pt-1">{actions}</div>}
    </div>
  )
}
