/**
 * Organisation — Andre → Atlas → projects → agents.
 *
 * Two risks shape these tests.
 *
 * The first is FABRICATION. `agents` has no status column, so "is this agent
 * working" is derived from running runs naming it in a workflow step — and when
 * that query fails the honest answer is "unknown", never "idle". A neutral
 * state for an agent we could not ask about is the difference between a status
 * and a guess.
 *
 * The second is BOUNDARY DRIFT. Organisation is hierarchy; the Intelligence
 * Graph is relationships, dependencies and knowledge flow. The moment a memory
 * node, a skill, a tool edge or an inferred dependency appears here, the two
 * surfaces have started to merge, and that is asserted against directly.
 *
 * Assembly is pure, so membership and ordering are asserted without a database.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { assembleOrganisationModel } from '@/lib/os/organisation'
import { buildBreadcrumbs } from '@/lib/nav/breadcrumbs'
import { keyboardHintsFor } from '@/lib/nav/keyboard-hints'
import {
  destinationBasePath,
  destinationLabel,
  resolveDestination,
  searchDestinations,
} from '@/lib/nav/registry'
import { vnextNavItems } from '@/lib/nav/vnext-nav'

const WEB_ROOT = resolve(__dirname, '../..')
const read = (p: string) => readFileSync(resolve(WEB_ROOT, p), 'utf8')

const LOADER = read('lib/os/organisation.ts')
const VIEW = read('components/platform/vnext/OrganisationView.tsx')
const VIEW_CSS = read('components/platform/vnext/OrganisationView.module.css')
const PAGE = read('app/(platform)/organisation/page.tsx')

/** Executable source only — these files document what they deliberately avoid. */
const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

const PROJECTS = [
  { id: 'p1', name: 'Trading', slug: 'trading', color: '#22d3ee' },
  { id: 'p2', name: 'Familje-Stunden', slug: 'familje-stunden', color: '#a78bfa' },
]
const AGENTS = [
  { id: 'a1', project_id: 'p1', name: 'Nova', description: 'Marknadsanalys', model: 'claude-sonnet-5' },
  { id: 'a2', project_id: 'p1', name: 'Ledger', description: null, model: 'claude-sonnet-5' },
  { id: 'a3', project_id: 'p2', name: 'Vector', description: 'Bildproduktion', model: 'claude-opus-5' },
]
const AVAILABLE = { projects: true, agents: true, activity: true }

const build = (over: Partial<Parameters<typeof assembleOrganisationModel>[0]> = {}) =>
  assembleOrganisationModel({
    operatorName: 'Andre',
    projects: PROJECTS,
    agents: AGENTS,
    workingAgentIds: new Set(['a1']),
    runningRunsByProject: new Map([['p1', 2]]),
    availability: AVAILABLE,
    ...over,
  })

// ─────────────────────────────────────────────────────────────────────────────
// Route
// ─────────────────────────────────────────────────────────────────────────────

describe('organisation · the route is real', () => {
  it('/organisation has a page', () => {
    expect(PAGE).toContain('export default async function OrganisationPage')
  })

  it('the registry owns the path and the label', () => {
    expect(destinationBasePath('organisation')).toBe('/organisation')
    expect(destinationLabel('organisation')).toBe('Organisation')
    expect(resolveDestination('organisation')?.href).toBe('/organisation')
  })

  it('is reachable through the command palette', () => {
    const hit = searchDestinations('organisation', { projects: [] })
    expect(hit.some((r) => r.href === '/organisation')).toBe(true)
  })

  it('does NOT change the approved sidebar IA', () => {
    // Adding a nav item would change navigation membership, which is a locked
    // decision from Phase 0. The destination exists; the sidebar does not move.
    expect(vnextNavItems().some((item) => item.href === '/organisation')).toBe(false)
  })

  it('renders the spatial view for vNext and a plain list for legacy', () => {
    expect(PAGE).toContain('isVNext(generation)')
    expect(PAGE).toContain('<OrganisationLegacy')
    expect(PAGE).toContain('<OrganisationView')
  })

  it('breadcrumbs name it with no special-casing', () => {
    const trail = buildBreadcrumbs('/organisation')
    expect(trail.map((c) => c.label)).toEqual(['Omnira', 'Organisation'])
    expect(trail.at(-1)).toMatchObject({ label: 'Organisation', current: true })
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Scoping and membership
// ─────────────────────────────────────────────────────────────────────────────

describe('organisation · scoping', () => {
  it('scopes through the same helpers every other Atlas surface uses', () => {
    expect(LOADER).toContain('getAllowedProjectIds')
    expect(LOADER).toContain('scopeProjectFilter')
    expect(LOADER).toMatch(/\.in\('id', scopedIds\)/)
    expect(LOADER).toMatch(/\.in\('project_id', scopedIds\)/)
  })

  it('drops an agent whose project is not in the scoped set', () => {
    const model = build({
      agents: [...AGENTS, { id: 'x', project_id: 'other', name: 'Leak', description: null, model: 'm' }],
    })
    const names = model.projects.flatMap((p) => p.agents.map((a) => a.name))
    expect(names).not.toContain('Leak')
    expect(names).toHaveLength(3)
  })

  it('invents no project and no agent', () => {
    const empty = build({ projects: [], agents: [] })
    expect(empty.projects).toEqual([])
    const noAgents = build({ agents: [] })
    expect(noAgents.projects.every((p) => p.agents.length === 0)).toBe(true)
  })

  it('builds no unscoped query of its own', () => {
    const code = codeOnly(LOADER)
    // Every table read must carry a scope. A bare .from(...) without .in(...)
    // would be a second, wider source of the same rows.
    for (const table of ["from('projects')", "from('agents')", "from('runs')"]) {
      expect(code, table).toContain(table)
    }
    expect([...code.matchAll(/\.in\('(id|project_id)', scopedIds\)/g)].length).toBeGreaterThanOrEqual(3)
  })

  it('does not reuse the unscoped agents-activity helper', () => {
    // `fetchAgentActivity` queries every run in the database and its
    // `RunningAgent` carries no agent identity at all.
    expect(codeOnly(LOADER)).not.toContain('fetchAgentActivity')
    expect(codeOnly(LOADER)).not.toContain('agents-activity')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Hierarchy
// ─────────────────────────────────────────────────────────────────────────────

describe('organisation · hierarchy', () => {
  it('places each agent under its own project and nowhere else', () => {
    const model = build()
    expect(model.projects[0].agents.map((a) => a.name)).toEqual(['Ledger', 'Nova'])
    expect(model.projects[1].agents.map((a) => a.name)).toEqual(['Vector'])
    const seen = model.projects.flatMap((p) => p.agents.map((a) => a.id))
    expect(new Set(seen).size).toBe(seen.length)
  })

  it('renders the four levels in order: operator → Atlas → project → agent', () => {
    const order = ['styles.operator', 'styles.atlas', 'styles.projects', 'styles.agents']
    const positions = order.map((token) => VIEW.indexOf(token))
    expect(positions.every((p) => p >= 0)).toBe(true)
    expect(positions).toEqual([...positions].sort((a, b) => a - b))
  })

  it('nests agents inside their project <li>, never as Atlas peers', () => {
    // Scoped to the main component body so this asserts DOM nesting rather
    // than where a helper happens to sit in the file.
    const body = VIEW.slice(
      VIEW.indexOf('export function OrganisationView'),
      VIEW.indexOf('function ProjectFace'),
    )
    const group = body.slice(body.indexOf('styles.projectGroup'))
    expect(group).toContain('styles.agents')
    expect(group).toContain('styles.agentSlot')
    expect(group).toContain('<AgentNode')
    // Atlas is rendered before the project list opens, so nothing inside a
    // project group can be a sibling of it.
    expect(body.indexOf('styles.atlasLabel')).toBeLessThan(body.indexOf('styles.projects'))
    expect(body.indexOf('styles.operatorName')).toBeLessThan(body.indexOf('styles.atlasLabel'))
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Collapse
// ─────────────────────────────────────────────────────────────────────────────

describe('organisation · progressive disclosure', () => {
  it('collapsing REMOVES the agents rather than hiding them', () => {
    // Hidden-but-present children stay in the accessibility tree and get
    // announced when nothing is on screen.
    expect(VIEW).toMatch(/!isCollapsed && project\.agents\.length > 0 \? \(/)
    expect(VIEW_CSS).not.toMatch(/\.agents\s*\{[^}]*display:\s*none/)
  })

  it('the toggle states what it controls', () => {
    expect(VIEW).toContain('aria-expanded={!isCollapsed}')
    expect(VIEW).toContain('aria-controls={panelId}')
    expect(VIEW).toMatch(/Visa agenter i|Dölj agenter i/)
  })

  it('offers no toggle for a project with no agents', () => {
    expect(VIEW).toMatch(/project\.agents\.length > 0 \? \(\s*<button/)
  })

  it('collapse is per project, not global', () => {
    expect(VIEW).toContain('collapsed.has(project.id)')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Activity — real, or honestly unknown
// ─────────────────────────────────────────────────────────────────────────────

describe('organisation · activity is never fabricated', () => {
  it('marks an agent working only when a running run names it', () => {
    const model = build()
    const trading = model.projects[0].agents
    expect(trading.find((a) => a.name === 'Nova')!.working).toBe(true)
    expect(trading.find((a) => a.name === 'Ledger')!.working).toBe(false)
  })

  it('reports UNKNOWN, not idle, when activity could not be read', () => {
    const model = build({
      workingAgentIds: null,
      runningRunsByProject: null,
      availability: { ...AVAILABLE, activity: false },
    })
    for (const agent of model.projects.flatMap((p) => p.agents)) {
      expect(agent.working).toBeNull()
    }
    // And the run count is null rather than a fabricated zero.
    expect(model.projects.every((p) => p.runningRuns === null)).toBe(true)
  })

  it('distinguishes zero running runs from unavailable', () => {
    const known = build({ runningRunsByProject: new Map() })
    expect(known.projects.every((p) => p.runningRuns === 0)).toBe(true)
  })

  it('derives activity only from the one link that exists', () => {
    // workflows.steps[].agent_id — the same path fetchActiveExecution follows.
    expect(LOADER).toContain('step?.agent_id')
    expect(LOADER).toMatch(/\.eq\('status', 'running'\)/)
  })

  it('the view renders three distinct statuses, and states them in words', () => {
    expect(VIEW).toContain("agent.working === null ? 'unknown'")
    expect(VIEW).toMatch(/Status okänd/)
    expect(VIEW).toMatch(/Arbetar/)
    expect(VIEW).toMatch(/Inaktiv/)
    // Unknown must not look like idle.
    expect(VIEW_CSS).toMatch(/\.agentDot\[data-status='unknown'\]/)
    expect(VIEW_CSS).toMatch(/\.agentDot\[data-status='idle'\]/)
  })

  it('invents no metric, role or permission', () => {
    const code = codeOnly(VIEW)
    expect(code).not.toMatch(/Math\.random/)
    expect(code).not.toMatch(/\b(uptime|score|performance|accuracy|effektivitet)\b/i)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// The Intelligence Graph boundary
// ─────────────────────────────────────────────────────────────────────────────

describe('organisation · stays hierarchy, never becomes the graph', () => {
  it('carries no graph node kind or relation', () => {
    const forbidden = [
      'memory', 'memories', 'skill', 'skill_ids', 'tool', 'capability',
      'READ_MEMORY', 'USES_SKILL', 'USED_TOOL', 'DELEGATED_TO', 'depends',
      'graph-contract', 'IntelligenceGraph',
    ]
    for (const token of [codeOnly(LOADER), codeOnly(VIEW)]) {
      for (const term of forbidden) {
        expect(token.toLowerCase(), term).not.toContain(term.toLowerCase())
      }
    }
  })

  it('models no edge between nodes — only membership', () => {
    // Membership is expressed by nesting: a project HAS agents. There is no
    // edge list, no source/target pair, no relation type.
    expect(codeOnly(LOADER)).not.toMatch(/\bedges?\b/i)
    expect(codeOnly(LOADER)).not.toMatch(/\b(source|target)\b/i)
    expect(codeOnly(VIEW)).not.toMatch(/\bedges?\b/i)
  })

  it('does not read the graph contract or its producers', () => {
    expect(codeOnly(LOADER)).not.toContain('lib/intelligence')
    expect(codeOnly(VIEW)).not.toContain('lib/intelligence')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Destinations
// ─────────────────────────────────────────────────────────────────────────────

describe('organisation · real destinations only', () => {
  it('a project opens its existing route, from the registry', () => {
    const model = build()
    expect(model.projects[0].href)
      .toBe(resolveDestination('project_home', { project: 'trading' })?.href)
    expect(model.projects[0].href).toBe('/projects/trading')
  })

  it('an agent opens the existing agent route, built from its project', () => {
    const model = build()
    expect(model.projects[0].agents.find((a) => a.name === 'Nova')!.href)
      .toBe('/projects/trading/agents/a1')
  })

  it('a routeless agent is rendered non-interactive rather than linked', () => {
    expect(VIEW).toContain('if (!agent.href)')
    expect(VIEW).toMatch(/<span className=\{styles\.agentNode\}/)
  })

  it('creates no duplicate project or agent destination', () => {
    // The only URL shapes are the registry's project route and the agent page
    // beneath it. Nothing else is written as a literal.
    const code = codeOnly(LOADER)
    expect([...code.matchAll(/['"`]\/[a-z]/g)].length).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Keyboard, motion, scale
// ─────────────────────────────────────────────────────────────────────────────

describe('organisation · keyboard, motion and scale', () => {
  it('creates no keyboard owner', () => {
    const code = codeOnly(VIEW)
    expect(code).not.toMatch(/addEventListener\(\s*['"]key/)
    expect(code).not.toContain('KeyboardEvent')
    expect(code).not.toContain('resolveProjectRailKeyAction')
    expect(code).not.toContain('ArrowLeft')
  })

  it('advertises only the global shortcuts, because it has no others', () => {
    expect(keyboardHintsFor('/organisation').map((h) => h.keys.join('+')))
      .toEqual(['⌘+K', 'Alt+Space'])
  })

  it('is operable with links and buttons alone', () => {
    expect(VIEW).toContain('<Link')
    expect(VIEW).toContain('type="button"')
    expect(VIEW_CSS).toContain(':focus-visible')
  })

  it('honours the resolved motion signal', () => {
    expect(VIEW_CSS).toContain('@media (prefers-reduced-motion: reduce)')
    expect(VIEW_CSS).toContain(":where(html:not([data-motion='full']))")
  })

  it('removes the travelling pulse on the ATTRIBUTE path, not just the media query', () => {
    // The global reduce rule sets animation-duration to ~0, which does not
    // apply the keyframe — so the pulse reverts to its base style and sits
    // stranded at the top of the junction at 0.75 opacity, reading as a stray
    // glowing blob. Verified in a browser before and after this rule.
    expect(VIEW_CSS).toMatch(/html\[data-motion='reduce'\] \.junction::after \{\s*display: none/)
  })

  it('reduced motion keeps every state readable without movement', () => {
    const block = VIEW_CSS.slice(VIEW_CSS.indexOf('@media (prefers-reduced-motion: reduce)'))
    expect(block).toMatch(/animation: none/)
    expect(block).toMatch(/transition: none/)
    // The only thing removed is the travelling pulse, which carries no state.
    // The only thing removed is the travelling pulse, which carries no state.
    // Every `display: none` inside the block must belong to that one selector.
    const hidden = [...block.matchAll(/display:\s*none/g)]
    expect(hidden.length).toBeGreaterThan(0)
    for (const match of hidden) {
      expect(block.slice(Math.max(0, match.index! - 140), match.index!))
        .toContain('.junction::after')
    }
  })

  it('scales with the display preference and never uses zoom', () => {
    expect(VIEW_CSS).not.toMatch(/^\s*zoom:/m)
    expect(VIEW_CSS).not.toMatch(/font-size:\s*[0-9.]+px/)
    expect(VIEW_CSS).toMatch(/font-size: [0-9.]+rem/)
  })

  it('cannot overflow the page horizontally, and stacks when narrow', () => {
    expect(VIEW_CSS).toContain('overflow-x: hidden')
    expect(VIEW_CSS).toContain('max-width: 100%')
    expect(VIEW_CSS).toMatch(/@media \(max-width: 720px\)/)
    expect(VIEW_CSS).toMatch(/flex-direction: column/)
  })
})
