'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { Activity, X } from 'lucide-react'
import { PulseDot } from './PulseDot'
import { hasDesktopActivityRail } from '@/lib/nav/activity-peek-visibility'
import type { OmniraUiGeneration } from '@/lib/ui/generation'

interface MobileRailToggleProps {
  /** number of live events to indicate */
  liveCount?: number
  /**
   * Resolved server-side by the platform layout — never parsed here. Required,
   * so a new mount cannot silently fall back to a guess about the generation.
   */
  uiGeneration: OmniraUiGeneration
  children: ReactNode  // the rail content to render inside the sheet
}

/**
 * MobileRailToggle · P0: universell aktivitets-peek (alla skärmstorlekar) —
 * flytande knapp som öppnar railen som panel. Tidigare endast <lg; railen var
 * dismissible bottom sheet with a floating indicator button.
 *
 * Restraint: invisible on desktop. On mobile the indicator sits in the
 * bottom-right above the safe area and shows a small live count.
 */
export function MobileRailToggle({ liveCount = 0, uiGeneration, children }: MobileRailToggleProps) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  // The generation arrives resolved from the server layout. This component does
  // not read `?ui=`, the cookie or the default — that precedence lives in
  // lib/ui/generation.ts and nowhere else, so the peek behaves the same however
  // the operator navigated to the route.
  const atlasVNextHasDesktopRail = hasDesktopActivityRail(pathname, uiGeneration)

  // Lock background scroll while sheet is open
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  // Escape to close
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  return (
    <>
      {/* Indicator button · only visible <lg */}
      <button
        type="button"
        aria-label="Open live activity"
        onClick={() => setOpen(true)}
        className={`${atlasVNextHasDesktopRail ? 'lg:hidden' : ''} fixed z-50 bottom-5 right-5 h-11 px-4 rounded-full flex items-center gap-2 press ease-os`}
        style={{
          background: 'linear-gradient(180deg, rgba(99,102,241,0.40) 0%, rgba(79,70,229,0.55) 100%)',
          border: '1px solid rgba(99,102,241,0.55)',
          color: 'white',
          boxShadow: '0 16px 36px -10px rgba(99,102,241,0.55), 0 0 0 1px rgba(255,255,255,0.05) inset',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        <Activity className="w-3.5 h-3.5" />
        <span className="text-[12px] font-semibold tracking-tight">Activity</span>
        {liveCount > 0 && (
          <span className="inline-flex items-center gap-1 caption-mono text-[10px] text-white/90">
            <PulseDot tone="emerald" size={4} />
            {liveCount}
          </span>
        )}
      </button>

      {/* Backdrop */}
      {open && (
        <div
          aria-hidden
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-[55] animate-fade-in"
          style={{
            background: 'rgba(3,5,22,0.65)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
          }}
        />
      )}

      {/* Bottom sheet */}
      {open && (
        <aside
          className="fixed inset-x-0 bottom-0 lg:inset-x-auto lg:inset-y-0 lg:right-0 lg:w-[360px] z-[56] animate-fade-in-up"
          style={{
            background: 'linear-gradient(180deg, rgba(7,11,28,0.95) 0%, rgba(5,8,22,0.98) 100%)',
            borderTop: '1px solid rgba(255,255,255,0.05)',
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            maxHeight: '82vh',
            boxShadow: '0 -24px 60px -16px rgba(0,0,0,0.65)',
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          }}
          role="dialog"
          aria-label="Live activity"
        >
          {/* Drag handle */}
          <div className="pt-2 pb-1 flex justify-center">
            <span className="w-9 h-1 rounded-full bg-white/15" />
          </div>

          {/* Close affordance */}
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close"
            className="absolute top-3 right-3 w-7 h-7 rounded-md flex items-center justify-center text-secondary hover:text-white transition-colors ease-os"
            style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}
          >
            <X className="w-3.5 h-3.5" />
          </button>

          <div className="max-h-[calc(82vh-12px)] overflow-y-auto scrollbar-thin">
            {children}
          </div>
        </aside>
      )}
    </>
  )
}
