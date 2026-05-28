/**
 * Omnira OS · Design System Constants
 *
 * Single source of truth for spacing, motion, elevation, glow, tier behavior,
 * typography, and panel layering. Reference these from TS instead of hard-
 * coding values. The CSS layer mirrors these in globals.css under :root vars.
 */

// ─── Spacing scale (px) ───────────────────────────────────────────────────────
// Rhythm: prefer multiples of 4. Sections use 32–48. Panels use 24. Tight rows use 8–12.
export const SPACE = {
  '0': 0,
  '1': 4,
  '2': 8,
  '3': 12,
  '4': 16,
  '5': 20,
  '6': 24,
  '7': 32,
  '8': 40,
  '9': 48,
  '10': 64,
  '11': 96,
  '12': 128,
} as const

// ─── Motion ───────────────────────────────────────────────────────────────────
export const MOTION = {
  duration: {
    instant: 80,    // hover tints, focus rings
    fast:    160,   // small UI shifts
    base:    240,   // default
    slow:    400,   // panel reveals, mode shifts
    ambient: 800,   // atmospheric breath
    tide:    1600,  // mode atmosphere transitions
  },
  ease: {
    /** Calm Linear/Arc curve — use for almost everything */
    os:        'cubic-bezier(0.22, 1, 0.36, 1)',
    /** Symmetric — use for state oscillation (breathe, halo) */
    inOut:     'cubic-bezier(0.65, 0, 0.35, 1)',
    /** Emphasis — for state transitions that need accent */
    emphasis:  'cubic-bezier(0.2, 0, 0, 1)',
  },
} as const

// ─── Glow intensity ──────────────────────────────────────────────────────────
// Restraint: only mission-CRITICAL and active LIVE surfaces ever wear "prominent".
// Everything else stays at "subtle" or "none".
export const GLOW = {
  none:      'none',
  subtle:    '0 0 0 1px rgba(99,102,241,0.18), 0 0 14px -4px rgba(99,102,241,0.16)',
  prominent: '0 0 0 1px rgba(99,102,241,0.30), 0 0 24px -4px rgba(99,102,241,0.28), 0 0 60px -16px rgba(99,102,241,0.20)',
  critical:  '0 0 0 1px rgba(212,165,116,0.32), 0 0 22px -4px rgba(212,165,116,0.28), 0 0 56px -16px rgba(212,165,116,0.18)',
} as const

// ─── Elevation scale ──────────────────────────────────────────────────────────
// Used for shadow depth. Higher = nearer the operator.
export const ELEVATION = {
  flat: 'none',
  /** Quiet — list rows, inline panels */
  e1: '0 2px 8px rgba(0,0,0,0.25)',
  /** Standard panel */
  e2: '0 8px 24px rgba(0,0,0,0.35)',
  /** Featured panel */
  e3: '0 16px 40px -8px rgba(0,0,0,0.45), 0 0 0 1px rgba(255,255,255,0.04)',
  /** Modal / focused surface */
  e4: '0 28px 60px -12px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.05)',
  /** Spotlight (rarely) */
  e5: '0 40px 80px -16px rgba(0,0,0,0.70), 0 0 0 1px rgba(255,255,255,0.06)',
} as const

// ─── Mission state tiers ─────────────────────────────────────────────────────
// The four-tier hierarchy. Every operational surface should commit to ONE tier.
export type Tier = 'critical' | 'live' | 'passive' | 'archived'

export const TIER: Record<Tier, {
  color:       string
  colorSoft:   string
  bg:          string
  border:      string
  glow:        string
  label:       string
  /** When this tier should appear */
  intent:      string
  /** Whether the tier may use motion (pulse-tape, halo, etc.) */
  motion:      'persistent' | 'occasional' | 'none'
}> = {
  critical: {
    color:     '#d4a574',
    colorSoft: '#e8c89a',
    bg:        'rgba(212,165,116,0.08)',
    border:    'rgba(212,165,116,0.30)',
    glow:      GLOW.critical,
    label:     'Critical',
    intent:    'Operator action required · only when work is pending',
    motion:    'occasional',
  },
  live: {
    color:     '#818cf8',
    colorSoft: '#a5b4fc',
    bg:        'rgba(99,102,241,0.08)',
    border:    'rgba(99,102,241,0.28)',
    glow:      GLOW.prominent,
    label:     'Live',
    intent:    'Systems doing autonomous work right now',
    motion:    'persistent',
  },
  passive: {
    color:     'rgba(255,255,255,0.78)',
    colorSoft: 'rgba(255,255,255,0.60)',
    bg:        'rgba(255,255,255,0.030)',
    border:    'rgba(255,255,255,0.060)',
    glow:      GLOW.none,
    label:     'Passive',
    intent:    'Informational · calm',
    motion:    'none',
  },
  archived: {
    color:     'rgba(255,255,255,0.40)',
    colorSoft: 'rgba(255,255,255,0.25)',
    bg:        'rgba(255,255,255,0.015)',
    border:    'rgba(255,255,255,0.035)',
    glow:      GLOW.none,
    label:     'Archived',
    intent:    'History · dimmed · should recede',
    motion:    'none',
  },
}

// ─── Typography scale ────────────────────────────────────────────────────────
export const TYPE = {
  /** 40–68px responsive · hero headlines only */
  displayHero:    'clamp(40px, 5.2vw, 68px)',
  /** 22–30px responsive · section titles */
  displaySection: 'clamp(22px, 1.8vw, 30px)',
  /** Body */
  body:           '13px',
  /** Compact body / table cells */
  bodyCompact:    '12px',
  /** Caption / supporting */
  caption:        '11px',
  /** Mono caption · instrument readouts, timestamps */
  captionMono:    '10.5px',
  /** Eyebrow · uppercase monospace labels */
  eyebrow:        '10px',
  /** Eyebrow tight */
  eyebrowTight:   '9px',

  weight: {
    regular:  400,
    medium:   500,
    semibold: 600,
    bold:     700,
  },

  tracking: {
    eyebrow: '0.22em',
    headline: '-0.025em',
    body: '-0.005em',
  },
} as const

// ─── Panel layering · z-index scale ──────────────────────────────────────────
export const Z = {
  base:    1,
  content: 10,
  panel:   20,
  bar:     30,
  rail:    40,
  sheet:   50,
  modal:   60,
  toast:   70,
} as const

// ─── Operator Modes ──────────────────────────────────────────────────────────
export type OperatorMode = 'standard' | 'focus' | 'autonomous' | 'incident' | 'publishing' | 'maintenance'

export const OPERATOR_MODES: Record<OperatorMode, {
  label:       string
  intent:      string
  /** Short caption shown next to the switcher */
  shortLabel:  string
  /** Body class applied when active */
  bodyClass:   string
  /** Critical-tone variant of the switcher chip */
  tone:        'standard' | 'critical' | 'gold'
}> = {
  standard: {
    label:      'Standard',
    intent:     'Full visibility · all systems audible',
    shortLabel: 'Standard',
    bodyClass:  'mode-standard',
    tone:       'standard',
  },
  focus: {
    label:      'Focus',
    intent:     'Suppress passive surfaces · spotlight current execution',
    shortLabel: 'Focus',
    bodyClass:  'mode-focus',
    tone:       'standard',
  },
  autonomous: {
    label:      'Autonomous',
    intent:     'Trust mode · agents act without operator prompts',
    shortLabel: 'Auto',
    bodyClass:  'mode-autonomous',
    tone:       'gold',
  },
  incident: {
    label:      'Incident',
    intent:     'Raise critical signal · escalate every failure',
    shortLabel: 'Incident',
    bodyClass:  'mode-incident',
    tone:       'critical',
  },
  publishing: {
    label:      'Publishing',
    intent:     'Surface distribution timeline · de-emphasize the rest',
    shortLabel: 'Publish',
    bodyClass:  'mode-publishing',
    tone:       'standard',
  },
  maintenance: {
    label:      'Maintenance',
    intent:     'Read-only OS · system upgrades in flight',
    shortLabel: 'Mtnce',
    bodyClass:  'mode-maintenance',
    tone:       'standard',
  },
}

// ─── Tier behavior matrix ────────────────────────────────────────────────────
// Use this when deciding how to compose a new surface.
export const TIER_BEHAVIOR = {
  critical: {
    panelStyle:  'tier-surface · always visible top-of-page · pulse on the icon',
    typography:  'use gold eyebrow + white-on-glass body',
    motion:      'critical icon may breathe-soft; no shimmer',
    when:        'Operator decision required · failures · pending approvals',
  },
  live: {
    panelStyle:  'panel-feature with halo + pulse-tape · OR plain panel with subtle glow',
    typography:  'live indigo eyebrow + white headline · streaming text allowed',
    motion:      'halo breath, pulse-tape, streaming caret, edge-flow',
    when:        'A workflow is mid-execution · agents are reasoning',
  },
  passive: {
    panelStyle:  'panel or panel-quiet · no glow',
    typography:  'white-on-glass · monospace eyebrows',
    motion:      'none beyond fade-in-up on load',
    when:        'Analytics, portfolios, secondary info',
  },
  archived: {
    panelStyle:  'panel-quiet at 85% opacity · zinc tones',
    typography:  'zinc text + dimmed caption-mono',
    motion:      'none',
    when:        'History, completed runs, anything older than 24h',
  },
} as const
