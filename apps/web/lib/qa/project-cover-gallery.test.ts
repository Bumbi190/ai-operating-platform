/**
 * /projects: cover gallery replacing the overlapping spiral.
 * Tests prioritize readable layout, real authorized destinations, existing
 * artwork, keyboard ownership and accessible/mobile fallback behavior.
 */

import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { presentationForProject } from '@/lib/atlas/project-presentation'
import { buildBreadcrumbs } from '@/lib/nav/breadcrumbs'
import { keyboardHintsFor } from '@/lib/nav/keyboard-hints'
import { destinationBasePath, resolveDestination } from '@/lib/nav/registry'

const WEB_ROOT = resolve(__dirname, '../..')
const read = (rel: string) => readFileSync(resolve(WEB_ROOT, rel), 'utf8')
const PAGE = read('app/(platform)/projects/page.tsx')
const GALLERY = read('components/platform/vnext/ProjectCoverGallery.tsx')
const CSS = read('components/platform/vnext/ProjectCoverGallery.module.css')
const LEGACY = read('app/(platform)/projects/ProjectsIndexLegacy.tsx')
const codeOnly = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('projects index · routing and security', () => {
  it('renders the new gallery in vNext, retaining the legacy fallback', () => {
    expect(PAGE).toContain('export default async function ProjectsIndexPage')
    expect(PAGE).toContain('isVNext(generation)')
    expect(PAGE).toContain('<ProjectCoverGallery cards={cards} projectsAvailable={projectsAvailable} />')
    expect(PAGE).toContain('<ProjectsIndexLegacy')
    expect(destinationBasePath('project_home')).toBe('/projects')
  })

  it('uses the same scoped model as Atlas Home, not a second database query', () => {
    expect(PAGE).toContain('loadAtlasHomeViewModel')
    expect(PAGE).toContain('composeAtlasRailCards')
    for (const src of [codeOnly(PAGE), codeOnly(GALLERY)]) {
      expect(src).not.toContain("from('projects')")
      expect(src).not.toContain('getAllowedProjectIds')
      expect(src).not.toContain('createAdminClient')
    }
  })

  it('never invents projects, status, metrics or authorized routes', () => {
    for (const src of [codeOnly(GALLERY), codeOnly(LEGACY)]) {
      expect(src).not.toMatch(/\b(Optimal|Frisk|Aktiv)\b/)
      expect(src).not.toMatch(/Math\.(random|floor\(Math)/)
    }
    expect(GALLERY).toContain('href={card.href}')
    expect(GALLERY).toContain("markAtlasProjectRailOpen(card.selectionKey, 'projects-index')")
    expect(GALLERY).toContain('router.push(card.href)')
    expect(resolveDestination('project_home', { project: 'trading' })?.href).toBe('/projects/trading')
  })

  it('does not replace unreadable project data with a fictional zero', () => {
    expect(GALLERY).toContain('project.runningRuns !== null')
    expect(GALLERY).toContain('project.pendingApprovals !== null')
    expect(GALLERY).toContain('project.latestActivityTitle')
    expect(GALLERY).toContain('projectsAvailable')
    expect(PAGE).toContain('model?.availability.projects')
  })
})

describe('project cover gallery · artwork', () => {
  it('uses existing official project images where registered', () => {
    for (const slug of ['ai-media-automation', 'familje-stunden', 'gainpilot', 'handlarborsen']) {
      const p = presentationForProject(slug, slug)
      expect(p.heroImage, slug).toBeTruthy()
      expect(existsSync(join(WEB_ROOT, 'public', p.heroImage!.slice(1))), slug).toBe(true)
    }
    expect(GALLERY).toContain('presentationForProject(project.slug, project.name)')
    expect(GALLERY).toContain('<Image')
    expect(GALLERY).toContain('src={presentation.heroImage}')
  })

  it('keeps square project artwork intact rather than cropping logos', () => {
    expect(presentationForProject('handlarborsen', 'Handlarbörsen').heroFit).toBe('contain')
    expect(presentationForProject('studieos', 'StudieOS').heroFit).toBe('contain')
    expect(CSS).toMatch(/\.logoImage\s*\{[^}]*object-fit:\s*contain/)
    expect(CSS).toMatch(/\.coverImage\s*\{[^}]*object-fit:\s*cover/)
  })

  it('has an explicit decorative fallback for missing cover assets', () => {
    expect(presentationForProject('audit-0b', 'AUDIT 0b').heroImage).toBeUndefined()
    expect(GALLERY).toContain('styles.artFallback')
    expect(GALLERY).toContain('styles.fallbackMark')
    expect(GALLERY).toContain("card.kind === 'SYSTEM_WORKSPACE'")
  })
})

describe('project cover gallery · mobile readability', () => {
  it('lays cards out in a responsive non-overlapping grid', () => {
    expect(CSS).toMatch(/\.gallery\s*\{[^}]*display:\s*grid/)
    expect(CSS).toMatch(/\.gallery\s*\{[^}]*grid-template-columns:\s*repeat\(2/)
    expect(CSS).toContain('@media (max-width: 767px)')
    expect(CSS).toMatch(/grid-template-columns:\s*minmax\(0, 1fr\)/)
    expect(CSS).not.toMatch(/\.item\s*\{[^}]*position:\s*absolute/)
    expect(GALLERY).not.toContain('spiralPlacements')
    expect(GALLERY).not.toContain('translate3d(')
    expect(GALLERY).not.toContain('onTouchStart')
  })

  it('makes each entire cover a readable link', () => {
    expect(GALLERY).toContain('<ul className={styles.gallery}>')
    expect(GALLERY).toContain('<li key={card.id}')
    expect(GALLERY).toContain('<Link')
    expect(GALLERY).toContain('className={styles.card}')
    expect(GALLERY).toContain('className={styles.cardHeading}')
    expect(GALLERY).toContain('styles.open')
    expect(CSS).toMatch(/\.shade\s*\{[^}]*linear-gradient/)
  })

  it('respects motion preferences while preserving cards and text', () => {
    expect(CSS).toContain('@media (prefers-reduced-motion: reduce)')
    expect(CSS).toContain("html:not([data-motion='full'])")
    const reduced = CSS.slice(CSS.indexOf('@media (prefers-reduced-motion: reduce)'))
    expect(reduced).toContain('transition: none')
    expect(reduced).not.toContain('display: none')
  })

  it('uses native links and the existing guarded arrow-key resolver', () => {
    expect(GALLERY).toContain("resolveProjectRailKeyAction(event, 'atlas', document)")
    expect(GALLERY).toContain('event.target.closest(\'a, button\')')
    expect(GALLERY).toContain('cardRefs.current[index]?.focus(')
    expect(GALLERY).toContain('aria-live="polite"')
    expect(CSS).toContain('.card:focus-visible')
    const keys = keyboardHintsFor('/projects').map((h) => h.keys.join('+'))
    expect(keys).toContain('←+→')
    expect(keys).toContain('Enter')
  })
})

describe('project breadcrumbs', () => {
  it('the project index and details share one breadcrumb route', () => {
    const crumbs = buildBreadcrumbs('/projects/gainpilot', {
      projects: [{ slug: 'gainpilot', name: 'GainPilot' }],
    })
    expect(crumbs[1]).toMatchObject({ label: 'Projekt', href: '/projects', current: false })
    expect(buildBreadcrumbs('/projects').at(-1)).toMatchObject({ label: 'Projekt', current: true })
  })
})
