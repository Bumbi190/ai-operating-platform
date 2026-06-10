/**
 * Atlas View Awareness (Foundation 1) — normalization + rendering tests.
 *
 * The envelope is untrusted: route → destination + project are re-resolved via
 * the registry, filters are whitelisted, selection/visible are capped and carry
 * only ids + labels. These tests lock that contract.
 */
import { describe, it, expect } from 'vitest'
import { pathToDestination } from '@/lib/nav/registry'
import { normalizeView, renderViewBlock } from '@/lib/atlas/view-context'

describe('pathToDestination — reverse route lookup', () => {
  it('maps top-level pages', () => {
    expect(pathToDestination('/revenue')).toBe('revenue')
    expect(pathToDestination('/approvals')).toBe('approvals')
    expect(pathToDestination('/agent-activity')).toBe('activity')
  })
  it('prefers the longest base path (nested over parent)', () => {
    expect(pathToDestination('/atlas/content')).toBe('content_queue')
    expect(pathToDestination('/atlas/marketing')).toBe('marketing_queue')
    expect(pathToDestination('/atlas')).toBe('atlas')
  })
  it('maps a project page to project_home', () => {
    expect(pathToDestination('/projects/gainpilot')).toBe('project_home')
  })
  it('returns null for an unknown path', () => {
    expect(pathToDestination('/totally-unknown')).toBeNull()
  })
})

describe('normalizeView — trusted view from untrusted envelope', () => {
  it('returns null when there is no valid route', () => {
    expect(normalizeView(undefined)).toBeNull()
    expect(normalizeView({})).toBeNull()
    expect(normalizeView({ pathname: 'not-absolute' })).toBeNull()
  })

  it('resolves destination + label from the route', () => {
    const v = normalizeView({ pathname: '/revenue' })!
    expect(v.destinationId).toBe('revenue')
    expect(v.destinationLabel).toBe('Revenue')
    expect(v.project).toBeNull()
  })

  it('resolves project from a /projects/<slug> route (alias-aware)', () => {
    const v = normalizeView({ pathname: '/projects/ai-media-automation' })!
    expect(v.project).toEqual({ slug: 'ai-media-automation', name: 'The Prompt' })
  })

  it('resolves project from ?project= and an alias', () => {
    const v = normalizeView({ pathname: '/revenue', search: '?project=the%20prompt' })!
    expect(v.project?.slug).toBe('ai-media-automation')
  })

  it('keeps only whitelisted filter keys+values for the destination', () => {
    const v = normalizeView({ pathname: '/approvals', search: '?state=pending&bogus=x&state2=y' })!
    expect(v.filters).toEqual({ state: 'pending' })
  })

  it('drops a disallowed filter VALUE', () => {
    const v = normalizeView({ pathname: '/approvals', search: '?state=notreal' })!
    expect(v.filters).toEqual({})
  })

  it('normalizes selection/visible to id+label refs and caps them', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ domain: 'leads', id: `l${i}`, label: `Lead ${i}` }))
    const v = normalizeView({ pathname: '/revenue', selection: many, visible: many })!
    expect(v.selection.length).toBe(10)
    expect(v.visible.length).toBe(12)
    expect(v.selection[0]).toEqual({ domain: 'leads', id: 'l0', label: 'Lead 0' })
  })

  it('drops refs without an id and defaults a missing domain', () => {
    const v = normalizeView({ pathname: '/revenue', selection: [{ label: 'no id' }, { id: 'x' }] as any })!
    expect(v.selection).toEqual([{ domain: 'record', id: 'x', label: '' }])
  })

  it('truncates over-long labels', () => {
    const long = 'a'.repeat(200)
    const v = normalizeView({ pathname: '/revenue', selection: [{ domain: 'd', id: '1', label: long }] })!
    expect(v.selection[0].label.length).toBe(80)
  })
})

describe('renderViewBlock — compact [CURRENT VIEW]', () => {
  it('renders page, project, filters, selection', () => {
    const v = normalizeView({
      pathname: '/approvals',
      search: '?state=pending&project=gainpilot',
      selection: [{ domain: 'approvals', id: 'a1', label: 'Reel #4' }],
    })!
    const block = renderViewBlock(v)
    expect(block).toContain('[CURRENT VIEW')
    expect(block).toContain('Page: Approvals')
    expect(block).toContain('GainPilot (gainpilot)')
    expect(block).toContain('state=pending')
    expect(block).toContain('approvals:a1 "Reel #4"')
  })
  it('omits empty sections and marks no project', () => {
    const block = renderViewBlock(normalizeView({ pathname: '/revenue' })!)
    expect(block).toContain('(none / all)')
    expect(block).not.toContain('Filters:')
    expect(block).not.toContain('Selected:')
  })
})
