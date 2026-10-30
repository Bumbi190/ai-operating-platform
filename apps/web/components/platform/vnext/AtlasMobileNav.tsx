import Link from 'next/link'
import { AtlasInboxNotice } from './AtlasInboxNotice'
import { MobileMenuLink } from './MobileMenuLink'
import { Menu } from 'lucide-react'
import { OmniraMark } from '@/components/platform/OmniraLogo'
import { vnextNavItemsFor } from '@/lib/nav/vnext-nav'
import styles from './AtlasHomeVNext.module.css'

/**
 * Mobile reads the same canonical model as the desktop shell, so the two cannot
 * drift apart again. They did: this list was built from the registry, which
 * labels the same destinations 'Approvals', 'Activity' and 'Knowledge' while
 * desktop showed 'Granskningar', 'Aktivitet' and 'Minne' — and 'knowledge' is an
 * alias to /memory that never had a page of its own.
 *
 * The original destinations retain their identity, and the shared model owns
 * mobile visibility, including the portfolio quick-jump added for touch access.
 *
 * Individual project selection is deliberately absent. The mobile menu now has
 * one 'Projekt' quick jump to /projects (the spatial portfolio overview),
 * but never lists individual projects. ProjectRail and ProjectCoverGallery remain the
 * canonical project selection surfaces; no private destination list is added.
 */
const PRIMARY_LINKS = vnextNavItemsFor('mobile')

export function AtlasMobileNav() {
  return (
    <header data-shell-mobile-nav className={styles.mobileHeader}>
      <Link href="/dashboard?ui=vnext" className={styles.mobileBrand} aria-label="Omnira hem">
        <OmniraMark size={28} />
        <span>OMNIRA</span>
      </Link>
      <div style={{display:'flex',alignItems:'center',gap:8}}>
      <AtlasInboxNotice />
      <details className={styles.mobileMenu}>
        <summary aria-label="Öppna huvudnavigation">
          <Menu size={19} />
          <span>Meny</span>
        </summary>
        <nav aria-label="Huvudnavigation">
          {PRIMARY_LINKS.map((item) => <MobileMenuLink key={item.id} href={item.href}>{item.label}</MobileMenuLink>)}
        </nav>
      </details>
      </div>
    </header>
  )
}
