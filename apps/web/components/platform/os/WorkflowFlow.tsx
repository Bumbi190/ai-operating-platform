import { cn } from '@/lib/utils'
import type { LucideIcon } from 'lucide-react'

export interface FlowNode {
  id: string
  label: string
  sublabel?: string
  icon: LucideIcon
  status: 'done' | 'active' | 'queued' | 'failed'
  color?: string
  /** Optional one-line reasoning snippet shown above the node (when active) */
  reasoning?: string
}

const STATUS_STYLES = {
  done:    { color: '#34d399', bg: 'rgba(52,211,153,0.10)',  border: 'rgba(52,211,153,0.35)' },
  active:  { color: '#818cf8', bg: 'rgba(99,102,241,0.14)',  border: 'rgba(99,102,241,0.55)' },
  queued:  { color: '#94a3b8', bg: 'rgba(148,163,184,0.06)', border: 'rgba(148,163,184,0.18)' },
  failed:  { color: '#f87171', bg: 'rgba(248,113,113,0.10)', border: 'rgba(248,113,113,0.35)' },
} as const

/**
 * WorkflowFlow · animated agent orchestration flow.
 *
 * Each node is a stage. Edges between nodes pulse along their length when
 * data is flowing (done → active hop), and the active node breathes. Active
 * nodes can optionally surface a one-line reasoning snippet above them.
 */
export function WorkflowFlow({
  nodes,
  className,
}: {
  nodes: FlowNode[]
  className?: string
}) {
  return (
    <div className={cn('relative w-full overflow-x-auto scrollbar-thin', className)}>
      <div className="flex items-stretch gap-0 min-w-max py-3 px-1">
        {nodes.map((node, i) => {
          const Icon = node.icon
          const style = STATUS_STYLES[node.status]
          const isLast = i === nodes.length - 1
          const isActiveNode = node.status === 'active'
          const nextNode = nodes[i + 1]

          // Edge style: if the next stage is downstream-of-active, it's "in flight"
          const edgeInFlight = isActiveNode || (node.status === 'done' && nextNode?.status === 'active')
          const edgeStyle = node.status === 'done'
            ? STATUS_STYLES.done
            : isActiveNode
              ? STATUS_STYLES.active
              : STATUS_STYLES.queued

          return (
            <div key={node.id} className="flex items-stretch">
              {/* Node column */}
              <div className="relative flex flex-col items-center w-[148px] shrink-0">

                {/* Reasoning snippet · only above the active node */}
                <div className="h-7 flex items-end mb-1">
                  {isActiveNode && node.reasoning && (
                    <div
                      className="caption-mono text-[9px] text-secondary px-1.5 py-0.5 rounded animate-fade-in-down max-w-[136px] truncate text-center"
                      title={node.reasoning}
                    >
                      “{node.reasoning}”
                    </div>
                  )}
                </div>

                {/* Node tile */}
                <div
                  className={cn(
                    'relative w-14 h-14 rounded-2xl flex items-center justify-center chrome-edge transition-all duration-300 ease-os',
                    isActiveNode && 'animate-glow-pulse magnify',
                  )}
                  style={{
                    background: `linear-gradient(135deg, ${style.bg}, transparent)`,
                    border: `1px solid ${style.border}`,
                    boxShadow: isActiveNode
                      ? `0 0 28px ${style.color}55, inset 0 1px 0 rgba(255,255,255,0.08)`
                      : `0 4px 12px -2px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.05)`,
                  }}
                >
                  <Icon className="w-5 h-5" style={{ color: style.color }} />

                  {/* Status corner indicator */}
                  {isActiveNode && (
                    <span
                      className="absolute -top-1 -right-1 w-3 h-3 rounded-full"
                      style={{
                        background: style.color,
                        boxShadow: `0 0 8px ${style.color}`,
                        animation: 'breatheSoft 1.6s ease-in-out infinite',
                      }}
                    />
                  )}
                  {node.status === 'done' && (
                    <span
                      className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full flex items-center justify-center"
                      style={{
                        background: style.color,
                        boxShadow: `0 0 6px ${style.color}66`,
                      }}
                    >
                      <svg viewBox="0 0 12 12" className="w-1.5 h-1.5 text-black/80">
                        <path d="M2 6 L5 9 L10 3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </span>
                  )}
                  {node.status === 'failed' && (
                    <span
                      className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full"
                      style={{
                        background: style.color,
                        boxShadow: `0 0 6px ${style.color}88`,
                      }}
                    />
                  )}
                </div>

                {/* Label */}
                <div className="mt-2.5 text-center">
                  <p className="text-[11px] font-semibold text-white/90 leading-tight tracking-tight">{node.label}</p>
                  {node.sublabel && (
                    <p className="caption-mono text-[9.5px] text-secondary mt-0.5">{node.sublabel}</p>
                  )}
                </div>
              </div>

              {/* Edge */}
              {!isLast && (
                <div className="flex-1 min-w-[64px] flex items-center pt-7 pb-7 relative">
                  <svg
                    width="100%"
                    height="28"
                    viewBox="0 0 100 28"
                    preserveAspectRatio="none"
                    className="overflow-visible"
                  >
                    <defs>
                      <linearGradient id={`edge-${node.id}-${i}`} x1="0%" y1="0%" x2="100%" y2="0%">
                        <stop offset="0%"   stopColor={edgeStyle.color} stopOpacity="0.85" />
                        <stop offset="100%" stopColor={STATUS_STYLES[nextNode?.status ?? 'queued'].color} stopOpacity="0.6" />
                      </linearGradient>
                    </defs>

                    {/* Base hairline */}
                    <line
                      x1="0" y1="14" x2="100" y2="14"
                      stroke={`url(#edge-${node.id}-${i})`}
                      strokeWidth="1.5"
                      strokeDasharray="4 4"
                      strokeLinecap="round"
                      className={edgeInFlight ? 'flow-edge' : ''}
                    />

                    {/* Running pulse · only for in-flight edges */}
                    {edgeInFlight && (
                      <circle
                        cx="0" cy="14" r="2.2"
                        fill={edgeStyle.color}
                      >
                        <animate
                          attributeName="cx"
                          values="0;100"
                          dur="2.4s"
                          repeatCount="indefinite"
                        />
                        <animate
                          attributeName="opacity"
                          values="0;1;1;0"
                          keyTimes="0;0.1;0.9;1"
                          dur="2.4s"
                          repeatCount="indefinite"
                        />
                      </circle>
                    )}

                    {/* Arrowhead */}
                    <polygon
                      points="94,10 100,14 94,18"
                      fill={STATUS_STYLES[nextNode?.status ?? 'queued'].color}
                      opacity="0.75"
                    />
                  </svg>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
