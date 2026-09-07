'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { resolveProjectRailKeyAction } from '@/lib/atlas/project-rail-keyboard'
import { destinationBasePath, resolveDestination } from '@/lib/nav/registry'

const OPEN_MARKER = 'omnira.atlas.project-rail.open'
const RESTORE_MARKER = 'omnira.atlas.project-rail.restore-focus'
const MARKER_LIFETIME_MS = 15 * 60 * 1000

/**
 * Where the operator was when they opened this project.
 *
 * Two surfaces open projects and they are not interchangeable: Atlas Home's
 * rail and the `/projects` spiral. Returning to the wrong one is worse than not
 * returning at all, which is why the spiral deliberately marked nothing until
 * the marker could carry this.
 */
export const PROJECT_RETURN_ORIGINS = ['atlas-home', 'projects-index'] as const
export type ProjectReturnOrigin = (typeof PROJECT_RETURN_ORIGINS)[number]

interface RailOpenMarker {
  slug: string
  openedAt: number
  origin: ProjectReturnOrigin
}

function parseOrigin(value: unknown): ProjectReturnOrigin | null {
  if (typeof value !== 'string') return null
  return (PROJECT_RETURN_ORIGINS as readonly string[]).includes(value)
    ? (value as ProjectReturnOrigin)
    : null
}

/**
 * Where `origin` returns to.
 *
 * Both paths come from the registry, so this module holds no route table of its
 * own. Atlas Home carries the slug so the rail can reselect and refocus the card
 * the operator came from; the spiral opens at its own first card, which is a
 * known, deliberate gap rather than a silent one.
 */
export function projectReturnHref(origin: ProjectReturnOrigin, slug: string): string | null {
  if (origin === 'projects-index') return destinationBasePath('project_home')
  const atlas = resolveDestination('atlas')?.href
  return atlas ? `${atlas}?ui=vnext&project=${encodeURIComponent(slug)}` : null
}

function readOpenMarker(): RailOpenMarker | null {
  try {
    const value = sessionStorage.getItem(OPEN_MARKER)
    if (!value) return null
    const parsed = JSON.parse(value) as Partial<RailOpenMarker>
    if (typeof parsed.slug !== 'string' || typeof parsed.openedAt !== 'number') return null
    if (Date.now() - parsed.openedAt > MARKER_LIFETIME_MS) {
      sessionStorage.removeItem(OPEN_MARKER)
      return null
    }
    // A marker written before origins existed, or carrying an unknown one, is
    // read as Atlas Home — the behaviour that shipped — rather than discarded.
    const origin = parseOrigin(parsed.origin) ?? 'atlas-home'
    return { slug: parsed.slug, openedAt: parsed.openedAt, origin }
  } catch {
    return null
  }
}

export function markAtlasProjectRailOpen(
  slug: string,
  origin: ProjectReturnOrigin = 'atlas-home',
): void {
  sessionStorage.setItem(OPEN_MARKER, JSON.stringify({ slug, openedAt: Date.now(), origin }))
}

export function takeAtlasProjectRailRestoreFocus(slug: string): boolean {
  const restoreSlug = sessionStorage.getItem(RESTORE_MARKER)
  if (restoreSlug !== slug) return false
  sessionStorage.removeItem(RESTORE_MARKER)
  return true
}

export function AtlasProjectReturnShortcut() {
  const pathname = usePathname()
  const router = useRouter()
  const slug = pathname.match(/^\/projects\/([^/]+)(?:\/|$)/)?.[1]

  useEffect(() => {
    if (!slug) return
    const marker = readOpenMarker()
    if (!marker || marker.slug !== slug) return

    const onKeyDown = (event: KeyboardEvent) => {
      // Unchanged: the shared resolver still owns what Esc and safe Backspace
      // mean, including the editable-target and higher-priority-surface guards.
      if (resolveProjectRailKeyAction(event, 'project-detail', document) !== 'return') return
      const href = projectReturnHref(marker.origin, slug)
      if (!href) return
      event.preventDefault()
      sessionStorage.removeItem(OPEN_MARKER)
      // Focus restore is Atlas Home's rail behaviour; the spiral has none to
      // restore, so the marker is not written for it.
      if (marker.origin === 'atlas-home') sessionStorage.setItem(RESTORE_MARKER, slug)
      router.push(href)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [router, slug])

  return null
}
