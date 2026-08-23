import Link from 'next/link'
import { Menu } from 'lucide-react'
import { OmniraMark } from '@/components/platform/OmniraLogo'
import type { AtlasHomeProjectSummary } from '@/lib/atlas/home-view-model'
import { resolveDestination } from '@/lib/nav/registry'
import styles from './AtlasHomeVNext.module.css'

const PRIMARY_LINKS = [
  resolveDestination('atlas'),
  resolveDestination('chat'),
  resolveDestination('approvals'),
  resolveDestination('activity'),
  resolveDestination('knowledge'),
].filter((item): item is NonNullable<typeof item> => item !== null)

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
