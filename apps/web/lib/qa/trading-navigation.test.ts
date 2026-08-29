/**
 * How Trading is reached, and what it is not.
 *
 * Trading is a first-party SYSTEM WORKSPACE. It appears on the Atlas Home
 * project rail as a peer of the operator's project cards, and it is deliberately
 * NOT an entry in the vNext sidebar — the vNext direction is that workspaces are
 * opened from the rail rather than duplicated into navigation.
 *
 * The assertions that matter most here are the negative ones: no synthetic
 * project row, no widening of the authorization-scoped model, and no second
 * navigation system.
 */

import { describe, expect, it } from 'vitest'
import {
  DESTINATION_IDS,
  PRIMARY_JUMP_TARGETS,
  pathToDestination,
  resolveDestination,
  resolveProjectSlug,
  searchDestinations,
} from '@/lib/nav/registry'
import { LEGACY_GLOBAL_NAV } from '@/lib/nav/legacy-nav'
import { vnextNavItems } from '@/lib/nav/vnext-nav'
import { resolveWorkspace } from '@/lib/atlas/workspace-registry'
import {
  FIRST_PARTY_WORKSPACES,
  TRADING_WORKSPACE_ID,
  composeAtlasRailCards,
  firstPartyWorkspaceById,
  isFirstPartyWorkspaceId,
} from '@/lib/atlas/first-party-workspaces'
import type { AtlasHomeProjectSummary } from '@/lib/atlas/home-view-model'

const PROJECTS: AtlasHomeProjectSummary[] = [
  {
    id: 'p1',
    name: 'GainPilot',
    slug: 'gainpilot',
    color: '#8b5cf6',
    href: '/projects/gainpilot',
    runningRuns: 1,
    pendingApprovals: 0,
  },
  {
    id: 'p2',
    name: 'The Prompt',
    slug: 'ai-media-automation',
    color: '#22c55e',
    href: '/projects/ai-media-automation',
    runningRuns: 0,
    pendingApprovals: 2,
  },
]

// ─── Reachability ─────────────────────────────────────────────────────────────

describe('trading destination', () => {
  it('resolves to /trading through the registry', () => {
    const link = resolveDestination('trading')
    expect(link?.href).toBe('/trading')
    expect(link?.label).toBe('Trading')
  })

  it('is a known destination Atlas may deep-link to', () => {
    expect(DESTINATION_IDS).toContain('trading')
  })

  it('reverse-resolves from the live pathname', () => {
    expect(pathToDestination('/trading')).toBe('trading')
    expect(pathToDestination('/trading/')).toBe('trading')
  })

  it('is project-neutral', () => {
    expect(resolveDestination('trading', { project: 'gainpilot' })?.href).toBe('/trading')
  })

  it('is reachable from the command palette in both languages', () => {
    for (const query of ['trading', 'market', 'marknad', 'chart', 'futures', 'nq']) {
      const hit = searchDestinations(query, { projects: [] }).find((r) => r.id === 'trading')
      expect(hit, `"${query}" does not reach Trading`).toBeTruthy()
      expect(hit?.href).toBe('/trading')
    }
  })

  it('appears in the default jump list before the operator types', () => {
    expect(PRIMARY_JUMP_TARGETS).toContain('trading')
    expect(searchDestinations('', { projects: [] }).some((r) => r.id === 'trading')).toBe(true)
  })

  it('describes /trading as the Trading workspace, with no project reference', () => {
    const workspace = resolveWorkspace('/trading', [])
    expect(workspace.label).toBe('Trading')
    expect(workspace.href).toBe('/trading')
    expect(workspace.project).toBeUndefined()
  })

  it('does not shadow the project routes', () => {
    expect(resolveWorkspace('/projects/gainpilot', [
      { id: '1', slug: 'gainpilot', name: 'GainPilot', color: '#fff' },
    ]).label).toBe('GainPilot')
  })
})

// ─── NOT in the sidebar ───────────────────────────────────────────────────────

describe('trading is not a sidebar entry', () => {
  it('is absent from the vNext navigation model', () => {
    expect(vnextNavItems().some((item) => item.id === 'trading')).toBe(false)
    expect(vnextNavItems().some((item) => item.href === '/trading')).toBe(false)
  })

  it('is absent from legacy navigation, which stays frozen', () => {
    expect(LEGACY_GLOBAL_NAV.some((item) => item.href === '/trading')).toBe(false)
  })

  it('is still reachable without a nav entry', () => {
    // The point of leaving the sidebar alone: nothing is lost by it.
    expect(resolveDestination('trading')?.href).toBe('/trading')
    expect(searchDestinations('trading', { projects: [] })[0]?.href).toBe('/trading')
  })
})

// ─── The system-workspace seam ────────────────────────────────────────────────

describe('first-party workspace registry', () => {
  it('declares Trading as DEVELOPMENT / FIXTURE / READ ONLY', () => {
    const trading = firstPartyWorkspaceById(TRADING_WORKSPACE_ID)
    expect(trading).not.toBeNull()
    expect(trading?.stage).toBe('DEVELOPMENT')
    expect(trading?.dataMode).toBe('FIXTURE')
    expect(trading?.accessMode).toBe('READ_ONLY')
    expect(trading?.href).toBe('/trading')
  })

  it('declares no workspace as LIVE or writable', () => {
    for (const workspace of FIRST_PARTY_WORKSPACES) {
      expect(workspace.dataMode, workspace.id).not.toBe('LIVE')
      expect(workspace.accessMode, workspace.id).not.toBe('READ_WRITE')
      expect(workspace.stage, workspace.id).toBe('DEVELOPMENT')
    }
  })

  it('uses ids that can never be mistaken for a project slug', () => {
    for (const workspace of FIRST_PARTY_WORKSPACES) {
      expect(workspace.id).toMatch(/^system:[a-z][a-z0-9-]*$/)
      // The registry's own slug parser rejects it rather than resolving it to
      // some other business — a colon cannot appear in a slug.
      expect(resolveProjectSlug(workspace.id)).toBeNull()
      expect(isFirstPartyWorkspaceId(workspace.id)).toBe(true)
    }
    expect(isFirstPartyWorkspaceId('gainpilot')).toBe(false)
  })
})

describe('rail composition', () => {
  it('puts the operator portfolio first and system workspaces after', () => {
    const cards = composeAtlasRailCards(PROJECTS)
    expect(cards.map((c) => c.kind)).toEqual(['PROJECT', 'PROJECT', 'SYSTEM_WORKSPACE'])
    expect(cards[2].id).toBe(TRADING_WORKSPACE_ID)
  })

  it('keeps every project card carrying its real row, unmodified', () => {
    const cards = composeAtlasRailCards(PROJECTS)
    for (const card of cards) {
      if (card.kind !== 'PROJECT') continue
      const original = PROJECTS.find((p) => p.id === card.id)
      // Not a copy with extra fields: the same object, so nothing this seam does
      // can alter what the server authorized.
      expect(card.project).toBe(original)
      expect(card.selectionKey).toBe(original?.slug)
    }
  })

  it('never invents a project — the project cards are exactly the input', () => {
    const cards = composeAtlasRailCards(PROJECTS)
    const projectIds = cards.filter((c) => c.kind === 'PROJECT').map((c) => c.id)
    expect(projectIds).toEqual(PROJECTS.map((p) => p.id))
  })

  it('adds nothing to an empty portfolio except declared system workspaces', () => {
    const cards = composeAtlasRailCards([])
    expect(cards).toHaveLength(FIRST_PARTY_WORKSPACES.length)
    expect(cards.every((c) => c.kind === 'SYSTEM_WORKSPACE')).toBe(true)
  })

  it('is pure — repeated composition is identical', () => {
    expect(composeAtlasRailCards(PROJECTS)).toEqual(composeAtlasRailCards(PROJECTS))
  })

  it('accepts an explicit workspace list, so the rail can be tested in isolation', () => {
    expect(composeAtlasRailCards(PROJECTS, [])).toHaveLength(PROJECTS.length)
  })
})
