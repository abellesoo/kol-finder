// The one empty/zero-state: a tinted icon chip, a serif title, a line of
// direction, and an optional action. An empty screen is an invitation to act.
export default function EmptyState({ icon: Icon, title, description, action, className = '', tone = 'accent' }) {
  const chip = tone === 'sage' ? 'bg-sage/10 text-sage' : 'bg-accent-dim text-[#8A6A22]'
  return (
    <div className={`flex flex-col items-center justify-center text-center px-8 py-16 ${className}`}>
      {Icon && (
        <span className={`w-12 h-12 rounded-[14px] grid place-items-center mb-4 ${chip}`}>
          <Icon size={20} />
        </span>
      )}
      {title && <h2 className="text-[17px] font-serif font-bold text-ink mb-1.5">{title}</h2>}
      {description && <p className="text-[13.5px] text-muted max-w-xs mb-5">{description}</p>}
      {action}
    </div>
  )
}
