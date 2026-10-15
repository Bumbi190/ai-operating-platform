export type Point = { x: number; y: number }
export type Viewport = {
  left: number
  top: number
  width: number
  height: number
}
export function clampMiniChat(
  position: Point,
  size: { width: number; height: number },
  viewport: Viewport,
  margin = 8
): Point {
  const left = viewport.left + margin,
    top = viewport.top + margin
  return {
    x: Math.max(
      left,
      Math.min(
        Number.isFinite(position.x) ? position.x : left,
        Math.max(left, viewport.left + viewport.width - size.width - margin)
      )
    ),
    y: Math.max(
      top,
      Math.min(
        Number.isFinite(position.y) ? position.y : top,
        Math.max(top, viewport.top + viewport.height - size.height - margin)
      )
    )
  }
}
