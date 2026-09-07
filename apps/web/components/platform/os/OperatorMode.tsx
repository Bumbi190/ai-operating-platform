'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { OPERATOR_MODES, type OperatorMode } from './system'
import { Focus, Bot, AlertOctagon, Send, Wrench, LayoutDashboard } from 'lucide-react'
import { isVNext, type OmniraUiGeneration, DEFAULT_UI_GENERATION } from '@/lib/ui/generation'
import {
  DEFAULT_DISPLAY_SCALE,
  DEFAULT_MOTION_PREFERENCE,
  DISPLAY_SCALE_ATTRIBUTE,
  DISPLAY_SCALE_FACTORS,
  DISPLAY_SCALE_STORAGE_KEY,
  MOTION_ATTRIBUTE,
  MOTION_STORAGE_KEY,
  REDUCED_MOTION_QUERY,
  parseDisplayScale,
  parseMotionPreference,
  resolveMotion,
  type DisplayScale,
  type MotionPreference,
  type ResolvedMotion,
} from '@/lib/ui/display-preferences'

interface OperatorModeContextValue {
  mode:    OperatorMode
  setMode: (mode: OperatorMode) => void
  /** vNext presentation preferences. See lib/ui/display-preferences.ts. */
  displayScale:      DisplayScale
  setDisplayScale:   (scale: DisplayScale) => void
  motionPreference:  MotionPreference
  setMotionPreference: (preference: MotionPreference) => void
  /** The single resolved motion answer every consumer acts on. */
  resolvedMotion:    ResolvedMotion
  /** Whether display scale is offered at all — vNext only. */
  displayScaleAvailable: boolean
}

const OperatorModeCtx = createContext<OperatorModeContextValue>({
  mode:    'standard',
  setMode: () => {},
  displayScale: DEFAULT_DISPLAY_SCALE,
  setDisplayScale: () => {},
  motionPreference: DEFAULT_MOTION_PREFERENCE,
  setMotionPreference: () => {},
  resolvedMotion: 'full',
  displayScaleAvailable: false,
})

const STORAGE_KEY = 'omnira:operator-mode'

/**
 * OperatorModeProvider — the app's one preference provider.
 *
 * It already owned operator mode: read from localStorage, persisted back, and
 * applied as a body-level class so global atmosphere shifts (defined in
 * globals.css under `body.mode-*`) follow it. Display scale and motion join it
 * here rather than arriving with a provider of their own — a second provider
 * would mean a second answer to "what are the operator's preferences", which is
 * the duplication the vNext plan exists to prevent.
 *
 * The three differ in where they land, not in how they work:
 *
 *   operator mode  → body class          both generations (unchanged)
 *   motion         → <html data-motion>  both generations — an accessibility
 *                                        choice must survive a UI rollback
 *   display scale  → <html data-display-scale> + --os-scale, vNext ONLY
 *
 * Display scale is gated because it retunes the root font size, and legacy is
 * the proven rollback path: it must render exactly as it did. With no attribute
 * set, `--os-scale` is never consulted and the root font size is the browser
 * default, so legacy is untouched by construction rather than by care.
 */
export function OperatorModeProvider({
  children,
  uiGeneration = DEFAULT_UI_GENERATION,
}: {
  children: ReactNode
  /**
   * Resolved server-side by the platform layout — never parsed here, the same
   * contract the sidebar, breadcrumbs and the mobile nav already follow.
   */
  uiGeneration?: OmniraUiGeneration
}) {
  const [mode, setMode] = useState<OperatorMode>('standard')
  const [displayScale, setDisplayScale] = useState<DisplayScale>(DEFAULT_DISPLAY_SCALE)
  const [motionPreference, setMotionPreference] = useState<MotionPreference>(DEFAULT_MOTION_PREFERENCE)
  const [systemPrefersReduce, setSystemPrefersReduce] = useState(false)

  const displayScaleAvailable = isVNext(uiGeneration)
  const resolvedMotion = resolveMotion(motionPreference, systemPrefersReduce)

  // Read every stored preference on mount. A malformed value is "no opinion"
  // and falls through to the default rather than being written back as junk.
  useEffect(() => {
    try {
      const savedMode = localStorage.getItem(STORAGE_KEY) as OperatorMode | null
      if (savedMode && OPERATOR_MODES[savedMode]) setMode(savedMode)

      const savedScale = parseDisplayScale(localStorage.getItem(DISPLAY_SCALE_STORAGE_KEY))
      if (savedScale) setDisplayScale(savedScale)

      const savedMotion = parseMotionPreference(localStorage.getItem(MOTION_STORAGE_KEY))
      if (savedMotion) setMotionPreference(savedMotion)
    } catch { /* ignore */ }
  }, [])

  // Track the OS preference so `system` stays live rather than sampled once.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const query = window.matchMedia(REDUCED_MOTION_QUERY)
    setSystemPrefersReduce(query.matches)
    const onChange = (event: MediaQueryListEvent) => setSystemPrefersReduce(event.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  // Apply body class + persist on every change
  useEffect(() => {
    const all = Object.values(OPERATOR_MODES).map(m => m.bodyClass)
    document.body.classList.remove(...all)
    document.body.classList.add(OPERATOR_MODES[mode].bodyClass)
    try { localStorage.setItem(STORAGE_KEY, mode) } catch { /* ignore */ }
  }, [mode])

  // Display scale → root attribute + the multiplier the root font size reads.
  useEffect(() => {
    const root = document.documentElement
    if (!displayScaleAvailable) {
      root.removeAttribute(DISPLAY_SCALE_ATTRIBUTE)
      root.style.removeProperty('--os-scale')
      return
    }
    root.setAttribute(DISPLAY_SCALE_ATTRIBUTE, displayScale)
    root.style.setProperty('--os-scale', String(DISPLAY_SCALE_FACTORS[displayScale]))
    try { localStorage.setItem(DISPLAY_SCALE_STORAGE_KEY, displayScale) } catch { /* ignore */ }
  }, [displayScale, displayScaleAvailable])

  // Motion → the RESOLVED answer on the root, so CSS never combines inputs.
  // The operator's raw choice is what gets persisted; the resolution is derived
  // fresh on every load from whatever the OS preference is at that moment.
  useEffect(() => {
    document.documentElement.setAttribute(MOTION_ATTRIBUTE, resolvedMotion)
  }, [resolvedMotion])

  useEffect(() => {
    try { localStorage.setItem(MOTION_STORAGE_KEY, motionPreference) } catch { /* ignore */ }
  }, [motionPreference])

  return (
    <OperatorModeCtx.Provider
      value={{
        mode, setMode,
        displayScale, setDisplayScale,
        motionPreference, setMotionPreference,
        resolvedMotion,
        displayScaleAvailable,
      }}
    >
      {children}
    </OperatorModeCtx.Provider>
  )
}

export function useOperatorMode() {
  return useContext(OperatorModeCtx)
}

/**
 * The presentation preferences, for surfaces that care about scale or motion
 * but not about operator mode.
 */
export function useDisplayPreferences() {
  const {
    displayScale, setDisplayScale,
    motionPreference, setMotionPreference,
    resolvedMotion, displayScaleAvailable,
  } = useContext(OperatorModeCtx)
  return {
    displayScale, setDisplayScale,
    motionPreference, setMotionPreference,
    resolvedMotion, displayScaleAvailable,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// OperatorModeSwitcher · compact segmented control for the CommandBar
// ═══════════════════════════════════════════════════════════════════════════

const MODE_ICONS: Record<OperatorMode, any> = {
  standard:    LayoutDashboard,
  focus:       Focus,
  autonomous:  Bot,
  incident:    AlertOctagon,
  publishing:  Send,
  maintenance: Wrench,
}

interface OperatorModeSwitcherProps {
  /** Which modes to expose · default all */
  modes?: OperatorMode[]
  /** Render style · "icons" shows just icons, "labels" shows short labels */
  variant?: 'icons' | 'labels'
}

export function OperatorModeSwitcher({
  modes = ['standard', 'focus', 'autonomous', 'incident', 'publishing', 'maintenance'],
  variant = 'icons',
}: OperatorModeSwitcherProps) {
  const { mode, setMode } = useOperatorMode()

  return (
    <div className="mode-switch" role="tablist" aria-label="Operator mode">
      {modes.map(m => {
        const meta = OPERATOR_MODES[m]
        const Icon = MODE_ICONS[m]
        const active = mode === m
        return (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={active}
            title={`${meta.label} · ${meta.intent}`}
            data-active={active}
            data-tone={meta.tone}
            onClick={() => setMode(m)}
          >
            <Icon className="w-3 h-3" />
            {variant === 'labels' && <span>{meta.shortLabel}</span>}
          </button>
        )
      })}
    </div>
  )
}

/**
 * ModeIndicator · a labeled chip showing the current mode.
 * Useful next to the page title or in a sidebar footer.
 */
export function ModeIndicator() {
  const { mode } = useOperatorMode()
  const meta = OPERATOR_MODES[mode]
  const Icon = MODE_ICONS[mode]
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full caption-mono text-[10px]"
      style={{
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.06)',
        color: 'rgba(255,255,255,0.75)',
      }}
    >
      <Icon className="w-2.5 h-2.5 text-indigo-300" />
      <span>{meta.label}</span>
    </span>
  )
}
