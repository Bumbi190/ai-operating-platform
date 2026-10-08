'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useRouter, useSearchParams } from 'next/navigation'
import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { ArrowUpRight, ChevronDown, CircleDot, Clock3 } from 'lucide-react'
import { ATLAS_MODE_LABELS } from '@/lib/atlas/lifecycle'
import type { AtlasHomeViewModel } from '@/lib/atlas/home-view-model'
import { resolveRailSelectionIndex, type AtlasRailCard } from '@/lib/atlas/first-party-workspaces'
import { presentationForProject } from '@/lib/atlas/project-presentation'
import { resolveProjectRailKeyAction } from '@/lib/atlas/project-rail-keyboard'
import { wrapIndex } from '@/lib/atlas/project-rail-geometry'
import {
  markAtlasProjectRailOpen,
  takeAtlasProjectRailRestoreFocus,
} from './AtlasProjectReturnShortcut'
import { KeyboardHintList } from '@/components/platform/os/KeyboardHintList'
import { routeKeyboardHintsFor } from '@/lib/nav/keyboard-hints'
import { ATLAS_HOME_PATH } from '@/lib/nav/activity-peek-visibility'
import { useDismissOnOutside } from './useDismissOnOutside'
import hintStyles from '@/components/platform/os/KeyboardHints.module.css'
import styles from './AtlasHomeVNext.module.css'

function relativeTime(iso: string, generatedAt: string): string {
  const deltaMinutes = Math.max(0, Math.round((new Date(generatedAt).getTime() - new Date(iso).getTime()) / 60000))
  if (deltaMinutes < 1) return 'nyss'
  if (deltaMinutes < 60) return `${deltaMinutes} min sedan`
  const hours = Math.round(deltaMinutes / 60)
  if (hours < 24) return `${hours} h sedan`
  return `${Math.round(hours / 24)} d sedan`
}

/** The mockup's focus glyph: two concentric rings. */
function FocusGlyph() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="4" />
    </svg>
  )
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

/**
 * "Nuvarande fokus" — Atlas Home's project navigation.
 *
 * The mockup's right summary card names the project Atlas is focused on. It is
 * the same rail it always was — one selection, one `?project=` token, one
 * keyboard model (← → change focus, Enter opens, Esc / Backspace return from
 * the project) — rendered as a single card instead of a carousel. Every card
 * stays in the markup, in the panel that unfolds above the card.
 */
export function ProjectRail({ cards, generatedAt, availability }: ProjectRailProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  // `?project=` is the rail's selection token and nothing more. It is resolved
  // against the cards already in hand — never looked up, never authorized here.
  const initialIndex = resolveRailSelectionIndex(cards, searchParams.get('project'))
  const [selectedIndex, setSelectedIndex] = useState(initialIndex)
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const rootRef = useRef<HTMLElement>(null)
  const summaryRef = useRef<HTMLButtonElement>(null)
  const cardRefs = useRef<Array<HTMLButtonElement | null>>([])
  const initializedRef = useRef(false)
  const selectedCard = cards[selectedIndex]
  useDismissOnOutside(rootRef, open, () => setOpen(false))

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

  const selectProject = useCallback((index: number, options?: { focus?: boolean }) => {
    if (cards.length === 0) return
    const nextIndex = wrapIndex(index, cards.length)
    setSelectedIndex(nextIndex)
    replaceProjectQuery(cards[nextIndex].selectionKey)
    if (options?.focus) {
      // With the panel closed the card face is the focus target; open, the row.
      const target = open ? cardRefs.current[nextIndex] : summaryRef.current
      target?.focus({ preventScroll: true })
    }
  }, [cards, open, replaceProjectQuery])

  const openProject = useCallback((card: AtlasRailCard) => {
    markAtlasProjectRailOpen(card.selectionKey, 'atlas-home')
    router.push(card.href)
  }, [router])

  useEffect(() => {
    if (!selectedCard || initializedRef.current) return
    initializedRef.current = true
    if (takeAtlasProjectRailRestoreFocus(selectedCard.selectionKey)) {
      requestAnimationFrame(() => summaryRef.current?.focus({ preventScroll: true }))
    }
  }, [selectedCard])

  useEffect(() => {
    if (!open) return
    cardRefs.current[selectedIndex]?.scrollIntoView({ block: 'nearest' })
  }, [open, selectedIndex])

  useEffect(() => {
    if (!selectedCard) return
    const onKeyDown = (event: KeyboardEvent) => {
      const action = resolveProjectRailKeyAction(event, 'atlas', document)
      if (!action) return

      // Native controls own Enter; a focused row or the card face opens through
      // its own click.
      if (action === 'open' && event.target instanceof HTMLElement && event.target.closest('a, button')) return

      event.preventDefault()
      if (action === 'previous') selectProject(selectedIndex - 1, { focus: true })
      if (action === 'next') selectProject(selectedIndex + 1, { focus: true })
      if (action === 'open') openProject(selectedCard)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [openProject, selectProject, selectedCard, selectedIndex])

  if (cards.length === 0) {
    return (
      <section className={styles.summaryCard} aria-labelledby="atlas-projects-title">
        <div className={styles.summaryButton} data-static="true">
          <span className={styles.summaryIcon} aria-hidden="true"><FocusGlyph /></span>
          <span className={styles.summaryCopy}>
            <span id="atlas-projects-title" className={styles.summaryTitle}>Nuvarande fokus</span>
            <span className={styles.summarySub}>Inga projekt är kopplade till ditt konto ännu.</span>
          </span>
        </div>
      </section>
    )
  }

  // Kept as its own note: with a first-party workspace always present the rail
  // is never empty, and an operator with no projects of their own should still
  // be told that rather than silently seeing only system cards.
  const hasNoProjects = cards.every((card) => card.kind !== 'PROJECT')
  const selectedPresentation = presentations[selectedIndex]
  const selectedProject = selectedCard.kind === 'PROJECT' ? selectedCard.project : null
  const focusLine = [
    selectedPresentation.shortLabel,
    selectedProject?.runningRuns ? `${selectedProject.runningRuns} aktiva` : null,
    selectedProject?.pendingApprovals ? `${selectedProject.pendingApprovals} väntar` : null,
    selectedCard.kind === 'SYSTEM_WORKSPACE' ? 'Systemarbetsyta' : null,
  ].filter(Boolean).join(' · ')

  return (
    <section
      ref={rootRef}
      className={styles.summaryCard}
      data-open={open || undefined}
      aria-labelledby="atlas-projects-title"
      style={{ '--rail-accent': selectedCard.color } as CSSProperties}
    >
      <button
        ref={summaryRef}
        type="button"
        className={styles.summaryButton}
        aria-expanded={open}
        aria-controls={panelId}
        aria-keyshortcuts="Enter ArrowLeft ArrowRight"
        onClick={() => setOpen((value) => !value)}
        onKeyDown={(event) => {
          // The card face IS the focused project: Enter opens it, as on the
          // rail. Space and click unfold the list instead.
          if (event.key === 'Enter' && !event.shiftKey && !event.metaKey && !event.ctrlKey && !event.altKey) {
            event.preventDefault()
            openProject(selectedCard)
          }
        }}
      >
        <span className={styles.summaryIcon} data-tone="focus" aria-hidden="true"><FocusGlyph /></span>
        <span className={styles.summaryCopy}>
          <span id="atlas-projects-title" className={styles.summaryTitle}>Nuvarande fokus</span>
          <span className={styles.summarySub}>{focusLine}</span>
        </span>
        <ChevronDown className={styles.summaryChevron} size={18} aria-hidden="true" />
      </button>

      <div id={panelId} className={`${styles.summaryPanel} ${styles.projectSection}`} hidden={!open}>
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.sectionKicker}>Levande projektportfölj</p>
            <h2>Välj vad Atlas ska fokusera på</h2>
          </div>
          {/* The rail's own shortcuts, from the shared metadata and rendered with
              the shared caps. Supplemental: aria-hidden, and every key works
              whether or not this panel is open. */}
          <span className={hintStyles.inline} aria-hidden="true">
            <KeyboardHintList hints={routeKeyboardHintsFor(ATLAS_HOME_PATH)} />
          </span>
          <span aria-label={`${cards.length} kort`}>{String(selectedIndex + 1).padStart(2, '0')} / {String(cards.length).padStart(2, '0')}</span>
        </div>

        {hasNoProjects ? (
          <div className={styles.emptyState}><p>Inga projekt är kopplade till ditt konto ännu.</p></div>
        ) : null}

        <div className={styles.projectRail} role="region" aria-label="Projekt">
          {cards.map((card, index) => {
            const presentation = presentations[index]
            const selected = index === selectedIndex
            const system = card.kind === 'SYSTEM_WORKSPACE' ? card.workspace : null
            const project = card.kind === 'PROJECT' ? card.project : null
            return (
              <article
                key={card.id}
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
                  onClick={() => selected ? openProject(card) : selectProject(index)}
                >
                  {presentation.heroImage ? (
                    <span className={styles.projectMedia} aria-hidden="true">
                      <Image
                        src={presentation.heroImage}
                        alt=""
                        fill
                        sizes="56px"
                        style={{ objectPosition: presentation.heroPosition }}
                      />
                    </span>
                  ) : (
                    <span className={styles.projectMediaFallback} aria-hidden="true">
                      <span>{presentation.shortLabel.slice(0, 2).toLocaleUpperCase('sv-SE')}</span>
                    </span>
                  )}
                  <span className={styles.projectCardContent}>
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
                          {project.runningRuns !== null ? <span><CircleDot size={11} aria-hidden="true" /> {project.runningRuns} aktiva</span> : null}
                          {project.pendingApprovals !== null ? <span>{project.pendingApprovals} väntar</span> : null}
                        </span>
                        {project.latestActivityAt ? (
                          <span className={styles.projectActivity}>
                            <Clock3 size={11} aria-hidden="true" />
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
                  onClick={() => markAtlasProjectRailOpen(card.selectionKey, 'atlas-home')}
                >
                  {system ? 'Öppna arbetsyta' : 'Öppna projekt'} <ArrowUpRight size={13} aria-hidden="true" />
                </Link>
              </article>
            )
          })}
        </div>
        <p className={styles.projectKeyboardHint}>← → växla · Enter öppna · svep på touch</p>
      </div>

    </section>
  )
}
