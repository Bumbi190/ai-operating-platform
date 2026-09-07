'use client'

import { Fragment } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  buildBreadcrumbs,
  shouldRenderBreadcrumbs,
  type BreadcrumbProject,
} from '@/lib/nav/breadcrumbs'
import type { OmniraUiGeneration } from '@/lib/ui/generation'
import styles from './Breadcrumbs.module.css'

interface BreadcrumbsProps {
  /**
   * Resolved server-side by the platform layout — never parsed here, the same
   * contract the sidebar, the activity peek and the mobile nav already follow.
   */
  uiGeneration: OmniraUiGeneration
  /**
   * The operator's projects, already scoped by the layout's allow-list. Passing
   * them is what lets a project crumb show a name instead of a slug, without
   * this component ever querying anything.
   */
  projects?: readonly BreadcrumbProject[]
}

/**
 * The shell's breadcrumb trail.
 *
 * All it does is turn the current pathname into items and render them. Which
 * routes get a trail, what each crumb says, and where it points are decided in
 * `lib/nav/breadcrumbs.ts` — so the interesting behaviour is unit-testable
 * without a router, and this file has nothing to assert about.
 *
 * Navigation is ordinary `next/link`. Browser history is untouched: these are
 * forward navigations to ancestor routes, not history manipulation, so Back
 * still means back.
 */
export function Breadcrumbs({ uiGeneration, projects }: BreadcrumbsProps) {
  const pathname = usePathname()
  if (!shouldRenderBreadcrumbs(pathname, uiGeneration)) return null

  const items = buildBreadcrumbs(pathname, { projects })
  const lastIndex = items.length - 1

  return (
    <nav aria-label="Brödsmulor" className={styles.nav}>
      <ol className={styles.list}>
        {items.map((item, index) => {
          const isRoot = index === 0
          const isLast = index === lastIndex
          // Below 640px only the root and the current page stay; the middle of
          // the trail collapses behind a single ellipsis. CSS owns the width
          // decision — this only labels each item's role in the trail.
          const position = isRoot ? 'root' : isLast ? 'current' : 'middle'

          return (
            <Fragment key={`${item.label}-${index}`}>
              {/* Stands in for the collapsed middle at narrow widths. Its own
                  list item so the <ol> holds nothing but <li>, and hidden from
                  assistive tech, which reads the complete trail at every width. */}
              {index === 1 && lastIndex > 1 ? (
                <li className={styles.item} data-position="ellipsis" aria-hidden="true">
                  <span className={styles.separator}>/</span>
                  <span className={styles.plainLabel}>…</span>
                </li>
              ) : null}

              <li className={styles.item} data-position={position}>
                {!isRoot ? (
                  <span className={styles.separator} aria-hidden="true">
                    /
                  </span>
                ) : null}

                {item.current ? (
                  <span className={styles.currentLabel} aria-current="page" title={item.label}>
                    {item.label}
                  </span>
                ) : item.href ? (
                  <Link href={item.href} className={styles.link} title={item.label}>
                    {item.label}
                  </Link>
                ) : (
                  /* A hierarchy level with no route of its own. Text, not a
                     link — the operator is never offered a dead destination. */
                  <span className={styles.plainLabel} title={item.label}>
                    {item.label}
                  </span>
                )}
              </li>
            </Fragment>
          )
        })}
      </ol>
    </nav>
  )
}
