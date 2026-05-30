'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'

interface StreamingTextProps {
  text: string
  /** ms per character */
  speed?: number
  /** ms before starting */
  delay?: number
  /** show blinking caret while typing AND when done */
  persistentCaret?: boolean
  /** loop the stream forever (useful for "thinking…" placeholders) */
  loop?: boolean
  className?: string
  /** alternate strings to cycle through when looping */
  cycle?: string[]
  /** ms to hold before erasing in cycle mode */
  hold?: number
}

/**
 * StreamingText · types out a string character-by-character with a caret,
 * the way live agent reasoning surfaces in the system.
 *
 * Restraint: keep speeds moderate (40–70ms) — too fast feels gimmicky.
 */
export function StreamingText({
  text,
  speed = 38,
  delay = 0,
  persistentCaret = true,
  loop = false,
  cycle,
  hold = 1800,
  className,
}: StreamingTextProps) {
  const [display, setDisplay] = useState('')
  const [phase, setPhase] = useState<'typing' | 'holding' | 'erasing'>('typing')
  const [idx, setIdx] = useState(0)

  const sequence = cycle ?? [text]
  const current = sequence[idx % sequence.length]

  useEffect(() => {
    let cancelled = false
    let timeout: any

    const start = () => {
      if (phase === 'typing') {
        if (display.length < current.length) {
          timeout = setTimeout(() => !cancelled && setDisplay(current.slice(0, display.length + 1)), speed)
        } else if (loop || cycle) {
          timeout = setTimeout(() => !cancelled && setPhase('holding'), 50)
        }
      } else if (phase === 'holding') {
        timeout = setTimeout(() => !cancelled && setPhase('erasing'), hold)
      } else if (phase === 'erasing') {
        if (display.length > 0) {
          timeout = setTimeout(() => !cancelled && setDisplay(display.slice(0, -1)), Math.max(14, speed / 2))
        } else {
          setIdx(i => i + 1)
          setPhase('typing')
        }
      }
    }

    if (delay && display.length === 0 && phase === 'typing' && idx === 0) {
      timeout = setTimeout(start, delay)
    } else {
      start()
    }
    return () => { cancelled = true; clearTimeout(timeout) }
  }, [display, phase, idx, current, speed, hold, delay, loop, cycle])

  return (
    <span className={cn(persistentCaret ? 'caret' : '', className)}>
      {display}
    </span>
  )
}
