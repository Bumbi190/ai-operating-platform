'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { resolveProjectRailKeyAction } from '@/lib/atlas/project-rail-keyboard'

const OPEN_MARKER = 'omnira.atlas.project-rail.open'
const RESTORE_MARKER = 'omnira.atlas.project-rail.restore-focus'
const MARKER_LIFETIME_MS = 15 * 60 * 1000

interface RailOpenMarker {
  slug: string
  openedAt: number
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
    return { slug: parsed.slug, openedAt: parsed.openedAt }
  } catch {
    return null
  }
}

export function markAtlasProjectRailOpen(slug: string): void {
  sessionStorage.setItem(OPEN_MARKER, JSON.stringify({ slug, openedAt: Date.now() }))
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
      if (resolveProjectRailKeyAction(event, 'project-detail', document) !== 'return') return
      event.preventDefault()
      sessionStorage.removeItem(OPEN_MARKER)
      sessionStorage.setItem(RESTORE_MARKER, slug)
      router.push(`/atlas?ui=vnext&project=${encodeURIComponent(slug)}`)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [router, slug])

  return null
}
