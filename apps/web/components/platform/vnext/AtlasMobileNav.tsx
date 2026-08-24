import Link from 'next/link'
import { Menu } from 'lucide-react'
import { OmniraMark } from '@/components/platform/OmniraLogo'
import type { AtlasHomeProjectSummary } from '@/lib/atlas/home-view-model'
import { vnextNavItemsFor } from '@/lib/nav/vnext-nav'
import styles from './AtlasHomeVNext.module.css'

/**
 * Mobile reads the same canonical model as the desktop shell, so the two cannot
 * drift apart again. They did: this list was built from the registry, which
 * labels the same destinations 'Approvals', 'Activity' and 'Knowledge' while
 * desktop showed 'Granskningar', 'Aktivitet' and 'Minne' — and 'knowledge' is an
 * alias to /memory that never had a page of its own.
 *
 * The destinations are unchanged; the model simply owns their identity now, and
 * decides which of them are mobile.
 */
const PRIMARY_LINKS = vnextNavItemsFor('mobile')

export function AtlasMobileNav({ projects }: { projects: AtlasHomeProjectSummary[] }) {
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
          {projects.map((project) => <Link key={project.id} href={project.href}>{project.name}</Link>)}
        </nav>
      </details>
    </header>
  )
}
