'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { ArrowUpRight, CircleDot } from 'lucide-react'
import { ATLAS_MODE_LABELS } from '@/lib/atlas/lifecycle'
import type { AtlasRailCard } from '@/lib/atlas/first-party-workspaces'
import { presentationForProject, type ProjectPresentation } from '@/lib/atlas/project-presentation'
import { resolveProjectRailKeyAction } from '@/lib/atlas/project-rail-keyboard'
import { wrapIndex } from '@/lib/atlas/project-rail-geometry'
import { markAtlasProjectRailOpen } from './AtlasProjectReturnShortcut'
import styles from './ProjectCoverGallery.module.css'

interface ProjectCoverGalleryProps {
  /** Server-authorized projects plus declared first-party system workspaces. */
  cards: readonly AtlasRailCard[]
  /** False when the scoped project query failed; we must not imply an empty portfolio. */
  projectsAvailable: boolean
}

/**
 * Project selection through real, readable image cards.
 *
 * Cards never overlap, disappear behind another card, or become inaccessible
 * because of animation. Mobile is a vertical list; wider screens form a grid.
 * The gallery only presents already-authorized cards and uses each card's own
 * href. Arrow keys reuse the rail's guarded resolver and native links own Enter
 * while focused, so the ordinary Tab/Enter path is always available.
 */
export function ProjectCoverGallery({ cards, projectsAvailable }: ProjectCoverGalleryProps) {
  const router = useRouter()
  const [selectedIndex, setSelectedIndex] = useState(0)
  const cardRefs = useRef<Array<HTMLAnchorElement | null>>([])

  const select = useCallback((next: number) => {
    if (cards.length === 0) return
    const index = wrapIndex(next, cards.length)
    setSelectedIndex(index)
    cardRefs.current[index]?.focus({ preventScroll: false })
  }, [cards.length])

  const open = useCallback((card: AtlasRailCard) => {
    markAtlasProjectRailOpen(card.selectionKey, 'projects-index')
    router.push(card.href)
  }, [router])

  useEffect(() => {
    if (cards.length === 0) return
    const onKeyDown = (event: KeyboardEvent) => {
      const action = resolveProjectRailKeyAction(event, 'atlas', document)
      if (!action) return
      if (action === 'open' && event.target instanceof HTMLElement && event.target.closest('a, button')) return

      if (action === 'previous') {
        event.preventDefault()
        select(selectedIndex - 1)
      } else if (action === 'next') {
        event.preventDefault()
        select(selectedIndex + 1)
      } else if (action === 'open' && cards[selectedIndex]) {
        event.preventDefault()
        open(cards[selectedIndex])
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [cards, open, select, selectedIndex])

  if (cards.length === 0) {
    return (
      <section className={styles.page} aria-labelledby="projects-title">
        <header className={styles.intro}>
          <h1 id="projects-title" className={styles.title}>Dina projekt</h1>
        </header>
        <p className={styles.empty} role="status">
          {projectsAvailable
            ? 'Inga projekt är kopplade till ditt konto ännu.'
            : 'Projektlistan kunde inte läsas just nu.'}
        </p>
      </section>
    )
  }

  const hasProjects = cards.some((card) => card.kind === 'PROJECT')

  return (
    <section className={styles.page} aria-labelledby="projects-title">
      <header className={styles.intro}>
        <div>
          <h1 id="projects-title" className={styles.title}>Dina projekt</h1>
          <p className={styles.description}>Välj projekt eller arbetsyta.</p>
        </div>
        <p className={styles.count} aria-label={`${cards.length} projekt och arbetsytor`}>
          <strong>{String(cards.length).padStart(2, '0')}</strong>
          <span>arbetsytor</span>
        </p>
      </header>

      {!projectsAvailable ? (
        <p className={styles.notice} role="status">
          Projektlistan kunde inte läsas — visar tillgängliga systemarbetsytor.
        </p>
      ) : !hasProjects ? (
        <p className={styles.notice}>Inga projekt är kopplade till ditt konto ännu.</p>
      ) : null}

      <ul className={styles.gallery}>
        {cards.map((card, index) => {
          const project = card.kind === 'PROJECT' ? card.project : null
          const workspace = card.kind === 'SYSTEM_WORKSPACE' ? card.workspace : null
          const presentation: ProjectPresentation = project
            ? presentationForProject(project.slug, project.name)
            : { shortLabel: workspace!.shortLabel }
          const hasCover = Boolean(presentation.heroImage)
          const contain = presentation.heroFit === 'contain'

          return (
            <li key={card.id} className={styles.item}>
              <Link
                ref={(node) => { cardRefs.current[index] = node }}
                href={card.href}
                className={styles.card}
                data-selected={selectedIndex === index || undefined}
                style={{ '--card-accent': card.color } as CSSProperties}
                onFocus={() => setSelectedIndex(index)}
                onMouseEnter={() => setSelectedIndex(index)}
                onClick={() => markAtlasProjectRailOpen(card.selectionKey, 'projects-index')}
                aria-label={`Öppna ${presentation.shortLabel}`}
              >
                <span className={contain ? styles.logoMedia : styles.media} aria-hidden="true">
                  {hasCover && presentation.heroImage ? (
                    <Image
                      src={presentation.heroImage}
                      alt=""
                      fill
                      priority={index < 2}
                      sizes="(max-width: 767px) calc(100vw - 40px), (max-width: 1023px) 46vw, (max-width: 1719px) 42vw, (max-width: 2400px) 30vw, 740px"
                      className={contain ? styles.logoImage : styles.coverImage}
                      style={{ objectPosition: presentation.heroPosition }}
                    />
                  ) : (
                    <span className={styles.artFallback}>
                      <span className={styles.fallbackHalo} />
                      <span className={styles.fallbackMark}>
                        {presentation.shortLabel.slice(0, 2).toLocaleUpperCase('sv-SE')}
                      </span>
                    </span>
                  )}
                </span>

                <span className={styles.shade} aria-hidden="true" />

                <span className={styles.cardTop}>
                  <span className={styles.kind}>{workspace ? 'Systemarbetsyta' : 'Projekt'}</span>
                  {project?.atlasMode ? (
                    <span className={styles.mode}>{ATLAS_MODE_LABELS[project.atlasMode]}</span>
                  ) : workspace ? (
                    <span className={styles.mode}>{workspace.stage === 'DEVELOPMENT' ? 'Utveckling' : workspace.stage}</span>
                  ) : null}
                </span>

                <span className={styles.cardBottom}>
                  <span className={styles.cardHeading}>{presentation.shortLabel}</span>
                  {project ? (
                    <span className={styles.cardInfo}>
                      {project.runningRuns !== null && project.runningRuns > 0 ? (
                        <span className={styles.live}><CircleDot size={12} aria-hidden="true" /> {project.runningRuns} kör</span>
                      ) : null}
                      {project.pendingApprovals !== null && project.pendingApprovals > 0 ? (
                        <span className={styles.pending}>{project.pendingApprovals} väntar på beslut</span>
                      ) : null}
                      {project.latestActivityTitle ? (
                        <span className={styles.activity}>{project.latestActivityTitle}</span>
                      ) : null}
                    </span>
                  ) : workspace ? (
                    <span className={styles.cardInfo}>
                      <span className={styles.activity}>{workspace.summary}</span>
                    </span>
                  ) : null}
                  <span className={styles.open}>
                    {workspace ? 'Öppna arbetsyta' : 'Öppna projekt'} <ArrowUpRight size={17} aria-hidden="true" />
                  </span>
                </span>
              </Link>
            </li>
          )
        })}
      </ul>

      <p className={styles.visuallyHidden} aria-live="polite">
        Valt: {cards[selectedIndex]?.label ?? cards[0]?.label}
      </p>
    </section>
  )
}
