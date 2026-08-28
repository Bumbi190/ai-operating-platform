'use client'

import type { ReactNode } from 'react'
import { usePathname } from 'next/navigation'
import { shouldRenderShellMobileNav } from '@/lib/nav/mobile-shell-visibility'
import type { OmniraUiGeneration } from '@/lib/ui/generation'

interface ShellMobileNavProps {
  /**
   * Resolved server-side by the platform layout — never parsed here, the same
   * contract the sidebar and the activity peek already follow.
   */
  uiGeneration: OmniraUiGeneration
  /**
   * The nav itself, passed in already rendered. `AtlasMobileNav` is a server
   * component and stays one: handing it through `children` keeps it off the
   * client bundle while this thin wrapper supplies the one thing the server
   * layout cannot know — the current pathname.
   */
  children: ReactNode
}

/**
 * Mounts the vNext mobile nav for the platform shell.
 *
 * Presence only — no markup, no chrome, no styling of its own. Which routes get
 * it is decided by `shouldRenderShellMobileNav`, and *whether it is visible* at
 * a given width is decided by CSS (`.mobileHeader` appears below 1024px), so
 * there is exactly one breakpoint source of truth and it is not this file.
 */
export function ShellMobileNav({ uiGeneration, children }: ShellMobileNavProps) {
  const pathname = usePathname()
  if (!shouldRenderShellMobileNav(pathname, uiGeneration)) return null
  return <>{children}</>
}
