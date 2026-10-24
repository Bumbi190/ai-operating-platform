'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'

/** Close the native menu before Next.js starts client-side navigation. */
export function closeMobileMenuOnNavigation(link: HTMLAnchorElement): void {
  link.closest('details')?.removeAttribute('open')
}

/**
 * Tiny client leaf: AtlasMobileNav stays server-rendered and continues to
 * consume the canonical navigation model. This also closes on a same-page tap.
 */
export function MobileMenuLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} onClick={(event) => closeMobileMenuOnNavigation(event.currentTarget)}>
      {children}
    </Link>
  )
}
