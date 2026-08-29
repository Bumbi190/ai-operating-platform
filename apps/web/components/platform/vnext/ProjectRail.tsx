'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useRouter, useSearchParams } from 'next/navigation'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, UIEvent } from 'react'
import { ArrowLeft, ArrowRight, ArrowUpRight, CircleDot, Clock3 } from 'lucide-react'
import { ATLAS_MODE_LABELS } from '@/lib/atlas/lifecycle'
import type { AtlasHomeViewModel } from '@/lib/atlas/home-view-model'
import { resolveRailSelectionIndex, type AtlasRailCard } from '@/lib/atlas/first-party-workspaces'
import { presentationForProject } from '@/lib/atlas/project-presentation'
import { resolveProjectRailKeyAction } from '@/lib/atlas/project-rail-keyboard'
import { centeringScrollLeft, nearestCardIndex, wrapIndex } from '@/lib/atlas/project-rail-geometry'
import {
  markAtlasProjectRailOpen,
  takeAtlasProjectRailRestoreFocus,
} from './AtlasProjectReturnShortcut'
import styles from './AtlasHomeVNext.module.css'

function relativeTime(iso: string, generatedAt: string): string {
  const deltaMinutes = Math.max(0, Math.round((new Date(generatedAt).getTime() - new Date(iso).getTime()) / 60000))
  if (deltaMinutes < 1) return 'nyss'
  if (deltaMinutes < 60) return `${deltaMinutes} min sedan`
  const hours = Math.round(deltaMinutes / 60)
  if (hours < 24) return `${hours} h sedan`
  return `${Math.round(hours / 24)} d sedan`
}

interface ProjectRailProps {
  /**
   * Everything on the rail, in order: the operator's authorized projects first,
   * then first-party system workspaces. The union is composed by
   * `composeAtlasRailCards`, never by widening the project shape — a card here
   * is either a real project row or a declared system workspace, and the
   * discriminant says which.
   */
  cards: AtlasRailCard[]
  generatedAt: string
  availability: AtlasHomeViewModel['availability']
}

export function ProjectRail({ cards, generatedAt, availability }: ProjectRailProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  // `?project=` is the rail's selection token and nothing more. It is resolved
  // against the cards already in hand — never looked up, never authorized here.
  const initialIndex = resolveRailSelectionIndex(cards, searchParams.get('project'))
  const [selectedIndex, setSelectedIndex] = useState(initialIndex)
  const railRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef<Array<HTMLButtonElement | null>>([])
  // Focus lives on the button; measurement lives on the card element.
  const cardElementRefs = useRef<Array<HTMLElement | null>>([])
  // Ignore scroll-driven reselection while we are animating a centring, so the
  // intermediate frames cannot drag the selection back to the previous card.
  const programmaticScroll = useRef(false)
  const programmaticScrollTimer = useRef<ReturnType<typeof setTimeout>>()
  const scrollFrame = useRef<number>()
  const initializedRef = useRef(false)
  const selectedCard = cards[selectedIndex]

  /**
   * Card faces. Projects keep the existing slug-keyed presentation table; a
   * system workspace carries its own label and has no hero image, so it renders
   * through the same fallback a project without one already uses.
   */
  const presentations = useMemo(
    () => cards.map((card) => (
      card.kind === 'PROJECT'
        ? presentationForProject(card.project.slug, card.project.name)
        : { shortLabel: card.workspace.shortLabel }
    )),
    [cards],
  )

  const replaceProjectQuery = useCallback((selectionKey: string) => {
    const url = new URL(window.location.href)
    url.searchParams.set('ui', 'vnext')
    // A system workspace writes its `system:` id here. That can never parse as a
    // project slug, so any consumer resolving this value fails closed instead of
    // targeting the wrong business.
    url.searchParams.set('project', selectionKey)
    window.history.replaceState(window.history.state, '', `${url.pathname}?${url.searchParams.toString()}${url.hash}`)
  }, [])

  const centerCard = useCallback((index: number, behavior: ScrollBehavior = 'smooth') => {
    const rail = railRef.current
    const card = cardElementRefs.current[index]
    if (!rail || !card) return

    const left = centeringScrollLeft({
      railScrollLeft: rail.scrollLeft,
      railScrollWidth: rail.scrollWidth,
      rail: rail.getBoundingClientRect(),
      card: card.getBoundingClientRect(),
    })

    programmaticScroll.current = true
    if (programmaticScrollTimer.current) clearTimeout(programmaticScrollTimer.current)
    programmaticScrollTimer.current = setTimeout(() => { programmaticScroll.current = false }, 420)

    rail.scrollTo({ left, behavior })
  }, [])

  const selectProject = useCallback((index: number, options?: { center?: boolean; focus?: boolean }) => {
    if (cards.length === 0) return
    const nextIndex = wrapIndex(index, cards.length)
    setSelectedIndex(nextIndex)
    replaceProjectQuery(cards[nextIndex].selectionKey)
    if (options?.center !== false) centerCard(nextIndex)
    if (options?.focus) cardRefs.current[nextIndex]?.focus({ preventScroll: true })
  }, [cards, centerCard, replaceProjectQuery])

  const openProject = useCallback((card: AtlasRailCard) => {
    markAtlasProjectRailOpen(card.selectionKey)
    router.push(card.href)
  }, [router])

  useEffect(() => {
    if (!selectedCard || initializedRef.current) return
    initializedRef.current = true
    centerCard(selectedIndex, 'auto')
    if (takeAtlasProjectRailRestoreFocus(selectedCard.selectionKey)) {
      requestAnimationFrame(() => cardRefs.current[selectedIndex]?.focus({ preventScroll: true }))
    }
  }, [centerCard, selectedCard, selectedIndex])

  useEffect(() => {
    if (!selectedCard) return
    const onKeyDown = (event: KeyboardEvent) => {
      const action = resolveProjectRailKeyAction(event, 'atlas', document)
      if (!action) return

      // Native controls own Enter; focused rail cards open through their click.
      if (action === 'open' && event.target instanceof HTMLElement && event.target.closest('a, button')) return

      event.preventDefault()
      if (action === 'previous') selectProject(selectedIndex - 1, { focus: true })
      if (action === 'next') selectProject(selectedIndex + 1, { focus: true })
      if (action === 'open') openProject(selectedCard)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [openProject, selectProject, selectedCard, selectedIndex])

  const onRailScroll = (event: UIEvent<HTMLDivElement>) => {
    if (scrollFrame.current) cancelAnimationFrame(scrollFrame.current)
    const rail = event.currentTarget
    scrollFrame.current = requestAnimationFrame(() => {
      if (programmaticScroll.current) return
      const nearest = nearestCardIndex({
        rail: rail.getBoundingClientRect(),
        cards: cardElementRefs.current.map((card) => card?.getBoundingClientRect() ?? null),
        fallback: selectedIndex,
      })
      if (nearest !== selectedIndex) selectProject(nearest, { center: false })
    })
  }

  if (cards.length === 0) {
    return (
      <section className={styles.projectSection} aria-labelledby="atlas-projects-title">
        <div className={styles.sectionHeading}>
          <div><p className={styles.sectionKicker}>Portfölj</p><h2 id="atlas-projects-title">Dina projekt</h2></div>
          <span>0</span>
        </div>
        <div className={styles.emptyState}><p>Inga projekt är kopplade till ditt konto ännu.</p></div>
      </section>
    )
  }

  // Kept as its own note rather than replacing the rail: with a first-party
  // workspace always present the rail is never empty, and an operator with no
  // projects of their own should still be told that rather than silently seeing
  // only system cards.
  const hasNoProjects = cards.every((card) => card.kind !== 'PROJECT')

  return (
    <section
      className={styles.projectSection}
      aria-labelledby="atlas-projects-title"
      style={{ '--rail-accent': selectedCard.color } as CSSProperties}
    >
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.sectionKicker}>Levande projektportfölj</p>
          <h2 id="atlas-projects-title">Välj vad Atlas ska fokusera på</h2>
        </div>
        <span aria-label={`${cards.length} kort`}>{String(selectedIndex + 1).padStart(2, '0')} / {String(cards.length).padStart(2, '0')}</span>
      </div>

      {hasNoProjects ? (
        <div className={styles.emptyState}><p>Inga projekt är kopplade till ditt konto ännu.</p></div>
      ) : null}

      <div
        ref={railRef}
        className={styles.projectRail}
        role="region"
        aria-roledescription="karusell"
        aria-label="Projekt"
        onScroll={onRailScroll}
      >
        {cards.map((card, index) => {
          const presentation = presentations[index]
          const selected = index === selectedIndex
          const system = card.kind === 'SYSTEM_WORKSPACE' ? card.workspace : null
          const project = card.kind === 'PROJECT' ? card.project : null
          return (
            <article
              key={card.id}
              ref={(node) => { cardElementRefs.current[index] = node }}
              className={styles.projectCard}
              data-selected={selected || undefined}
              data-card-kind={card.kind}
              aria-label={`${presentation.shortLabel}, ${card.kind === 'SYSTEM_WORKSPACE' ? 'systemarbetsyta' : 'projekt'} ${index + 1} av ${cards.length}`}
              style={{ '--project-color': card.color } as CSSProperties}
            >
              <button
                ref={(node) => { cardRefs.current[index] = node }}
                type="button"
                className={styles.projectCardButton}
                aria-current={selected ? 'true' : undefined}
                aria-label={selected ? `Öppna ${presentation.shortLabel}` : `Fokusera ${presentation.shortLabel}`}
                onFocus={() => selectProject(index, { center: true })}
                onClick={() => selected ? openProject(card) : selectProject(index)}
              >
                {presentation.heroImage ? (
                  <span className={styles.projectMedia} aria-hidden="true">
                    <Image
                      src={presentation.heroImage}
                      alt=""
                      fill
                      priority={index === initialIndex}
                      sizes="(max-width: 700px) 86vw, (max-width: 1759px) 72vw, 820px"
                      style={{ objectPosition: presentation.heroPosition }}
                    />
                  </span>
                ) : (
                  <span className={styles.projectMediaFallback} aria-hidden="true">
                    <span>{presentation.shortLabel.slice(0, 2).toLocaleUpperCase('sv-SE')}</span>
                  </span>
                )}
                <span className={styles.projectShade} aria-hidden="true" />
                <span className={styles.projectCardContent}>
                  <span className={styles.projectCardTop}>
                    <span>
                      <span className={styles.projectIndex}>{String(index + 1).padStart(2, '0')}</span>
                      <span className={styles.projectName}>{presentation.shortLabel}</span>
                      {project?.atlasMode ? <span className={styles.projectMode}>{ATLAS_MODE_LABELS[project.atlasMode]}</span> : null}
                      {/*
                        A system workspace states what it is on the card face.
                        Three separate facts rather than one word: how finished
                        it is, what its numbers actually are, and whether it can
                        write anything. Nothing here can render as LIVE unless a
                        registry entry deliberately declares it.
                      */}
                      {system ? <span className={styles.workspaceKind}>Systemarbetsyta</span> : null}
                    </span>
                    <ArrowUpRight size={18} aria-hidden="true" />
                  </span>
                  {system ? (
                    <>
                      <span className={styles.workspaceBadges}>
                        <span data-badge="stage">{system.stage === 'DEVELOPMENT' ? 'DEVELOPMENT' : system.stage}</span>
                        <span data-badge="data">{system.dataMode}</span>
                        <span data-badge="access">{system.accessMode === 'READ_ONLY' ? 'READ ONLY' : 'READ WRITE'}</span>
                      </span>
                      <span className={styles.projectActivity}>{system.summary}</span>
                    </>
                  ) : project ? (
                    <>
                      <span className={styles.projectMetrics}>
                        {project.runningRuns !== null ? <span><CircleDot size={12} aria-hidden="true" /> {project.runningRuns} aktiva</span> : null}
                        {project.pendingApprovals !== null ? <span>{project.pendingApprovals} väntar</span> : null}
                      </span>
                      {project.latestActivityAt ? (
                        <span className={styles.projectActivity}>
                          <Clock3 size={12} aria-hidden="true" />
                          <span>{project.latestActivityTitle ? `${project.latestActivityTitle} · ` : ''}{relativeTime(project.latestActivityAt, generatedAt)}</span>
                        </span>
                      ) : availability.runs && availability.approvals ? (
                        <span className={styles.projectActivity}>Ingen nylig systemaktivitet</span>
                      ) : null}
                    </>
                  ) : null}
                </span>
              </button>
              <Link
                href={card.href}
                className={styles.projectDirectLink}
                onClick={() => markAtlasProjectRailOpen(card.selectionKey)}
              >
                {system ? 'Öppna arbetsyta' : 'Öppna projekt'} <ArrowUpRight size={13} aria-hidden="true" />
              </Link>
            </article>
          )
        })}
      </div>

      <div className={styles.projectControls}>
        <button type="button" onClick={() => selectProject(selectedIndex - 1, { focus: true })} aria-label="Föregående projekt"><ArrowLeft size={16} /></button>
        <div className={styles.projectDots} aria-label="Välj projekt">
          {cards.map((card, index) => (
            <button
              key={card.id}
              type="button"
              aria-label={`Fokusera ${presentations[index].shortLabel}`}
              aria-current={index === selectedIndex ? 'true' : undefined}
              onClick={() => selectProject(index, { focus: true })}
            />
          ))}
        </div>
        <button type="button" onClick={() => selectProject(selectedIndex + 1, { focus: true })} aria-label="Nästa projekt"><ArrowRight size={16} /></button>
      </div>
      <p className={styles.projectKeyboardHint}>← → växla · Enter öppna · svep på touch</p>
    </section>
  )
}
