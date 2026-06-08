import { cn } from '@/lib/utils'
import type { ReactNode } from 'react'
import { Sparkline } from './Sparkline'

interface HeroStatProps {
  label: string
  value: string | number
  unit?: string
  delta?: { value: string; positive?: boolean }
  trend?: number[]
  color?: string
  icon?: ReactNode
  caption?: string
  delay?: number
  size?: 'sm' | 'md' | 'lg'
  glow?: boolean
  className?: string
}

/**
 * Cinematic hero KPI tile — used in the Mission Control hero grid.
 */
export function HeroStat({
  label,
  value,
  unit,
  delta,
  trend,
  color = '#818cf8',
  icon,
  caption,
  delay = 0,
  size = 'md',
  glow = false,
  className,
}: HeroStatProps) {
  const valueSize = size === 'lg' ? 'text-[44px]' : size === 'sm' ? 'text-2xl' : 'text-[34px]'

  return (
    <div
      className={cn('panel animate-fade-in-up relative overflow-hidden group', className)}
      style={{
        animationDelay: `${delay}ms`,
        animationFillMode: 'both',
      }}
    >
      {/* Color wash */}
      <div
        className="absolute inset-0 pointer-events-none opacity-50 group-hover:opacity-100 transition-opacity duration-500"
        style={{
          background: `radial-gradient(ellipse 80% 60% at 0% 0%, ${color}14 0%, transparent 60%)`,
        }}
      />
      {/* Top accent line */}
      <div
        className="absolute inset-x-0 top-0 h-px opacity-60"
        style={{ background: `linear-gradient(90deg, transparent, ${color}80, transparent)` }}
      />
      {/* Glow corner */}
      {glow && (
        <div
          className="absolute -top-10 -right-10 w-32 h-32 rounded-full pointer-events-none"
          style={{ background: `radial-gradient(circle, ${color}33 0%, transparent 70%)`, filter: 'blur(20px)' }}
        />
      )}

      <div className="relative px-5 pt-5 pb-4">
        {/* Top row */}
        <div className="flex items-center justify-between mb-4">
          <span className="text-[9.5px] font-semibold uppercase tracking-[0.22em] text-secondary">
            {label}
          </span>
          {icon && (
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center chrome-edge"
              style={{ background: `${color}1a`, border: `1px solid ${color}33` }}
            >
              <span style={{ color }}>{icon}</span>
            </div>
          )}
        </div>

        {/* Value */}
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-baseline gap-1.5">
              <p
                className={cn('font-black tracking-tight leading-none num', valueSize)}
                style={{ color }}
              >
                {value}
              </p>
              {unit && (
                <span className="text-[12px] font-semibold text-secondary num">{unit}</span>
              )}
            </div>
            {(caption || delta) && (
              <div className="flex items-center gap-2 mt-2">
                {delta && (
                  <span
                    className="text-[10px] font-semibold num px-1.5 py-0.5 rounded"
                    style={{
                      color: delta.positive ? '#34d399' : '#f87171',
                      background: delta.positive ? 'rgba(52,211,153,0.10)' : 'rgba(248,113,113,0.10)',
                    }}
                  >
                    {delta.positive ? '↑' : '↓'} {delta.value}
                  </span>
                )}
                {caption && <span className="text-[10.5px] text-meta">{caption}</span>}
              </div>
            )}
          </div>
          {trend && trend.length > 1 && (
            <Sparkline values={trend} color={color} height={40} width={88} />
          )}
        </div>
      </div>
    </div>
  )
}
