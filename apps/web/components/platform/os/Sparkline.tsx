interface SparklineProps {
  values: number[]
  color?: string
  height?: number
  width?: number
  fill?: boolean
  className?: string
}

/**
 * Premium sparkline — gradient fill, dot at last point, soft glow.
 */
export function Sparkline({
  values,
  color = '#818cf8',
  height = 36,
  width = 110,
  fill = true,
  className,
}: SparklineProps) {
  if (!values.length) return null
  const max = Math.max(...values, 1)
  const min = Math.min(...values, 0)
  const range = max - min || 1
  const w = width
  const h = height
  const padding = 2

  const points = values.map((v, i) => {
    const x = (i / Math.max(values.length - 1, 1)) * (w - padding * 2) + padding
    const y = h - padding - ((v - min) / range) * (h - padding * 2)
    return [x, y]
  })

  const linePath = points.map(([x, y], i) => (i === 0 ? `M${x},${y}` : `L${x},${y}`)).join(' ')
  const areaPath = `${linePath} L${points[points.length - 1][0]},${h} L${points[0][0]},${h} Z`
  // Deterministic gradient id — derived from inputs so SSR/CSR match
  const sig = values.reduce((s, v, i) => s + Math.round(v) * (i + 1), 0)
  const gid = `sg-${color.replace('#', '')}-${values.length}-${sig}-${w}x${h}`

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className={className}
      style={{ overflow: 'visible' }}
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
        <filter id={`${gid}-glow`}>
          <feGaussianBlur stdDeviation="1.2" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {fill && <path d={areaPath} fill={`url(#${gid})`} />}
      <path
        d={linePath}
        fill="none"
        stroke={color}
        strokeWidth={1.6}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.95}
        filter={`url(#${gid}-glow)`}
      />
      <circle
        cx={points[points.length - 1][0]}
        cy={points[points.length - 1][1]}
        r={2.8}
        fill={color}
      />
      <circle
        cx={points[points.length - 1][0]}
        cy={points[points.length - 1][1]}
        r={5}
        fill={color}
        opacity={0.15}
      />
    </svg>
  )
}

/**
 * Mini bar chart — compact, premium.
 */
export function MiniBars({
  values,
  color = '#818cf8',
  height = 32,
  width = 88,
}: {
  values: number[]
  color?: string
  height?: number
  width?: number
}) {
  if (!values.length) return null
  const max = Math.max(...values, 1)
  const bw = width / values.length - 1.5

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <defs>
        <linearGradient id={`mb-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.95" />
          <stop offset="100%" stopColor={color} stopOpacity="0.35" />
        </linearGradient>
      </defs>
      {values.map((v, i) => {
        const bh = (v / max) * (height - 2)
        return (
          <rect
            key={i}
            x={i * (bw + 1.5)}
            y={height - bh}
            width={bw}
            height={bh}
            rx={1.2}
            fill={`url(#mb-${color.replace('#', '')})`}
          />
        )
      })}
    </svg>
  )
}

/**
 * Radial progress dial — used for confidence / health scores.
 */
export function RadialDial({
  value, // 0-100
  size = 60,
  color = '#818cf8',
  thickness = 4,
  label,
}: {
  value: number
  size?: number
  color?: string
  thickness?: number
  label?: string
}) {
  const r = (size - thickness) / 2
  const c = 2 * Math.PI * r
  const offset = c - (value / 100) * c
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="rgba(255,255,255,0.08)" strokeWidth={thickness} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={color}
          strokeWidth={thickness}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{
            transition: 'stroke-dashoffset 0.8s cubic-bezier(0.22, 1, 0.36, 1)',
            filter: `drop-shadow(0 0 6px ${color}88)`,
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[13px] font-bold num" style={{ color }}>
          {Math.round(value)}
        </span>
        {label && <span className="text-[8px] text-secondary uppercase tracking-wider">{label}</span>}
      </div>
    </div>
  )
}
