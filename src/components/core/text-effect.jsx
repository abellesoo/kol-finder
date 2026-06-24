import { motion, useInView } from 'motion/react'
import { useRef } from 'react'

const PRESETS = {
  fade: {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
  },
  'fade-in-blur': {
    hidden: { opacity: 0, filter: 'blur(6px)' },
    visible: { opacity: 1, filter: 'blur(0px)' },
  },
  slide: {
    hidden: { opacity: 0, y: 12 },
    visible: { opacity: 1, y: 0 },
  },
}

export function TextEffect({
  children,
  per = 'char',
  preset = 'fade',
  delay = 0,
  duration = 0.4,
  staggerDelay = 0.04,
  className,
  as: Tag = 'p',
}) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true })

  const variants = PRESETS[preset] ?? PRESETS.fade

  const words = String(children).split(' ')

  if (per === 'char') {
    // Build a flat char list but track which word each char belongs to
    let charIndex = 0
    const wordGroups = words.map((word) => {
      const chars = word.split('').map((ch, j) => ({ ch, index: charIndex + j }))
      charIndex += word.length + 1 // +1 for the space
      return chars
    })

    return (
      <Tag ref={ref} className={className} aria-label={children}>
        <span aria-hidden>
          {wordGroups.map((chars, wi) => (
            <span key={wi} style={{ display: 'inline-block', whiteSpace: 'nowrap', marginRight: wi < wordGroups.length - 1 ? '0.28em' : 0 }}>
              {chars.map(({ ch, index }) => (
                <motion.span
                  key={index}
                  style={{ display: 'inline-block' }}
                  initial="hidden"
                  animate={isInView ? 'visible' : 'hidden'}
                  variants={variants}
                  transition={{ duration, delay: delay + index * staggerDelay, ease: 'easeOut' }}
                >
                  {ch}
                </motion.span>
              ))}
            </span>
          ))}
        </span>
      </Tag>
    )
  }

  return (
    <Tag ref={ref} className={className} aria-label={children}>
      <span aria-hidden>
        {words.map((word, i) => (
          <motion.span
            key={i}
            style={{ display: 'inline-block', marginRight: i < words.length - 1 ? '0.25em' : 0 }}
            initial="hidden"
            animate={isInView ? 'visible' : 'hidden'}
            variants={variants}
            transition={{ duration, delay: delay + i * staggerDelay, ease: 'easeOut' }}
          >
            {word}
          </motion.span>
        ))}
      </span>
    </Tag>
  )
}
