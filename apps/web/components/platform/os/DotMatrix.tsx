import { cn } from '@/lib/utils'

interface DotMatrixProps {
  cols?: number
  rows?: number
  size?: number      // dot diameter in px
  gap?: number       // px between dot centers
  color?: string
  className?: string
  mask?: 'fade-right' | 'fade-bottom' | 'fade-radial' | 'none'
}

/**
 * Nothing-OS dot matrix — used as a subtle background accent.
 * SVG so it renders crisply at any size and supports masks.
 */
export function DotMatrix({
  cols = 24,
  rows = 8,
  size = 1.4,
  gap = 12,
  color = 'rgba(255,255,255,0.18)',
  className,
  mask = 'fade-right',
}: DotMatrixProps) {
  const width = cols * gap
  const height = rows * gap
  const dots: { x: number; y: number }[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      dots.push({ x: c * gap + gap / 2, y: r * gap + gap / 2 })
    }
  }

  const maskStyle: React.CSSProperties =
    mask === 'fade-right'
      ? { maskImage: 'linear-gradient(90deg, black 0%, transparent 90%)',
          WebkitMaskImage: 'linear-gradient(90deg, black 0%, transparent 90%)' }
      : mask === 'fade-bottom'
      ? { maskImage: 'linear-gradient(180deg, black 0%, transparent 90%)',
          WebkitMaskImage: 'linear-gradient(180deg, black 0%, transparent 90%)' }
      : mask === 'fade-radial'
      ? { maskImage: 'radial-gradient(ellipse 70% 70% at 50% 50%, black 0%, transparent 90%)',
          WebkitMaskImage: 'radial-gradient(ellipse 70% 70% at 50% 50%, black 0%, transparent 90%)' }
      : {}

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn('pointer-events-none', className)}
      style={maskStyle}
      aria-hidden
    >
      {dots.map((d, i) => (
        <circle key={i} cx={d.x} cy={d.y} r={size} fill={color} />
      ))}
    </svg>
  )
}

/**
 * NowBadge — Nothing-OS style "NOW" label with animated dot stack.
 */
export function NowBadge({ label = 'NOW LIVE' }: { label?: string }) {
  return (
    <div
      className="inline-flex items-center gap-2 h-6 pl-2 pr-2.5 rounded-full"
      style={{
        background: 'rgba(212,165,116,0.08)',
        border: '1px solid rgba(212,165,116,0.25)',
      }}
    >
      <span className="relative inline-flex w-1.5 h-1.5">
        <span className="absolute inset-0 rounded-full" style={{ background: '#d4a574', boxShadow: '0 0 6px #d4a574' }} />
        <span className="absolute inset-0 rounded-full animate-ping opacity-60" style={{ background: '#d4a574' }} />
      </span>
      <span className="text-[9.5px] font-bold uppercase tracking-[0.22em]" style={{ color: '#e8c89a' }}>
        {label}
      </span>
    </div>
  )
}
