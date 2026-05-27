/**
 * OmniraLogo — geometric 4-pointed star mark + wordmark
 *
 * The mark is a 4-pointed star divided into 8 triangular facets,
 * each with a slightly different silver/chrome shade to create a
 * precise, metallic, 3D-faceted look — like a navigation compass
 * or a cut gemstone.
 *
 * Variants:
 *   full        — mark + "OMNIRA" wordmark (horizontal)
 *   mark        — mark only (square, any size)
 *   compact     — 28px mark + "OMNIRA" (sidebar)
 *   wordmark    — text only, no mark
 *   icon        — app icon (rounded square with mark)
 */

import React from 'react'

// ─── The Omnira mark geometry ─────────────────────────────────────────────────
// ViewBox: 0 0 100 100
// 4-pointed star: outer points N(50,5) E(95,50) S(50,95) W(5,50)
//                 inner joints NE(64,36) SE(64,64) SW(36,64) NW(36,36)
// Divided into 8 triangular facets from center (50,50) outward.
// Light source: upper-right → brighter faces tilt toward upper-right.

const FACETS = [
  // [triangle vertices, opacity for silver base]
  // Top petal — right face (faces upper-right, brightest)
  { pts: '50,5 64,36 50,50', fill: '#dde4ed', },
  // Top petal — left face (faces upper-left, bright)
  { pts: '50,5 50,50 36,36', fill: '#bcc8d8', },
  // Right petal — top face (faces upper-right, bright)
  { pts: '64,36 95,50 50,50', fill: '#ccd6e4', },
  // Right petal — bottom face (faces lower-right, medium)
  { pts: '95,50 64,64 50,50', fill: '#a0b0c4', },
  // Bottom petal — right face (faces lower-right, medium-dark)
  { pts: '64,64 50,95 50,50', fill: '#8898ac', },
  // Bottom petal — left face (faces lower-left, dark)
  { pts: '50,95 36,64 50,50', fill: '#7488a0', },
  // Left petal — bottom face (faces lower-left, dark)
  { pts: '36,64 5,50 50,50', fill: '#8090a4', },
  // Left petal — top face (faces upper-left, medium)
  { pts: '5,50 36,36 50,50', fill: '#a8b8cc', },
]

// Center diamond highlight
const CENTER_DIAMOND = '50,38 62,50 50,62 38,50'

// Separator lines between facets
const LINES = [
  // cardinal lines through center
  { x1: 50, y1: 5,  x2: 50, y2: 95  }, // N-S
  { x1: 5,  y1: 50, x2: 95, y2: 50  }, // W-E
  // diagonal lines (inner joint to inner joint)
  { x1: 36, y1: 36, x2: 64, y2: 64  }, // NW-SE
  { x1: 64, y1: 36, x2: 36, y2: 64  }, // NE-SW
  // outer contour (the 8 edges)
  { x1: 50, y1: 5,  x2: 64, y2: 36  },
  { x1: 64, y1: 36, x2: 95, y2: 50  },
  { x1: 95, y1: 50, x2: 64, y2: 64  },
  { x1: 64, y1: 64, x2: 50, y2: 95  },
  { x1: 50, y1: 95, x2: 36, y2: 64  },
  { x1: 36, y1: 64, x2: 5,  y2: 50  },
  { x1: 5,  y1: 50, x2: 36, y2: 36  },
  { x1: 36, y1: 36, x2: 50, y2: 5   },
]

// ─── Mark SVG (bare symbol) ───────────────────────────────────────────────────

interface MarkProps {
  size?: number
  className?: string
  /** 'silver' = metallic (default) | 'white' = flat white | 'dark' = flat dark */
  variant?: 'silver' | 'white' | 'dark'
}

export function OmniraMark({ size = 32, className = '', variant = 'silver' }: MarkProps) {
  const isFlat = variant !== 'silver'
  const flatFill = variant === 'white' ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.15)'

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Omnira mark"
    >
      {/* Background (transparent by default) */}

      {/* Facets */}
      {FACETS.map((f, i) =>
        isFlat ? null : (
          <polygon key={i} points={f.pts} fill={f.fill} />
        )
      )}

      {/* Flat variant: single star shape */}
      {isFlat && (
        <polygon
          points="50,5 64,36 95,50 64,64 50,95 36,64 5,50 36,36"
          fill={flatFill}
        />
      )}

      {/* Separator lines */}
      {!isFlat && LINES.map((l, i) => (
        <line
          key={i}
          x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
          stroke="rgba(0,0,0,0.25)"
          strokeWidth="0.6"
          strokeLinecap="round"
        />
      ))}

      {/* Center diamond highlight */}
      {!isFlat && (
        <>
          <polygon
            points={CENTER_DIAMOND}
            fill="rgba(240,248,255,0.25)"
            stroke="rgba(255,255,255,0.35)"
            strokeWidth="0.5"
          />
          {/* Very subtle center glow dot */}
          <circle cx="50" cy="50" r="2" fill="rgba(255,255,255,0.4)" />
        </>
      )}

      {/* Outer edge highlight (top-right) */}
      {!isFlat && (
        <polygon
          points="50,5 64,36 95,50 64,64 50,95 36,64 5,50 36,36"
          fill="none"
          stroke="rgba(255,255,255,0.15)"
          strokeWidth="0.8"
        />
      )}
    </svg>
  )
}

// ─── App icon (rounded square with mark) ─────────────────────────────────────

export function OmniraAppIcon({ size = 64 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Omnira app icon"
    >
      <defs>
        <linearGradient id="icon-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#0d1222" />
          <stop offset="100%" stopColor="#070c18" />
        </linearGradient>
        <radialGradient id="icon-glow" cx="50%" cy="35%" r="55%">
          <stop offset="0%" stopColor="#2a3060" stopOpacity="0.8" />
          <stop offset="100%" stopColor="transparent" />
        </radialGradient>
      </defs>

      {/* Rounded square background */}
      <rect width="100" height="100" rx="22" fill="url(#icon-bg)" />
      <rect width="100" height="100" rx="22" fill="url(#icon-glow)" />

      {/* Border */}
      <rect
        width="99" height="99" x="0.5" y="0.5"
        rx="21.5"
        fill="none"
        stroke="rgba(255,255,255,0.08)"
        strokeWidth="1"
      />

      {/* Mark centered & scaled */}
      <g transform="translate(20, 20) scale(0.6)">
        {FACETS.map((f, i) => (
          <polygon key={i} points={f.pts} fill={f.fill} />
        ))}
        {LINES.map((l, i) => (
          <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
            stroke="rgba(0,0,0,0.2)" strokeWidth="0.8" strokeLinecap="round" />
        ))}
        <polygon points={CENTER_DIAMOND}
          fill="rgba(240,248,255,0.3)" stroke="rgba(255,255,255,0.4)" strokeWidth="0.5" />
        <circle cx="50" cy="50" r="2" fill="rgba(255,255,255,0.5)" />
        <polygon points="50,5 64,36 95,50 64,64 50,95 36,64 5,50 36,36"
          fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1" />
      </g>
    </svg>
  )
}

// ─── Favicon (minimal, high contrast) ────────────────────────────────────────

export function OmniraFavicon({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Pure white star at small sizes — maximum legibility */}
      <polygon
        points="50,5 64,36 95,50 64,64 50,95 36,64 5,50 36,36"
        fill="white"
        opacity="0.92"
      />
      <polygon
        points="50,5 64,36 95,50 64,64 50,95 36,64 5,50 36,36"
        fill="none"
        stroke="rgba(0,0,0,0.12)"
        strokeWidth="1"
      />
      {/* Center cut */}
      <polygon points={CENTER_DIAMOND} fill="rgba(30,40,80,0.5)" />
    </svg>
  )
}

// ─── Wordmark only ────────────────────────────────────────────────────────────

export function OmniraWordmark({
  size = 14,
  color = 'white',
}: {
  size?: number
  color?: string
}) {
  return (
    <span
      style={{
        fontSize: size,
        fontWeight: 800,
        letterSpacing: '0.2em',
        color,
        fontFamily: 'var(--font-geist-sans, Inter, sans-serif)',
        textTransform: 'uppercase',
        lineHeight: 1,
      }}
    >
      OMNIRA
    </span>
  )
}

// ─── Full horizontal logo (mark + wordmark) ───────────────────────────────────

interface FullLogoProps {
  size?: 'xs' | 'sm' | 'md' | 'lg'
  variant?: 'silver' | 'white' | 'dark'
  className?: string
}

const SIZES = {
  xs: { mark: 16, text: 11, gap: 6 },
  sm: { mark: 24, text: 13, gap: 8 },
  md: { mark: 32, text: 15, gap: 10 },
  lg: { mark: 48, text: 20, gap: 14 },
}

export function OmniraLogo({ size = 'sm', variant = 'silver', className = '' }: FullLogoProps) {
  const s = SIZES[size]
  return (
    <div className={`flex items-center ${className}`} style={{ gap: s.gap }}>
      <OmniraMark size={s.mark} variant={variant} />
      <OmniraWordmark size={s.text} />
    </div>
  )
}

// ─── Sidebar compact logo ─────────────────────────────────────────────────────

export function OmniraSidebarLogo({ isLive = true }: { isLive?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      {/* Mark with subtle glow ring */}
      <div className="relative flex items-center justify-center shrink-0">
        <div
          className="absolute inset-0 rounded-lg blur-md"
          style={{ background: 'rgba(99,130,255,0.15)', transform: 'scale(1.3)' }}
        />
        <OmniraMark size={28} variant="silver" />
      </div>

      <div>
        <div className="flex items-center gap-1.5">
          <span
            style={{
              fontSize: 13,
              fontWeight: 800,
              letterSpacing: '0.18em',
              color: 'rgba(255,255,255,0.88)',
              fontFamily: 'var(--font-geist-sans, Inter, sans-serif)',
              textTransform: 'uppercase',
              lineHeight: 1,
            }}
          >
            OMNIRA
          </span>
        </div>
        <p className="text-[9px] text-zinc-600 tracking-widest uppercase leading-none mt-0.5">
          AI Operating System
        </p>
      </div>

      {/* Live status dot */}
      {isLive && (
        <div className="ml-auto flex items-center shrink-0">
          <div className="relative">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <div className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-50" />
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Loading screen logo ──────────────────────────────────────────────────────

export function OmniraLoadingLogo() {
  return (
    <div className="flex flex-col items-center gap-6">
      {/* Large mark with glow rings */}
      <div className="relative">
        {/* Outer ring */}
        <div
          className="absolute inset-0 rounded-full animate-ping"
          style={{
            background: 'transparent',
            border: '1px solid rgba(99,130,255,0.2)',
            transform: 'scale(1.6)',
            animationDuration: '2s',
          }}
        />
        {/* Middle ring */}
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: 'transparent',
            border: '1px solid rgba(99,130,255,0.15)',
            transform: 'scale(1.3)',
          }}
        />
        {/* Mark */}
        <OmniraMark size={64} variant="silver" />
      </div>

      {/* Wordmark */}
      <div className="flex flex-col items-center gap-1">
        <span
          style={{
            fontSize: 22,
            fontWeight: 800,
            letterSpacing: '0.3em',
            color: 'rgba(255,255,255,0.9)',
            fontFamily: 'var(--font-geist-sans, Inter, sans-serif)',
            textTransform: 'uppercase',
          }}
        >
          OMNIRA
        </span>
        <span
          style={{
            fontSize: 10,
            fontWeight: 500,
            letterSpacing: '0.3em',
            color: 'rgba(255,255,255,0.3)',
            textTransform: 'uppercase',
          }}
        >
          AI OPERATING SYSTEM
        </span>
      </div>
    </div>
  )
}
