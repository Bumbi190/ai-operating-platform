/**
 * ProjectRail scroll geometry.
 *
 * Kept as pure functions over measured rectangles rather than reading layout
 * properties inline, for one specific reason: the rail previously centred cards
 * using `offsetLeft` taken from the card's *button*, which is
 * `position: absolute; inset: 0` inside the relatively-positioned card. That
 * makes `offsetLeft` 0 for every card, so every centring target collapsed to the
 * same constant and the rail never moved.
 *
 * Rectangles from `getBoundingClientRect()` are viewport-relative and therefore
 * independent of which ancestor happens to be the `offsetParent`. That removes
 * the whole class of bug, and makes the contract unit-testable without a DOM.
 */

export interface RailBox {
  /** Viewport-relative left edge. */
  left: number
  /** Rendered width. */
  width: number
}

/**
 * Scroll offset that puts `card` in the horizontal centre of `rail`.
 *
 * Works in deltas: how far the card centre currently sits from the rail centre,
 * applied to the rail's current scroll position. Never returns a negative
 * offset, and never scrolls past the end of the content.
 */
export function centeringScrollLeft(args: {
  railScrollLeft: number
  railScrollWidth: number
  rail: RailBox
  card: RailBox
}): number {
  const { railScrollLeft, railScrollWidth, rail, card } = args
  const cardCentre = card.left + card.width / 2
  const railCentre = rail.left + rail.width / 2
  const target = railScrollLeft + (cardCentre - railCentre)
  const maxScroll = Math.max(0, railScrollWidth - rail.width)
  return Math.min(Math.max(target, 0), maxScroll)
}

/**
 * Index of the card whose centre is nearest the rail's centre.
 *
 * Returns `fallback` when nothing is measurable, so a rail that has not laid out
 * yet cannot yank the selection to index 0.
 */
export function nearestCardIndex(args: {
  rail: RailBox
  cards: Array<RailBox | null>
  fallback: number
}): number {
  const { rail, cards, fallback } = args
  const railCentre = rail.left + rail.width / 2
  let nearest = fallback
  let nearestDistance = Number.POSITIVE_INFINITY

  cards.forEach((card, index) => {
    if (!card || card.width === 0) return
    const distance = Math.abs(card.left + card.width / 2 - railCentre)
    if (distance < nearestDistance) {
      nearest = index
      nearestDistance = distance
    }
  })

  return nearest
}

/** Wrap an index into range, so the rail cycles at both ends. */
export function wrapIndex(index: number, length: number): number {
  if (length <= 0) return 0
  return ((index % length) + length) % length
}
