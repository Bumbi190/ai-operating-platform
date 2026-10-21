'use client'

import { useEffect, type RefObject } from 'react'

/**
 * Closes an Atlas Home summary panel on a pointer press outside it or on
 * Escape. Only listens while the panel is open, so a closed card costs nothing.
 */
export function useDismissOnOutside(ref: RefObject<HTMLElement>, open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return
    function onPointer(event: PointerEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) close()
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') close()
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [ref, open, close])
}
