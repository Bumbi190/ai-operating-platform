'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { OPERATOR_MODES, type OperatorMode } from './system'
import { Focus, Bot, AlertOctagon, Send, Wrench, LayoutDashboard } from 'lucide-react'

interface OperatorModeContextValue {
  mode:    OperatorMode
  setMode: (mode: OperatorMode) => void
}

const OperatorModeCtx = createContext<OperatorModeContextValue>({
  mode:    'standard',
  setMode: () => {},
})

const STORAGE_KEY = 'omnira:operator-mode'

/**
 * OperatorModeProvider — wraps the app, persists the chosen mode to
 * localStorage, and applies the matching body-level class so global
 * atmosphere shifts (defined in globals.css under `body.mode-*`).
 */
export function OperatorModeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<OperatorMode>('standard')

  // Read from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as OperatorMode | null
      if (saved && OPERATOR_MODES[saved]) {
        setMode(saved)
      }
    } catch { /* ignore */ }
  }, [])

  // Apply body class + persist on every change
  useEffect(() => {
    const all = Object.values(OPERATOR_MODES).map(m => m.bodyClass)
    document.body.classList.remove(...all)
    document.body.classList.add(OPERATOR_MODES[mode].bodyClass)
    try { localStorage.setItem(STORAGE_KEY, mode) } catch { /* ignore */ }
  }, [mode])

  return (
    <OperatorModeCtx.Provider value={{ mode, setMode }}>
      {children}
    </OperatorModeCtx.Provider>
  )
}

export function useOperatorMode() {
  return useContext(OperatorModeCtx)
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
