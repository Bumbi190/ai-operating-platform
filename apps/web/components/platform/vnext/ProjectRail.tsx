'use client'

import Link from 'next/link'
import Image from 'next/image'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, UIEvent } from 'react'
import { ArrowLeft, ArrowRight, ArrowUpRight, CircleDot, Clock3 } from 'lucide-react'
import { ATLAS_MODE_LABELS } from '@/lib/atlas/lifecycle'
import type { AtlasHomeProjectSummary, AtlasHomeViewModel } from '@/lib/atlas/home-view-model'
import { presentationForProject } from '@/lib/atlas/project-presentation'
import { resolveProjectRailKeyAction } from '@/lib/atlas/project-rail-keyboard'
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
  projects: AtlasHomeProjectSummary[]
  generatedAt: string
  availability: AtlasHomeViewModel['availability']
}

export function ProjectRail({ projects, generatedAt, availability }: ProjectRailProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const querySlug = searchParams.get('project')
  const initialIndex = Math.max(0, projects.findIndex((project) => project.slug === querySlug))
  const [selectedIndex, setSelectedIndex] = useState(initialIndex)
  const railRef = useRef<HTMLDivElement>(null)
  const cardRefs = useRef<Array<HTMLButtonElement | null>>([])
  const scrollFrame = useRef<number>()
  const initializedRef = useRef(false)
  const selectedProject = projects[selectedIndex]

  const presentations = useMemo(
    () => projects.map((project) => presentationForProject(project.slug, project.name)),
    [projects],
  )

  const replaceProjectQuery = useCallback((slug: string) => {
    const url = new URL(window.location.href)
    url.searchParams.set('ui', 'vnext')
    url.searchParams.set('project', slug)
    window.history.replaceState(window.history.state, '', `${url.pathname}?${url.searchParams.toString()}${url.hash}`)
  }, [])

  const centerCard = useCallback((index: number, behavior: ScrollBehavior = 'smooth') => {
    const rail = railRef.current
    const card = cardRefs.current[index]
    if (!rail || !card) return
    rail.scrollTo({
      left: card.offsetLeft - (rail.clientWidth - card.offsetWidth) / 2,
      behavior,
    })
  }, [])

  const selectProject = useCallback((index: number, options?: { center?: boolean; focus?: boolean }) => {
    if (projects.length === 0) return
    const nextIndex = (index + projects.length) % projects.length
    setSelectedIndex(nextIndex)
    replaceProjectQuery(projects[nextIndex].slug)
    if (options?.center !== false) centerCard(nextIndex)
    if (options?.focus) cardRefs.current[nextIndex]?.focus({ preventScroll: true })
  }, [centerCard, projects, replaceProjectQuery])

  const openProject = useCallback((project: AtlasHomeProjectSummary) => {
    markAtlasProjectRailOpen(project.slug)
    router.push(project.href)
  }, [router])

  useEffect(() => {
    if (!selectedProject || initializedRef.current) return
    initializedRef.current = true
    centerCard(selectedIndex, 'auto')
    if (takeAtlasProjectRailRestoreFocus(selectedProject.slug)) {
      requestAnimationFrame(() => cardRefs.current[selectedIndex]?.focus({ preventScroll: true }))
    }
  }, [centerCard, selectedIndex, selectedProject])

  useEffect(() => {
    if (!selectedProject) return
    const onKeyDown = (event: KeyboardEvent) => {
      const action = resolveProjectRailKeyAction(event, 'atlas', document)
      if (!action) return

      // Native controls own Enter; focused rail cards open through their click.
      if (action === 'open' && event.target instanceof HTMLElement && event.target.closest('a, button')) return

      event.preventDefault()
      if (action === 'previous') selectProject(selectedIndex - 1, { focus: true })
      if (action === 'next') selectProject(selectedIndex + 1, { focus: true })
      if (action === 'open') openProject(selectedProject)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [openProject, selectProject, selectedIndex, selectedProject])

  const onRailScroll = (event: UIEvent<HTMLDivElement>) => {
    if (scrollFrame.current) cancelAnimationFrame(scrollFrame.current)
    const rail = event.currentTarget
    scrollFrame.current = requestAnimationFrame(() => {
      const center = rail.scrollLeft + rail.clientWidth / 2
      let nearest = selectedIndex
      let nearestDistance = Number.POSITIVE_INFINITY
      cardRefs.current.forEach((card, index) => {
        if (!card) return
        const distance = Math.abs(card.offsetLeft + card.offsetWidth / 2 - center)
        if (distance < nearestDistance) {
          nearest = index
          nearestDistance = distance
        }
      })
      if (nearest !== selectedIndex) selectProject(nearest, { center: false })
    })
  }

  if (projects.length === 0) {
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

  return (
    <section
      className={styles.projectSection}
      aria-labelledby="atlas-projects-title"
      style={{ '--rail-accent': selectedProject.color } as CSSProperties}
    >
      <div className={styles.sectionHeading}>
        <div>
          <p className={styles.sectionKicker}>Levande projektportfölj</p>
          <h2 id="atlas-projects-title">Välj vad Atlas ska fokusera på</h2>
        </div>
        <span aria-label={`${projects.length} projekt`}>{String(selectedIndex + 1).padStart(2, '0')} / {String(projects.length).padStart(2, '0')}</span>
      </div>

      <div
        ref={railRef}
        className={styles.projectRail}
        role="region"
        aria-roledescription="karusell"
        aria-label="Projekt"
        onScroll={onRailScroll}
      >
        {projects.map((project, index) => {
          const presentation = presentations[index]
          const selected = index === selectedIndex
          return (
            <article
              key={project.id}
              className={styles.projectCard}
              data-selected={selected || undefined}
              aria-label={`${presentation.shortLabel}, projekt ${index + 1} av ${projects.length}`}
              style={{ '--project-color': project.color } as CSSProperties}
            >
              <button
                ref={(node) => { cardRefs.current[index] = node }}
                type="button"
                className={styles.projectCardButton}
                aria-current={selected ? 'true' : undefined}
                aria-label={selected ? `Öppna ${presentation.shortLabel}` : `Fokusera ${presentation.shortLabel}`}
                onFocus={() => selectProject(index, { center: true })}
                onClick={() => selected ? openProject(project) : selectProject(index)}
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
                      {project.atlasMode ? <span className={styles.projectMode}>{ATLAS_MODE_LABELS[project.atlasMode]}</span> : null}
                    </span>
                    <ArrowUpRight size={18} aria-hidden="true" />
                  </span>
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
                </span>
              </button>
              <Link
                href={project.href}
                className={styles.projectDirectLink}
                onClick={() => markAtlasProjectRailOpen(project.slug)}
              >
                Öppna projekt <ArrowUpRight size={13} aria-hidden="true" />
              </Link>
            </article>
          )
        })}
      </div>

      <div className={styles.projectControls}>
        <button type="button" onClick={() => selectProject(selectedIndex - 1, { focus: true })} aria-label="Föregående projekt"><ArrowLeft size={16} /></button>
        <div className={styles.projectDots} aria-label="Välj projekt">
          {projects.map((project, index) => (
            <button
              key={project.id}
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
