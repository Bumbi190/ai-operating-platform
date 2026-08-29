/**
 * The Trading card as it actually renders on the Atlas Home rail.
 *
 * The card is a visual peer of the project cards — same geometry, same rail,
 * same keyboard — but it must never be readable as one of the operator's
 * businesses, and it must never look live. Those are rendering claims, so they
 * are asserted against rendered markup rather than against the registry data.
 */

import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import {
  FIRST_PARTY_WORKSPACES,
  TRADING_WORKSPACE_ID,
  composeAtlasRailCards,
} from '@/lib/atlas/first-party-workspaces'
import { buildFixtureSnapshot } from '@/lib/trading/market-view'
import type { AtlasHomeProjectSummary } from '@/lib/atlas/home-view-model'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/atlas',
}))

const PROJECT: AtlasHomeProjectSummary = {
  id: 'p1',
  name: 'GainPilot',
  slug: 'gainpilot',
  color: '#8b5cf6',
  href: '/projects/gainpilot',
  runningRuns: 2,
  pendingApprovals: 1,
  latestActivityAt: '2026-08-28T15:00:00Z',
  latestActivityTitle: 'Arbetsflöde är klart',
}

let ProjectRail: (props: Record<string, unknown>) => JSX.Element

beforeAll(async () => {
  ProjectRail = (await import('@/components/platform/vnext/ProjectRail')).ProjectRail as never
})

function renderRail(projects: AtlasHomeProjectSummary[] = [PROJECT]): string {
  return renderToStaticMarkup(
    createElement(ProjectRail, {
      cards: composeAtlasRailCards(projects),
      generatedAt: '2026-08-28T15:30:00Z',
      availability: { projects: true, runs: true, approvals: true },
    }),
  )
}

describe('the Trading card on the rail', () => {
  it('renders as a peer of the project cards', () => {
    const markup = renderRail()
    expect(markup).toContain('data-card-kind="PROJECT"')
    expect(markup).toContain('data-card-kind="SYSTEM_WORKSPACE"')
    // Same card element, same class — geometry and rail behaviour are shared.
    expect((markup.match(/<article/g) ?? []).length).toBe(2)
    expect(markup).toContain('Trading')
    expect(markup).toContain('GainPilot')
  })

  it('says what it is, in words, on the card face', () => {
    const markup = renderRail()
    expect(markup).toContain('Systemarbetsyta')
    expect(markup).toContain('DEVELOPMENT')
    expect(markup).toContain('FIXTURE')
    expect(markup).toContain('READ ONLY')
    expect(markup).toContain('ingen marknadsanslutning')
  })

  it('never renders as live or writable', () => {
    const markup = renderRail()
    expect(markup).not.toContain('>LIVE<')
    expect(markup).not.toContain('READ WRITE')
  })

  it('links to /trading and opens through the shared rail navigation', () => {
    const markup = renderRail()
    expect(markup).toContain('href="/trading"')
    expect(markup).toContain('Öppna arbetsyta')
    // The project card keeps its own wording and its own href.
    expect(markup).toContain('href="/projects/gainpilot"')
    expect(markup).toContain('Öppna projekt')
  })

  it('carries no project metrics — it has no runs and no approvals', () => {
    const markup = renderRail()
    const tradingCard = markup.split('data-card-kind="SYSTEM_WORKSPACE"')[1]
    expect(tradingCard).not.toContain('aktiva')
    expect(tradingCard).not.toContain('väntar')
  })

  it('still tells an operator with no projects that they have none', () => {
    // The rail is never empty now that a system workspace is always present, so
    // the old empty state would otherwise silently stop appearing.
    const markup = renderRail([])
    expect(markup).toContain('Inga projekt är kopplade till ditt konto ännu')
    expect(markup).toContain('data-card-kind="SYSTEM_WORKSPACE"')
  })

  it('keeps the rail keyboard hint — one navigation model, not two', () => {
    expect(renderRail()).toContain('← → växla · Enter öppna')
  })
})

describe('the card and the workspace agree', () => {
  it('declares the same data mode the fixtures actually produce', () => {
    // Two separate vocabularies, deliberately not imported from each other. This
    // is what keeps them honest: if the Trading surface ever starts producing
    // SIMULATION or LIVE snapshots, the card must be updated to match.
    const workspace = FIRST_PARTY_WORKSPACES.find((w) => w.id === TRADING_WORKSPACE_ID)
    const snapshot = buildFixtureSnapshot('long-developing', 'NQ', '5m')
    expect(workspace?.dataMode).toBe(snapshot.provenance.origin)
  })

  it('declares read-only, and the surface has no order path to contradict it', () => {
    const workspace = FIRST_PARTY_WORKSPACES.find((w) => w.id === TRADING_WORKSPACE_ID)
    expect(workspace?.accessMode).toBe('READ_ONLY')
    const snapshot = buildFixtureSnapshot('a-plus-confirmed', 'NQ', '5m')
    expect(snapshot.tradeProposal.status).toBe('NO_EXECUTION_PROVIDER')
  })
})
