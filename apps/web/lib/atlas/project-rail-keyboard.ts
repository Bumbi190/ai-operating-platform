export type ProjectRailKeyAction = 'previous' | 'next' | 'open' | 'return' | null

const PRIORITY_SURFACE_SELECTOR = [
  '[role="dialog"]',
  '[aria-modal="true"]',
  '[data-command-palette="open"]',
  '[data-keyboard-priority="true"]',
].join(',')

export function isEditableTarget(target: EventTarget | null): boolean {
  const element = target as (EventTarget & {
    closest?: (selector: string) => Element | null
    isContentEditable?: boolean
  }) | null
  if (!element || typeof element.closest !== 'function') return false
  if (element.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]')) return true
  return element.isContentEditable === true
}

export function hasHigherPriorityKeyboardSurface(doc: Document): boolean {
  return Array.from(doc.querySelectorAll(PRIORITY_SURFACE_SELECTOR)).some((element) => {
    const surface = element as HTMLElement
    return !surface.hidden && surface.getAttribute('aria-hidden') !== 'true'
  })
}

export function resolveProjectRailKeyAction(
  event: Pick<KeyboardEvent, 'key' | 'defaultPrevented' | 'metaKey' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'target'>,
  context: 'atlas' | 'project-detail',
  doc: Document,
): ProjectRailKeyAction {
  if (
    event.defaultPrevented
    || event.metaKey
    || event.ctrlKey
    || event.altKey
    || event.shiftKey
    || isEditableTarget(event.target)
    || hasHigherPriorityKeyboardSurface(doc)
  ) return null

  if (context === 'atlas') {
    if (event.key === 'ArrowLeft') return 'previous'
    if (event.key === 'ArrowRight') return 'next'
    if (event.key === 'Enter') return 'open'
    return null
  }

  if (event.key === 'Escape' || event.key === 'Backspace') return 'return'
  return null
}
