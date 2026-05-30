import { cn } from '@/lib/utils'

export interface MemoryNode {
  id: string
  label: string
  /** 0–1 · how active this node is */
  intensity?: number
  group?: 'agent' | 'memory' | 'workflow'
}

export interface MemoryEdge {
  from: string  // node id
  to: string
  /** 0–1 · how strong the reference is right now */
  weight?: number
  /** is the edge currently transmitting? renders flowing dashes */
  active?: boolean
}

interface MemoryGraphProps {
  nodes: MemoryNode[]
  edges: MemoryEdge[]
  size?: number
  className?: string
}

const GROUP_COLOR: Record<NonNullable<MemoryNode['group']>, string> = {
  agent:    '#a5b4fc',
  memory:   '#67e8f9',
  workflow: '#d4a574',
}

/**
 * MemoryGraph · radial node visualization.
 *
 * Lays nodes out on a circle around the center memory hub. Edges flow
 * between them, indicating live memory references. Subtle, premium —
 * the system whispering "here's what I'm thinking about right now."
 */
export function MemoryGraph({
  nodes,
  edges,
  size = 340,
  className,
}: MemoryGraphProps) {
  const cx = size / 2
  const cy = size / 2
  const r = size / 2 - 36

  // Position nodes around the ring
  const positions: Record<string, { x: number; y: number }> = {}
  const n = nodes.length || 1
  nodes.forEach((node, i) => {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2
    positions[node.id] = {
      x: cx + Math.cos(angle) * r,
      y: cy + Math.sin(angle) * r,
    }
  })

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={cn('block', className)}
    >
      <defs>
        <radialGradient id="mg-hub-grad" cx="50%" cy="50%" r="50%">
          <stop offset="0%"  stopColor="#a5b4fc" stopOpacity="0.6" />
          <stop offset="60%" stopColor="#818cf8" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#818cf8" stopOpacity="0" />
        </radialGradient>
        <filter id="mg-glow">
          <feGaussianBlur stdDeviation="2" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Outer ring */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.05)" strokeDasharray="2 5" />
      <circle cx={cx} cy={cy} r={r * 0.66} fill="none" stroke="rgba(255,255,255,0.04)" />
      <circle cx={cx} cy={cy} r={r * 0.33} fill="none" stroke="rgba(255,255,255,0.04)" />

      {/* Edges */}
      {edges.map((e, i) => {
        const a = positions[e.from]
        const b = positions[e.to]
        if (!a || !b) return null
        const opacity = 0.18 + (e.weight ?? 0.5) * 0.35
        return (
          <line
            key={`e-${i}`}
            x1={a.x} y1={a.y} x2={b.x} y2={b.y}
            stroke="#818cf8"
            strokeWidth={e.active ? 1.2 : 0.7}
            strokeOpacity={opacity}
            strokeDasharray={e.active ? '4 4' : undefined}
            className={e.active ? 'flow-edge' : undefined}
          />
        )
      })}

      {/* Center hub */}
      <circle cx={cx} cy={cy} r={26} fill="url(#mg-hub-grad)" />
      <circle cx={cx} cy={cy} r={9} fill="#a5b4fc" filter="url(#mg-glow)" />
      <circle cx={cx} cy={cy} r={4} fill="#ffffff" opacity={0.9} />

      {/* Nodes */}
      {nodes.map((node) => {
        const pos = positions[node.id]
        if (!pos) return null
        const color = GROUP_COLOR[node.group ?? 'agent']
        const radius = 4 + (node.intensity ?? 0.5) * 4

        return (
          <g key={node.id}>
            {(node.intensity ?? 0) > 0.5 && (
              <circle
                cx={pos.x}
                cy={pos.y}
                r={radius * 2.2}
                fill={color}
                opacity={0.15}
                style={{ filter: 'blur(2px)' }}
              />
            )}
            <circle cx={pos.x} cy={pos.y} r={radius} fill={color} />
            <circle cx={pos.x} cy={pos.y} r={radius - 1.5} fill="#070b1c" opacity={0.5} />
            <text
              x={pos.x}
              y={pos.y - radius - 7}
              textAnchor="middle"
              fontSize="9"
              fill="rgba(255,255,255,0.7)"
              style={{
                fontFamily: 'ui-monospace, SF Mono, Menlo, monospace',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
              }}
            >
              {node.label}
            </text>
          </g>
        )
      })}
    </svg>
  )
}
