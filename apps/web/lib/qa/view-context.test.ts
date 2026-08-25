/**
 * Atlas View Awareness (Foundation 1) — normalization + rendering tests.
 *
 * The envelope is untrusted: route → destination + project are re-resolved via
 * the registry, filters are whitelisted, selection/visible are capped and carry
 * only ids + labels. These tests lock that contract.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToDestination, resolveDestination } from '@/lib/nav/registry'
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

/**
 * Canonical reverse resolution.
 *
 * Three destination ids forward to /revenue — money, costs and revenue — which
 * is a deliberate product decision. Reverse resolution had no way to express
 * which of them OWNS that route, so it fell out of ROUTE_MAP declaration order
 * and returned `money`. That label reaches Atlas's chat context, so a user on
 * the Revenue page had the assistant told they were on Money.
 *
 * The route now names its canonical owner explicitly. Forward aliasing is
 * unchanged; only the answer to "what page is this?" changes.
 */
describe('reverse resolution is canonical, not incidental', () => {
  it('resolves /revenue to the canonical destination rather than an alias', () => {
    expect(pathToDestination('/revenue')).toBe('revenue')
  })

  it('keeps every forward alias pointing at /revenue', () => {
    for (const id of ['money', 'costs', 'revenue'] as const) {
      expect(resolveDestination(id)?.href).toBe('/revenue')
    }
  })

  it('keeps the project query-string form intact for the aliases', () => {
    expect(resolveDestination('money', { project: 'The Prompt' })?.href)
      .toBe('/revenue?project=ai-media-automation')
    expect(resolveDestination('revenue', { project: 'The Prompt' })?.href)
      .toBe('/revenue?project=ai-media-automation')
  })

  it('does not simply return whichever alias is declared first', () => {
    // The three ids tie on base-path length, so before the fix the winner was
    // decided by declaration order — `money` came first. A canonical answer must
    // not be either of the aliases, however they are ordered.
    const winner = pathToDestination('/revenue')
    expect(winner).not.toBe('money')
    expect(winner).not.toBe('costs')
  })

  it('reports the canonical label the registry already defines', () => {
    // No new label is invented; normalizeView derives it from the destination id.
    const v = normalizeView({ pathname: '/revenue' })!
    expect(v.destinationId).toBe('revenue')
    expect(v.destinationLabel).toBe('Revenue')
  })

  it('tells Atlas the right page for /revenue', () => {
    // This is where the defect actually reached the user: renderViewBlock feeds
    // the chat context, so the assistant was told "Page: Money" for someone on
    // Revenue. The existing block test above uses /revenue but never asserted
    // the Page line, which is how this went unnoticed.
    const block = renderViewBlock(normalizeView({ pathname: '/revenue' })!)
    expect(block).toContain('Page: Revenue')
    expect(block).not.toContain('Page: Money')
  })

  it('names a canonical owner for every duplicate-path family', () => {
    // All three families that share an exact path are now designated. /system
    // was left undesignated by QA.4 because choosing between `dream` and
    // `health` was a product decision rather than a defect fix; that decision
    // has since been made and is recorded here.
    expect(pathToDestination('/atlas')).toBe('atlas')
    expect(pathToDestination('/revenue')).toBe('revenue')
    expect(pathToDestination('/system')).toBe('health')
  })

  it('tells Atlas the right page for /system', () => {
    // /system is a telemetry surface — its hero reads Systemtelemetri and it
    // carries no Dream Findings content — yet reverse resolution reported the
    // project-scoped nightly-findings destination purely because `dream` is
    // declared first.
    const v = normalizeView({ pathname: '/system' })!
    expect(v.destinationId).toBe('health')
    expect(v.destinationLabel).toBe('Health')
    const block = renderViewBlock(v)
    expect(block).toContain('Page: Health')
    expect(block).not.toContain('Page: Dream Findings')
  })

  it('keeps both /system claimants routing forward unchanged', () => {
    // Reverse ownership moved; forward routing did not. `dream` remains a fully
    // valid destination — it simply no longer speaks for the page.
    expect(resolveDestination('dream')?.href).toBe('/system')
    expect(resolveDestination('health')?.href).toBe('/system')
  })

  it('has exactly the three duplicate-path families it designates', () => {
    // Guards against a future alias quietly joining an existing route, or a new
    // duplicate family appearing with no canonical owner and falling back to
    // declaration order — the failure mode this whole mechanism exists to end.
    const src = readFileSync(
      resolve(__dirname, '../nav/registry.ts'),
      'utf8',
    )
    const body = src.match(/ROUTE_MAP[^=]*=\s*\{([\s\S]*?)\n\}/)![1]
    const byPath = new Map<string, string[]>()
    for (const m of body.matchAll(/^\s*(\w+):\s*'([^']+)'/gm)) {
      byPath.set(m[2], [...(byPath.get(m[2]) ?? []), m[1]])
    }
    const families = [...byPath.entries()].filter(([, ids]) => ids.length > 1).map(([p]) => p)
    expect(families.sort()).toEqual(['/atlas', '/revenue', '/system'])
  })

  it('still resolves nested and unknown routes by longest prefix', () => {
    expect(pathToDestination('/atlas/content')).toBe('content_queue')
    expect(pathToDestination('/atlas/marketing')).toBe('marketing_queue')
    expect(pathToDestination('/projects/gainpilot')).toBe('project_home')
    expect(pathToDestination('/totally-unknown')).toBeNull()
  })
})
