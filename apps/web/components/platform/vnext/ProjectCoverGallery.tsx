'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import { ArrowLeft, ArrowRight, ArrowUpRight, CircleDot } from 'lucide-react'
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

/** Desktop orbit; tablet and mobile use the same links in normal document flow. */
export function projectOrbitPosition(index: number, selected: number, length: number) {
  const above = Math.floor(length / 2)
  const offset = wrapIndex(index - selected + above, length) - above
  const slot = wrapIndex(index - selected, length)
  // Two upper satellites frame the focus; further pairs continue down the axis.
  // Keep the focused cover near the top, regardless of portfolio size.
  const center = length > 1 ? 420 : 230
  const lowerRows = Math.ceil(Math.max(0, length - 3) / 2)
  const distance = slot === 0 ? 0 : slot <= 2 ? -300 : 300 + Math.floor((slot - 3) / 2) * 230
  return {
    offset,
    side: slot === 0 ? 0 : slot % 2 === 1 ? -1 : 1,
    depth: slot === 0 ? 0 : -20 - Math.floor(slot / 2) * 15,
    y: center + distance,
    height: center + (lowerRows ? 300 + (lowerRows - 1) * 230 + 130 : 230),
  }
}

export function ProjectCoverGallery({ cards, projectsAvailable }: ProjectCoverGalleryProps) {
  const router = useRouter()
  const [selectedIndex, setSelectedIndex] = useState(0)
  const activeIndex = wrapIndex(selectedIndex, cards.length)
  const cardRefs = useRef<Array<HTMLAnchorElement | null>>([])
  const focusTarget = useRef<HTMLSpanElement | null>(null)

  const select = useCallback((next: number) => {
    if (cards.length === 0) return
    const index = wrapIndex(next, cards.length)
    setSelectedIndex(index)
    const desktop = window.matchMedia('(min-width: 1024px)').matches
    cardRefs.current[index]?.focus({ preventScroll: desktop })
    // Scroll to the stable foreground slot, rather than the moving satellite.
    if (desktop) focusTarget.current?.scrollIntoView({ block: 'nearest' })
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
        select(activeIndex - 1)
      } else if (action === 'next') {
        event.preventDefault()
        select(activeIndex + 1)
      } else if (action === 'open' && cards[activeIndex]) {
        event.preventDefault()
        open(cards[activeIndex])
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [cards, open, select, activeIndex])

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

      <div className={styles.navigation} role="group" aria-label="Välj arbetsyta">
        <button type="button" onClick={() => select(activeIndex - 1)} aria-label="Föregående arbetsyta" disabled={cards.length < 2}><ArrowLeft size={18} aria-hidden="true" /></button>
        <p>{cards[activeIndex].label} <span>{activeIndex + 1} / {cards.length}</span></p>
        <button type="button" onClick={() => select(activeIndex + 1)} aria-label="Nästa arbetsyta" disabled={cards.length < 2}><ArrowRight size={18} aria-hidden="true" /></button>
      </div>
      <div className={styles.scene} style={{
        '--scene-height': `${projectOrbitPosition(0, activeIndex, cards.length).height}px`,
        '--focus-y': `${projectOrbitPosition(activeIndex, activeIndex, cards.length).y - 194}px`,
      } as CSSProperties}>
        <span ref={focusTarget} className={styles.focusTarget} aria-hidden="true" />
        <div className={styles.energy} aria-hidden="true">
          <span className={styles.spine} />
          <span className={styles.particles} />
          {[0, 1, 2, 3, 4].map((ring) => <span key={ring} className={styles.orbitRing} style={{ '--ring': ring } as CSSProperties} />)}
        </div>
        <ul className={styles.gallery}>
          {cards.map((card, index) => {
            const orbit = projectOrbitPosition(index, activeIndex, cards.length)
            const project = card.kind === 'PROJECT' ? card.project : null
            const workspace = card.kind === 'SYSTEM_WORKSPACE' ? card.workspace : null
            const presentation: ProjectPresentation = project
              ? presentationForProject(project.slug, project.name)
              : { shortLabel: workspace!.shortLabel }
            const hasCover = Boolean(presentation.heroImage)
            const contain = presentation.heroFit === 'contain'

            return (
              <li key={card.id} className={styles.item} data-focused={activeIndex === index || undefined}
                style={{ '--orbit-y': `${orbit.y}px`, '--orbit-side': orbit.side, '--orbit-depth': `${orbit.depth}px`, '--orbit-tilt': `${orbit.side * -5}deg` } as CSSProperties}>
                <button type="button" className={styles.selectCard} onClick={() => select(index)} aria-label={`Välj ${presentation.shortLabel}`} aria-pressed={activeIndex === index}>Välj</button>
                <Link
                  ref={(node) => { cardRefs.current[index] = node }}
                  href={card.href}
                  className={styles.card}
                  data-selected={activeIndex === index || undefined}
                  style={{ '--card-accent': card.color } as CSSProperties}
                  onFocus={(event) => { if (event.currentTarget.matches(':focus-visible')) select(index) }}
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
                        sizes="(max-width: 767px) calc(100vw - 40px), (max-width: 1023px) 46vw, 620px"
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
      </div>

      <p className={styles.visuallyHidden} aria-live="polite">
        Valt: {cards[activeIndex]?.label ?? cards[0]?.label}
      </p>
    </section>
  )
}
