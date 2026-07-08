/**
 * Minimal deterministic force-directed layout — no external dependency.
 *
 * Scope-checked: the Intelligence Graph never renders more than
 * LIMITS.MAX_RESPONSE_NODES (600) nodes, and typical views are 30–300 nodes.
 * A simple O(n²)-repulsion simulation with a fixed iteration budget lays that
 * out in tens of milliseconds — installing d3/reactflow was evaluated and
 * deliberately skipped for the MVP (see docs/intelligence-graph.md).
 *
 * Deterministic: seeded initial positions (hash of node id) so the same graph
 * always lands in the same shape — no layout jitter between visits.
 */

export interface LayoutNode {
  id: string
  /** Visual weight (degree) — used for radius + charge. */
  weight: number
  /** Optional cluster hint — nodes sharing a group gravitate together. */
  group?: number
}

export interface LayoutEdge {
  source: string
  target: string
}

export interface PositionedNode {
  id: string
  x: number
  y: number
  r: number
}

/** FNV-1a — cheap deterministic hash for seeding. */
function hash(str: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export function nodeRadius(weight: number): number {
  return 6 + Math.min(18, Math.sqrt(Math.max(0, weight)) * 1.6)
}

export function computeLayout(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  opts: { width?: number; height?: number; iterations?: number } = {},
): PositionedNode[] {
  const width = opts.width ?? 1200
  const height = opts.height ?? 800
  const n = nodes.length
  if (n === 0) return []

  // Iteration budget scales down as node count grows: keeps worst case ~25M ops.
  const iterations = opts.iterations ?? (n > 400 ? 80 : n > 200 ? 140 : 220)

  const index = new Map<string, number>()
  const xs = new Float64Array(n)
  const ys = new Float64Array(n)
  const vx = new Float64Array(n)
  const vy = new Float64Array(n)
  const radii = new Float64Array(n)

  // Seeded ring + group-angle start
  for (let i = 0; i < n; i++) {
    const node = nodes[i]
    index.set(node.id, i)
    const h = hash(node.id)
    const groupAngle = node.group !== undefined ? (hash(`g${node.group}`) % 360) * (Math.PI / 180) : 0
    const angle = ((h % 3600) / 3600) * Math.PI * 2 * 0.35 + groupAngle
    const rad = 0.25 * Math.min(width, height) * (0.5 + ((h >> 8) % 1000) / 2000)
    xs[i] = width / 2 + Math.cos(angle) * rad
    ys[i] = height / 2 + Math.sin(angle) * rad
    radii[i] = nodeRadius(node.weight)
  }

  const links: Array<[number, number]> = []
  for (const e of edges) {
    const a = index.get(e.source)
    const b = index.get(e.target)
    if (a !== undefined && b !== undefined && a !== b) links.push([a, b])
  }

  const repulsion = 1800
  const springLength = 90
  const springK = 0.04
  const centerK = 0.012
  const groupK = 0.015

  // Group centroids (recomputed every 10 ticks)
  const groups = new Map<number, { x: number; y: number; count: number }>()

  for (let iter = 0; iter < iterations; iter++) {
    const cooling = 1 - iter / iterations

    // Repulsion — O(n²) with early cutoff
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dx = xs[i] - xs[j]
        let dy = ys[i] - ys[j]
        let d2 = dx * dx + dy * dy
        if (d2 < 1) { dx = (hash(`${i}|${j}`) % 100) / 100 - 0.5; dy = 0.5; d2 = dx * dx + dy * dy }
        if (d2 > 250_000) continue // >500px apart — negligible
        const f = repulsion / d2
        const d = Math.sqrt(d2)
        const fx = (dx / d) * f
        const fy = (dy / d) * f
        vx[i] += fx; vy[i] += fy
        vx[j] -= fx; vy[j] -= fy
      }
    }

    // Springs
    for (const [a, b] of links) {
      const dx = xs[b] - xs[a]
      const dy = ys[b] - ys[a]
      const d = Math.max(1, Math.sqrt(dx * dx + dy * dy))
      const f = springK * (d - springLength)
      const fx = (dx / d) * f
      const fy = (dy / d) * f
      vx[a] += fx; vy[a] += fy
      vx[b] -= fx; vy[b] -= fy
    }

    // Group gravity
    if (iter % 10 === 0) {
      groups.clear()
      for (let i = 0; i < n; i++) {
        const g = nodes[i].group
        if (g === undefined) continue
        const entry = groups.get(g) ?? { x: 0, y: 0, count: 0 }
        entry.x += xs[i]; entry.y += ys[i]; entry.count += 1
        groups.set(g, entry)
      }
    }
    for (let i = 0; i < n; i++) {
      const g = nodes[i].group
      if (g !== undefined) {
        const entry = groups.get(g)
        if (entry && entry.count > 1) {
          vx[i] += (entry.x / entry.count - xs[i]) * groupK
          vy[i] += (entry.y / entry.count - ys[i]) * groupK
        }
      }
      // Center gravity
      vx[i] += (width / 2 - xs[i]) * centerK
      vy[i] += (height / 2 - ys[i]) * centerK
    }

    // Integrate with velocity clamp + cooling
    const maxV = 18 * cooling + 2
    for (let i = 0; i < n; i++) {
      const v = Math.sqrt(vx[i] * vx[i] + vy[i] * vy[i])
      if (v > maxV) { vx[i] = (vx[i] / v) * maxV; vy[i] = (vy[i] / v) * maxV }
      xs[i] += vx[i]
      ys[i] += vy[i]
      vx[i] *= 0.55
      vy[i] *= 0.55
    }
  }

  return nodes.map((node, i) => ({ id: node.id, x: xs[i], y: ys[i], r: radii[i] }))
}
