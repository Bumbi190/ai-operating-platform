import Link from 'next/link'
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
 * Individual project selection is deliberately absent. The shared model now
 * includes a single portfolio entry, so mobile operators can reach the project
 * index without scrolling the Atlas Home screen. Individual destinations stay
 * with ProjectRail and the index; this menu duplicates no project cards.
 */
const PRIMARY_LINKS = vnextNavItemsFor('mobile')

export function AtlasMobileNav() {
  return (
    <header className={styles.mobileHeader}>
      <Link href="/atlas?ui=vnext" className={styles.mobileBrand} aria-label="Omnira Atlas hem">
        <OmniraMark size={28} />
        <span>OMNIRA</span>
      </Link>
      <details className={styles.mobileMenu}>
        <summary aria-label="Öppna huvudnavigation">
          <Menu size={19} />
          <span>Meny</span>
        </summary>
        <nav aria-label="Huvudnavigation">
          {PRIMARY_LINKS.map((item) => <Link key={item.id} href={item.href}>{item.label}</Link>)}
        </nav>
      </details>
    </header>
  )
}
