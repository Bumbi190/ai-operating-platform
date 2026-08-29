/**
 * Returning from the Trading workspace to its card on the rail.
 *
 * The round trip under test:
 *
 *   Trading workspace  →  Esc / safe Backspace
 *                      →  /atlas?ui=vnext&project=system:trading
 *                      →  the rail selects the Trading SYSTEM_WORKSPACE card
 *
 * The whole point of these assertions is that `system:trading` travels through
 * the PRESENTATION path only. It is a rail selection token — it must never be
 * treated as a project slug, never reach `getAllowedProjectIds`, never hit a
 * Supabase lookup, and never mutate anything. The DB project path stays exactly
 * as fail-closed as it was: it rejects this value, and that rejection is
 * asserted here rather than assumed.
 */

import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { resolveProjectSlug } from '@/lib/nav/registry'
import {
  TRADING_WORKSPACE_ID,
  composeAtlasRailCards,
  resolveRailSelectionIndex,
} from '@/lib/atlas/first-party-workspaces'
import { resolveMarketViewKeyAction } from '@/lib/trading/market-view/keyboard'
import type { AtlasHomeProjectSummary } from '@/lib/atlas/home-view-model'

// The rail reads its selection token from the query string. This is the only
// thing stubbed: the token under test is supplied exactly as a real return
// navigation would supply it.
const searchParams = { value: new URLSearchParams() }
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
  useSearchParams: () => searchParams.value,
  usePathname: () => '/atlas',
}))
vi.mock('next/image', () => ({ default: () => null }))

const PROJECTS: AtlasHomeProjectSummary[] = [
  { id: 'p1', name: 'GainPilot', slug: 'gainpilot', color: '#8b5cf6', href: '/projects/gainpilot', runningRuns: 0, pendingApprovals: 0 },
  { id: 'p2', name: 'The Prompt', slug: 'ai-media-automation', color: '#34d399', href: '/projects/ai-media-automation', runningRuns: 0, pendingApprovals: 0 },
]

let ProjectRail: (props: Record<string, unknown>) => JSX.Element

beforeAll(async () => {
  ProjectRail = (await import('@/components/platform/vnext/ProjectRail')).ProjectRail as never
})

function renderRailWithToken(token: string | null): string {
  searchParams.value = new URLSearchParams(token === null ? '' : `ui=vnext&project=${encodeURIComponent(token)}`)
  return renderToStaticMarkup(
    createElement(ProjectRail, {
      cards: composeAtlasRailCards(PROJECTS),
      generatedAt: '2026-08-28T15:30:00Z',
      availability: { projects: true, runs: true, approvals: true },
    }),
  )
}

/** The `<article>` for one card kind, from rendered markup. */
function cardOfKind(markup: string, kind: 'PROJECT' | 'SYSTEM_WORKSPACE'): string {
  const articles = markup.match(/<article[\s\S]*?<\/article>/g) ?? []
  const found = articles.find((a) => a.includes(`data-card-kind="${kind}"`))
  expect(found, `no ${kind} card rendered`).toBeTruthy()
  return found as string
}

// ─── Step 1 — the workspace asks to go back ───────────────────────────────────

describe('leaving the Trading workspace', () => {
  const base = { defaultPrevented: false, metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, target: null }
  const doc = { querySelectorAll: () => [] } as unknown as Document

  it('treats Esc and safe Backspace as return', () => {
    expect(resolveMarketViewKeyAction({ ...base, key: 'Escape' }, doc)).toBe('return')
    expect(resolveMarketViewKeyAction({ ...base, key: 'Backspace' }, doc)).toBe('return')
  })

  it('navigates to the rail with this workspace as the selection token', () => {
    // Asserted against the source, because the navigation is a router side
    // effect: what matters is the exact URL the component asks for.
    const source = readFileSync(
      fileURLToPath(new URL('../../components/platform/trading/AtlasMarketView.tsx', import.meta.url)),
      'utf8',
    )
    expect(source).toContain('/atlas?ui=vnext&project=${encodeURIComponent(TRADING_WORKSPACE_ID)}')
    expect(TRADING_WORKSPACE_ID).toBe('system:trading')
  })
})

// ─── Step 2 — the token is not, and cannot become, a project ──────────────────

describe('system:trading is not a project slug', () => {
  it('is rejected by the canonical slug resolver', () => {
    expect(resolveProjectSlug('system:trading')).toBeNull()
    expect(resolveProjectSlug(TRADING_WORKSPACE_ID)).toBeNull()
  })

  it('cannot be smuggled into a project-scoped destination', () => {
    // `resolveDestination` drops a link whose project cannot be trusted, rather
    // than pointing it at some other business. That behaviour is unchanged.
    expect(resolveProjectSlug('gainpilot')).toBe('gainpilot')
    expect(resolveProjectSlug('system:anything')).toBeNull()
  })

  it('never reaches project authorization from the rail path', () => {
    // Structural: the rail and the registry it resolves through import nothing
    // that could authorize, look up, or persist a project.
    const forbidden = [
      /getAllowedProjectIds/, /scopeProjectFilter/, /createAdminClient/, /createClient/,
      /supabase/i, /from\(['"]projects['"]\)/, /\.insert\(/, /\.update\(/, /\.upsert\(/,
    ]
    for (const file of [
      '../atlas/first-party-workspaces.ts',
      '../../components/platform/vnext/ProjectRail.tsx',
    ]) {
      const source = readFileSync(fileURLToPath(new URL(file, import.meta.url)), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:])\/\/.*$/gm, '$1')
      for (const pattern of forbidden) {
        expect(source, `${file} matches ${pattern}`).not.toMatch(pattern)
      }
    }
  })
})

// ─── Step 3 — the rail restores the card ──────────────────────────────────────

describe('the rail restores the Trading card from the token', () => {
  it('resolves the token to the system workspace card', () => {
    const cards = composeAtlasRailCards(PROJECTS)
    const index = resolveRailSelectionIndex(cards, TRADING_WORKSPACE_ID)
    expect(cards[index].kind).toBe('SYSTEM_WORKSPACE')
    expect(cards[index].id).toBe(TRADING_WORKSPACE_ID)
  })

  it('still resolves a real project slug to its own card', () => {
    const cards = composeAtlasRailCards(PROJECTS)
    const index = resolveRailSelectionIndex(cards, 'ai-media-automation')
    expect(cards[index].kind).toBe('PROJECT')
    expect(cards[index].id).toBe('p2')
  })

  it('falls back to the first card for an absent or unknown token', () => {
    const cards = composeAtlasRailCards(PROJECTS)
    expect(resolveRailSelectionIndex(cards, null)).toBe(0)
    expect(resolveRailSelectionIndex(cards, '')).toBe(0)
    expect(resolveRailSelectionIndex(cards, 'no-such-thing')).toBe(0)
    // A project slug that is not on the rail must not select a system card.
    expect(cards[resolveRailSelectionIndex(cards, 'some-other-business')].kind).toBe('PROJECT')
  })

  it('renders the Trading card as the selected one', () => {
    const markup = renderRailWithToken(TRADING_WORKSPACE_ID)
    const trading = cardOfKind(markup, 'SYSTEM_WORKSPACE')
    expect(trading).toContain('data-selected="true"')
    expect(trading).toContain('aria-current="true"')
    expect(trading).toContain('Öppna Trading')
    // And no project card steals the selection.
    expect(cardOfKind(markup, 'PROJECT')).not.toContain('data-selected="true"')
  })

  it('leaves a project card selected when its own slug is the token', () => {
    const markup = renderRailWithToken('gainpilot')
    expect(cardOfKind(markup, 'SYSTEM_WORKSPACE')).not.toContain('data-selected="true"')
    expect(cardOfKind(markup, 'PROJECT')).toContain('data-selected="true"')
  })

  it('selects the first project when there is no token at all', () => {
    const markup = renderRailWithToken(null)
    expect(cardOfKind(markup, 'SYSTEM_WORKSPACE')).not.toContain('data-selected="true"')
    expect(cardOfKind(markup, 'PROJECT')).toContain('data-selected="true"')
  })
})
