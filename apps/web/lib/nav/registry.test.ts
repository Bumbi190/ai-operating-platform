/**
 * Navigation Registry — unit tests.
 *
 * Locks the contract the whole Atlas navigation layer depends on:
 *  - project name/alias → canonical slug resolution
 *  - filtered destinations build correct query strings
 *  - unknown destinations / projects are rejected (null), making raw-URL
 *    injection impossible
 *  - invalid filter values are dropped (link kept, never passed through)
 *  - ⌘K search resolves both single-word and multi-word queries
 *
 * Pure functions — no network, no DB.
 */
import { describe, it, expect } from 'vitest'
import {
  resolveDestination,
  resolveLinks,
  resolveProjectSlug,
  searchDestinations,
} from '@/lib/nav/registry'

describe('resolveProjectSlug — alias resolution', () => {
  it('resolves canonical slugs to themselves', () => {
    expect(resolveProjectSlug('gainpilot')).toBe('gainpilot')
    expect(resolveProjectSlug('ai-media-automation')).toBe('ai-media-automation')
  })

  it('resolves display names and hand-tuned aliases to the canonical slug', () => {
    expect(resolveProjectSlug('The Prompt')).toBe('ai-media-automation')
    expect(resolveProjectSlug('the prompt')).toBe('ai-media-automation')
    expect(resolveProjectSlug('prompt')).toBe('ai-media-automation')
    expect(resolveProjectSlug('Familje-Stunden')).toBe('familje-stunden')
    expect(resolveProjectSlug('familje')).toBe('familje-stunden')
    expect(resolveProjectSlug('GainPilot')).toBe('gainpilot')
  })

  it('returns undefined for empty/absent input', () => {
    expect(resolveProjectSlug(undefined)).toBeUndefined()
    expect(resolveProjectSlug(null)).toBeUndefined()
    expect(resolveProjectSlug('')).toBeUndefined()
  })

  it('returns null for an unresolvable, non-slug-shaped project', () => {
    expect(resolveProjectSlug('!!! not a project !!!')).toBeNull()
  })
})

describe('resolveDestination — filtered destinations', () => {
  it('appends an allowed filter as a query param', () => {
    expect(resolveDestination('approvals', { filters: { state: 'pending' } })?.href)
      .toBe('/approvals?state=pending')
  })

  it('applies the activity status filter via ROUTE_MAP (→ /agent-activity)', () => {
    expect(resolveDestination('activity', { filters: { status: 'failed' } })?.href)
      .toBe('/agent-activity?status=failed')
  })

  it('resolves a project alias AND a filter together', () => {
    expect(resolveDestination('approvals', { project: 'The Prompt', filters: { state: 'pending' } })?.href)
      .toBe('/approvals?project=ai-media-automation&state=pending')
  })

  it('maps logical "money" to the current /revenue path with project', () => {
    expect(resolveDestination('money', { project: 'gainpilot' })?.href)
      .toBe('/revenue?project=gainpilot')
  })

  it('builds a path-mode project destination', () => {
    expect(resolveDestination('project_home', { project: 'gainpilot' })?.href)
      .toBe('/projects/gainpilot')
  })
})

describe('resolveDestination — unknown destinations / projects', () => {
  it('returns null for an unknown destination id', () => {
    // @ts-expect-error — deliberately invalid id
    expect(resolveDestination('does-not-exist')).toBeNull()
  })

  it('returns null for an explicit but unresolvable project', () => {
    expect(resolveDestination('approvals', { project: '!!! bad !!!' })).toBeNull()
  })

  it('returns null for a path-mode destination with no project', () => {
    expect(resolveDestination('project_home')).toBeNull()
  })
})

describe('resolveDestination — invalid filters', () => {
  it('drops a disallowed filter KEY but keeps the link', () => {
    expect(resolveDestination('approvals', { filters: { nope: 'x' } })?.href)
      .toBe('/approvals')
  })

  it('drops a disallowed filter VALUE but keeps the link (no injection)', () => {
    expect(resolveDestination('approvals', { filters: { state: 'bogus' } })?.href)
      .toBe('/approvals')
  })

  it('never lets an arbitrary value reach the URL', () => {
    const href = resolveDestination('activity', { filters: { status: '../../etc/passwd' } })?.href
    expect(href).toBe('/agent-activity')
    expect(href).not.toContain('passwd')
  })
})

describe('resolveLinks — batch (Atlas present_links)', () => {
  it('keeps valid items and silently drops invalid ones', () => {
    const links = resolveLinks([
      { destination: 'approvals', filters: { state: 'pending' } },
      // @ts-expect-error — invalid id should be dropped
      { destination: 'nonsense' },
      { destination: 'activity', project: '!!! bad !!!' }, // unresolvable project → dropped
    ])
    expect(links).toHaveLength(1)
    expect(links[0].href).toBe('/approvals?state=pending')
  })
})

describe('searchDestinations — multi-word queries', () => {
  const ids = (q: string) => searchDestinations(q, { projects: [] }).map(r => r.id)

  it('resolves single-word queries', () => {
    expect(ids('approvals')).toContain('approvals')
    expect(ids('money')).toContain('money')
    expect(ids('dream')).toContain('dream')
  })

  it('resolves "failed runs" to the activity destination', () => {
    expect(ids('failed runs')).toContain('activity')
  })

  it('resolves "pending approvals" to the approvals destination', () => {
    expect(ids('pending approvals')).toContain('approvals')
  })

  it('resolves "money spend" to the money destination', () => {
    expect(ids('money spend')).toContain('money')
  })

  it('resolves "project health" to the health destination', () => {
    expect(ids('project health')).toContain('health')
  })

  it('returns nothing for gibberish', () => {
    expect(searchDestinations('zzzxqq', { projects: [] })).toHaveLength(0)
  })

  it('matches projects by display name', () => {
    const res = searchDestinations('prompt', {
      projects: [{ name: 'The Prompt', slug: 'ai-media-automation' }],
    })
    expect(res.some(r => r.kind === 'project' && r.label === 'The Prompt')).toBe(true)
  })

  it('"the prompt" no longer fuzzy-resolves to the content queue', () => {
    const res = searchDestinations('the prompt', {
      projects: [{ name: 'The Prompt', slug: 'ai-media-automation' }],
    })
    expect(res.some(r => r.id === 'content_queue')).toBe(false)
    expect(res.some(r => r.kind === 'project' && r.label === 'The Prompt')).toBe(true)
  })

  it('returns the default jump targets for a blank query', () => {
    const res = searchDestinations('', { projects: [] })
    expect(res.length).toBeGreaterThan(0)
    expect(res.map(r => r.id)).toContain('approvals')
  })
})

describe('navigation targets — the exact hrefs `navigate` resolves', () => {
  // These mirror what the navigate tool emits (resolveDestination → href),
  // covering the explicit verification list.
  it('The Prompt resolves to ai-media-automation', () => {
    expect(resolveDestination('project_home', { project: 'The Prompt' })?.href)
      .toBe('/projects/ai-media-automation')
    expect(resolveDestination('money', { project: 'The Prompt' })?.href)
      .toBe('/costs?project=ai-media-automation')
  })

  it('GainPilot resolves correctly', () => {
    expect(resolveDestination('project_home', { project: 'GainPilot' })?.href)
      .toBe('/projects/gainpilot')
    expect(resolveDestination('revenue', { project: 'GainPilot' })?.href)
      .toBe('/revenue?project=gainpilot')
  })

  it('Familje-Stunden resolves correctly', () => {
    expect(resolveDestination('project_home', { project: 'Familje-Stunden' })?.href)
      .toBe('/projects/familje-stunden')
    expect(resolveDestination('project_home', { project: 'familje' })?.href)
      .toBe('/projects/familje-stunden')
  })

  it('approvals navigates to the approvals page (with pending filter)', () => {
    expect(resolveDestination('approvals', { filters: { state: 'pending' } })?.href)
      .toBe('/approvals?state=pending')
  })

  it('failed runs navigates to the activity page filtered to failed', () => {
    expect(resolveDestination('activity', { filters: { status: 'failed' } })?.href)
      .toBe('/agent-activity?status=failed')
  })

  it('activity navigates to the activity page', () => {
    expect(resolveDestination('activity')?.href).toBe('/agent-activity')
  })
})
