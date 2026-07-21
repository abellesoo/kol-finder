// Shared step-progress header for the Seeder (Set up ↔ Results).
//
// A step renders as a real <button> only when it's actually navigable; the
// current step is a plain <span> with aria-current="step" so assistive tech
// announces position instead of a disabled control. Navigable steps get a
// visible affordance (dotted underline) rather than a hover-only hint, plus
// a keyboard focus ring.
export default function StepProgress({ current, steps, className = 'mb-6' }) {
  return (
    <nav aria-label="Seeder steps" className={`flex items-center ${className}`}>
      {steps.map((s, i) => {
        const clickable = Boolean(s.onClick) && s.num !== current
        const state = s.num === current ? 'current' : s.num < current ? 'done' : 'todo'
        const circle = `w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-mono font-semibold flex-shrink-0 transition-colors ${
          state === 'current' ? 'bg-accent text-white' : state === 'done' ? 'bg-mist text-body' : 'bg-mist text-faint'
        }`
        const label = `text-[12.5px] font-medium whitespace-nowrap transition-colors ${
          state === 'current' ? 'text-ink' : 'text-faint'
        }`
        return (
          <div key={s.num} className="flex items-center">
            {clickable ? (
              <button
                type="button"
                onClick={s.onClick}
                title={s.hint}
                aria-label={s.hint ? `${s.label} — ${s.hint}` : s.label}
                className="group flex items-center gap-2 -mx-1.5 -my-1 px-1.5 py-1 rounded-[8px] hover:bg-white/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent active:scale-[.97] transition"
              >
                <span className={`${circle} group-hover:bg-ink group-hover:text-white`}>{s.num}</span>
                <span className={`${label} underline decoration-dotted decoration-faint/80 underline-offset-4 group-hover:text-ink group-hover:decoration-ink/50`}>
                  {s.label}
                </span>
              </button>
            ) : (
              <span className="flex items-center gap-2" aria-current={state === 'current' ? 'step' : undefined}>
                <span className={circle}>{s.num}</span>
                <span className={label}>{s.label}</span>
              </span>
            )}
            {i < steps.length - 1 && <div className="w-8 h-px bg-mist mx-3 flex-shrink-0" aria-hidden="true" />}
          </div>
        )
      })}
    </nav>
  )
}
