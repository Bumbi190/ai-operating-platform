/**
 * /projects: image-led desktop spiral with normal-flow responsive covers.
 * Tests prioritize readable layout, real authorized destinations, existing
 * artwork, keyboard ownership and accessible/mobile fallback behavior.
 */

import { describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
;(globalThis as unknown as { React: typeof React }).React = React

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/components/platform/vnext/AtlasProjectReturnShortcut', () => ({ markAtlasProjectRailOpen: vi.fn() }))
vi.mock('next/image', () => ({ default: ({ fill, priority, ...props }: Record<string, unknown>) => React.createElement('img', props) }))

import { ProjectCoverGallery, projectOrbitPosition } from '@/components/platform/vnext/ProjectCoverGallery'
import { composeAtlasRailCards } from '@/lib/atlas/first-party-workspaces'
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
const PEEK = read('components/platform/os/MobileRailToggle.tsx')
const codeOnly = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

describe('projects index · routing and security', () => {
  it('renders the new gallery in vNext, retaining the legacy fallback', () => {
    expect(PAGE).toContain('export default async function ProjectsIndexPage')
    expect(PAGE).toContain('isVNext(generation)')
    expect(PAGE).toContain('<ProjectCoverGallery cards={cards} projectsAvailable={projectsAvailable} />')
    expect(PAGE).toContain('<ProjectsIndexLegacy')
    expect(PAGE).not.toContain('ProjectSpiral')
    for (const removed of [
      'components/platform/vnext/ProjectSpiral.tsx',
      'components/platform/vnext/ProjectSpiral.module.css',
      'lib/qa/project-spiral.test.ts',
    ]) expect(existsSync(resolve(WEB_ROOT, removed)), removed).toBe(false)
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
    expect(PAGE).toContain('model.availability.projects')
    expect(PAGE).toContain("if (!model) redirect('/login')")
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
    expect(CSS.slice(0, CSS.indexOf('@media (min-width: 1024px)'))).not.toMatch(/\.item\s*\{[^}]*position:\s*absolute/)
    expect(CSS).toContain('@media (min-width: 1024px)')
    expect(CSS).toContain('.navigation { display: none;')
    expect(CSS).toContain('.selectCard { display: none;')
    expect(CSS).toContain('.navigation { display: flex; }')
    expect(CSS).toContain('.selectCard { display: grid; }')
    expect(GALLERY).not.toContain('translate3d(')
    expect(GALLERY).not.toContain('onTouchStart')
  })

  it('bounds the desktop canvas and gives one focused cover prominence', () => {
    expect(CSS).toContain('width: min(100%, 100rem)')
    expect(CSS).toMatch(/\.item\[data-focused\]\s*\{[^}]*width: 620px/)
    expect(CSS).toContain('.spine')
    expect(CSS).toContain('.orbitRing')
    expect(CSS).toContain('.particles')
  })

  it('removes the duplicate page kicker while keeping the shell breadcrumbs', () => {
    expect(GALLERY).not.toContain('Omnira / Portfölj')
    expect(GALLERY).toContain('Dina projekt')
    expect(GALLERY).toContain('Välj projekt eller arbetsyta.')
    expect(GALLERY).not.toContain('styles.eyebrow')
  })

  it('keeps activity accessible without covering an entire project cover', () => {
    expect(PEEK).toContain('isVNextProjectPath(pathname, uiGeneration)')
    expect(PEEK).toContain("compactOnProjects ? 'w-11 justify-center px-0' : 'px-4'")
    expect(PEEK).toContain('aria-label="Visa aktivitet"')
    expect(PEEK).not.toContain('>Activity</span>')
    expect(PEEK).toContain('safe-area-inset-bottom')
    expect(CSS).toContain('padding-bottom: calc(5.5rem + env(safe-area-inset-bottom, 0px))')
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

describe('project cover gallery rendered structure and orbit geometry', () => {
  it('renders a native list of authorized destinations with one selection', () => {
    const cards = composeAtlasRailCards([
      { id: 'authorized-hb', slug: 'handlarborsen', name: 'Handlarborsen', color: '#22d3ee', href: '/projects/handlarborsen?ui=vnext', runningRuns: null, pendingApprovals: null },
      { id: 'authorized-study', slug: 'studieos', name: 'StudieOS', color: '#22d3ee', href: '/projects/studieos', runningRuns: 0, pendingApprovals: 0 },
    ])
    const out = renderToStaticMarkup(React.createElement(ProjectCoverGallery, { cards, projectsAvailable: true }))
    expect(out.match(/<ul\b/g)).toHaveLength(1)
    expect(out.match(/<li\b/g)).toHaveLength(cards.length)
    expect(out.match(/<a\b/g)).toHaveLength(cards.length)
    for (const card of cards) expect(out).toContain(`href="${card.href}"`)
    expect(out.match(/data-focused="true"/g)).toHaveLength(1)
    expect(out.match(/aria-pressed="true"/g)).toHaveLength(1)
    expect(out).toContain('aria-live="polite"')
    expect(out).not.toContain('disabled=""')
    expect(out.match(/<img\b/g)).toHaveLength(2)
  })

  it('distinguishes unavailable from an empty authorized portfolio', () => {
    const render = (projectsAvailable: boolean) => renderToStaticMarkup(React.createElement(ProjectCoverGallery, { cards: [], projectsAvailable }))
    expect(render(false)).toContain('role="status"')
    expect(render(false)).not.toContain('<a')
    expect(render(true)).not.toBe(render(false))
  })

  it('keeps every orbit position inside its canvas and selects exactly one card', () => {
    for (const count of [1, 2, 6, 7, 12]) {
      for (let selected = 0; selected < count; selected++) {
        const positions = Array.from({ length: count }, (_, index) => projectOrbitPosition(index, selected, count))
        expect(positions.filter((p) => p.offset === 0)).toHaveLength(1)
        expect(new Set(positions.map((p) => p.offset)).size).toBe(count)
        for (const p of positions) {
          const halfHeight = p.offset === 0 ? 194 : 100
          expect(p.y - halfHeight).toBeGreaterThanOrEqual(0)
          expect(p.y + halfHeight).toBeLessThanOrEqual(p.height)
        }
        expect(projectOrbitPosition(selected + count, selected, count).offset).toBe(0)
      }
    }
  })
})
