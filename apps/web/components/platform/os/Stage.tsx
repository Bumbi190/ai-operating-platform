import type { ReactNode } from 'react'

/**
 * The Stage — full-screen cinematic backdrop with ambient gradient orbs,
 * grid mesh, and subtle scan line. Used as the root of every Mission Control
 * page so the operator always feels they're inside a command center.
 */
export function Stage({ children }: { children: ReactNode }) {
  return (
    <div className="os-stage os-grain relative min-h-screen">
      {/* Grid mesh */}
      <div className="os-grid" />

      {/* Ambient gradient orbs */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="orb orb-indigo animate-orb" style={{ top: '-10%', left: '5%', width: 520, height: 520 }} />
        <div className="orb orb-violet animate-orb-rev" style={{ top: '40%', right: '-5%', width: 480, height: 480 }} />
        <div className="orb orb-cyan animate-orb" style={{ bottom: '-15%', left: '30%', width: 420, height: 420, animationDelay: '4s' }} />
      </div>

      {/* Scan line */}
      <div className="scan-line" />

      {/* Content */}
      <div className="relative z-10">
        {children}
      </div>
    </div>
  )
}

/**
 * Section header for content groups inside Mission Control.
 */
export function SectionHeader({
  eyebrow,
  title,
  caption,
  right,
}: {
  eyebrow?: string
  title: ReactNode
  caption?: ReactNode
  right?: ReactNode
}) {
  return (
    <div className="flex items-end justify-between gap-4 mb-5">
      <div>
        {eyebrow && (
          <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-indigo-300/70 mb-2">
            {eyebrow}
          </p>
        )}
        <h2 className="text-xl font-semibold tracking-tight text-white/95 leading-tight">
          {title}
        </h2>
        {caption && (
          <p className="text-[12px] text-zinc-500 mt-1.5">{caption}</p>
        )}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  )
}
