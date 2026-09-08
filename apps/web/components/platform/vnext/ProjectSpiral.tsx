'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { resolveProjectRailKeyAction } from '@/lib/atlas/project-rail-keyboard'
import { wrapIndex } from '@/lib/atlas/project-rail-geometry'
import {
  spiralPlacements,
  spiralSpreadForWidth,
  spineRings,
  type SpiralSpread,
} from '@/lib/atlas/project-spiral-geometry'
import type { AtlasRailCard } from '@/lib/atlas/first-party-workspaces'
import { markAtlasProjectRailOpen } from './AtlasProjectReturnShortcut'
import styles from './ProjectSpiral.module.css'

interface ProjectSpiralProps {
  /**
   * The cards, already composed and already authorized: the server scoped the
   * projects and `composeAtlasRailCards` added the first-party workspaces. This
   * component neither adds to that set nor filters it.
   */
  cards: readonly AtlasRailCard[]
  /** False when the projects query failed — the page says so rather than lying. */
  projectsAvailable: boolean
}

const DEFAULT_SPREAD: SpiralSpread = { x: 300, y: 200 }

/**
 * The Project Spiral — the `/projects` index.
 *
 * A project-NAVIGATION surface, not a second Atlas Home: it carries no orb, no
 * conversation and no activity stream. It exists because `/projects` had no
 * page at all, which is also why the breadcrumb's "Projekt" was unclickable
 * until now.
 *
 * KEYBOARD IS NOT REIMPLEMENTED HERE. `resolveProjectRailKeyAction` in the
 * 'atlas' context already means "← → move along the axis, Enter opens" and
 * already carries the editable-target and higher-priority-surface guards. The
 * spiral is the same kind of surface as the rail, so it asks the same resolver
 * the same question. No new key, no new guard, no new vocabulary.
 *
 * Motion is CSS drift on the cards and the spine. Under the resolved reduced-
 * motion signal from Phase 3 the global reset stops it, and the composition is
 * unaffected — depth, scale and opacity are static transforms, so the spatial
 * arrangement survives with focus carried by scale, border and glow rather than
 * by movement.
 */
export function ProjectSpiral({ cards, projectsAvailable }: ProjectSpiralProps) {
  const router = useRouter()
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [spread, setSpread] = useState<SpiralSpread>(DEFAULT_SPREAD)
  const cardRefs = useRef<Array<HTMLAnchorElement | null>>([])

  useEffect(() => {
    const measure = () => setSpread(spiralSpreadForWidth(window.innerWidth))
    measure()
    window.addEventListener('resize', measure, { passive: true })
    return () => window.removeEventListener('resize', measure)
  }, [])

  const placements = useMemo(
    () => spiralPlacements(cards.length, selectedIndex, spread),
    [cards.length, selectedIndex, spread],
  )
  const rings = useMemo(() => spineRings(), [])

  const select = useCallback((next: number, focus = false) => {
    if (cards.length === 0) return
    const index = wrapIndex(next, cards.length)
    setSelectedIndex(index)
    if (focus) cardRefs.current[index]?.focus({ preventScroll: true })
  }, [cards.length])

  const open = useCallback((card: AtlasRailCard) => {
    // Straight to the destination the card already carries — the real project
    // route. No second project command-center route is introduced here.
    //
    // The marker now records WHERE the project was opened from, so Esc on the
    // project page returns to the spiral rather than to Atlas Home. Phase 5
    // deliberately left this unmarked precisely because the marker could not
    // yet express an origin, and returning to the wrong surface would have been
    // worse than not returning at all.
    markAtlasProjectRailOpen(card.selectionKey, 'projects-index')
    router.push(card.href)
  }, [router])

  const selectedCard = cards[selectedIndex]

  useEffect(() => {
    if (!selectedCard) return
    const onKeyDown = (event: KeyboardEvent) => {
      const action = resolveProjectRailKeyAction(event, 'atlas', document)
      if (!action) return
      // A focused card opens through its own link; Enter belongs to it there.
      if (action === 'open' && event.target instanceof HTMLElement && event.target.closest('a, button')) return
      event.preventDefault()
      if (action === 'previous') select(selectedIndex - 1, true)
      if (action === 'next') select(selectedIndex + 1, true)
      if (action === 'open') open(selectedCard)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, select, selectedCard, selectedIndex])

  if (cards.length === 0) {
    return (
      <div className={styles.stage}>
        <div className={styles.empty}>
          <h1 className={styles.emptyTitle}>Projekt</h1>
          <p>
            {projectsAvailable
              ? 'Inga projekt är kopplade till ditt konto ännu.'
              : 'Projektlistan kunde inte läsas just nu.'}
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.stage}>
      <h1 className={styles.visuallyHidden}>Projekt</h1>

      {/* The luminous spine. Decorative — the cards carry all the meaning. */}
      <div className={styles.spine} aria-hidden="true">
        <span className={styles.spineLine} />
        {rings.map((ring, index) => (
          <span
            key={ring.top}
            className={styles.spineRing}
            style={{
              top: `${ring.top}%`,
              width: ring.width,
              height: ring.height,
              opacity: ring.opacity,
              animationDuration: `${ring.durationSeconds}s`,
              animationDelay: `${index * -1.7}s`,
            }}
          />
        ))}
      </div>

      {!projectsAvailable ? (
        <p className={styles.degraded} role="status">
          Projektlistan kunde inte läsas — visar systemarbetsytor.
        </p>
      ) : null}

      {/* A real list, so the spiral is a set of links in the accessibility tree
          however it happens to be arranged visually. */}
      <ul className={styles.orbit}>
        {cards.map((card, index) => {
          const placement = placements[index]
          const isSystem = card.kind === 'SYSTEM_WORKSPACE'
          return (
            <li
              key={card.id}
              className={styles.slot}
              style={{
                transform: `translate3d(${placement.x}px, ${placement.y}px, 0) scale(${placement.scale})`,
                opacity: placement.opacity,
                zIndex: placement.z,
                animationDelay: `${index * -2.3}s`,
              }}
              data-focused={placement.focused || undefined}
            >
              <Link
                ref={(node) => { cardRefs.current[index] = node }}
                href={card.href}
                className={styles.card}
                data-focused={placement.focused || undefined}
                style={{ '--card-accent': card.color } as React.CSSProperties}
                aria-current={placement.focused ? 'true' : undefined}
                onMouseEnter={() => select(index)}
                onFocus={() => select(index)}
                // The pointer path navigates through the link itself, so it
                // records the origin here — the same place ProjectRail does.
                onClick={() => markAtlasProjectRailOpen(card.selectionKey, 'projects-index')}
              >
                <span className={styles.cardTop}>
                  <span className={styles.cardMark} aria-hidden="true">
                    {card.label.slice(0, 2).toUpperCase()}
                  </span>
                  {isSystem ? <span className={styles.cardKind}>System</span> : null}
                </span>

                <span className={styles.cardName}>{card.label}</span>

                {/* Only repo-backed fields. A project whose counts could not be
                    read shows nothing rather than a fabricated zero. */}
                {card.kind === 'PROJECT' ? (
                  <span className={styles.cardMeta}>
                    {card.project.runningRuns !== null && card.project.runningRuns > 0 ? (
                      <span className={styles.metaLive}>
                        {card.project.runningRuns} kör
                      </span>
                    ) : null}
                    {card.project.pendingApprovals !== null && card.project.pendingApprovals > 0 ? (
                      <span className={styles.metaPending}>
                        {card.project.pendingApprovals} väntar
                      </span>
                    ) : null}
                    {card.project.latestActivityTitle ? (
                      <span className={styles.metaActivity}>{card.project.latestActivityTitle}</span>
                    ) : null}
                  </span>
                ) : (
                  <span className={styles.cardMeta}>
                    <span className={styles.metaActivity}>{card.workspace.summary}</span>
                  </span>
                )}
              </Link>
            </li>
          )
        })}
      </ul>

      {/* Position in the spiral, for pointer users and as a live region for
          anyone driving it from the keyboard. */}
      <p className={styles.position} aria-live="polite">
        <span className={styles.positionName}>{selectedCard?.label}</span>
        <span className={styles.positionCount}>
          {wrapIndex(selectedIndex, cards.length) + 1} / {cards.length}
        </span>
      </p>
    </div>
  )
}
