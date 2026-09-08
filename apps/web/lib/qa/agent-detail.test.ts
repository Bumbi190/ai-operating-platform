/**
 * Agent Detail v2.
 *
 * The dominant risk here is not layout — it is CLAIMING CAPABILITY. An agent
 * detail page is exactly the surface where a plausible-looking tool list, a
 * permission scope or an autonomy percentage would slide in unchallenged, and
 * none of those are modelled in Omnira.
 *
 * `lib/atlas/workpackage/roles.ts` already states the position canonically —
 * skills resolve against nothing, no tool registry exists, no capacity source
 * exists — so these tests hold this surface to the repository's own audit
 * rather than to a fresh opinion.
 *
 * The second risk is losing the editor. It was the entire route before this
 * phase; it must still be exactly one editor, still reachable.
 */

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { assembleAgentDetail } from '@/lib/os/agent-detail'
import {
  AGENT_DETAIL_TABS,
  AGENT_DETAIL_TAB_LABELS,
  AGENT_DETAIL_TAB_UNAVAILABLE,
} from '@/lib/os/agent-detail-shared'
import { buildBreadcrumbs } from '@/lib/nav/breadcrumbs'
import { keyboardHintsFor } from '@/lib/nav/keyboard-hints'
import { resolveDestination } from '@/lib/nav/registry'

const WEB_ROOT = resolve(__dirname, '../..')
const read = (p: string) => readFileSync(resolve(WEB_ROOT, p), 'utf8')

const LOADER = read('lib/os/agent-detail.ts')
const VIEW = read('components/platform/vnext/AgentDetail.tsx')
const VIEW_CSS = read('components/platform/vnext/AgentDetail.module.css')
const PAGE = read('app/(platform)/projects/[slug]/agents/[id]/page.tsx')
const EDIT_PAGE = read('app/(platform)/projects/[slug]/agents/[id]/edit/page.tsx')
const EDITOR = read('app/(platform)/projects/[slug]/agents/[id]/EditAgentClient.tsx')
const ORGANISATION = read('lib/os/organisation.ts')
const SHARED = read('lib/os/agent-detail-shared.ts')

const codeOnly = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')

const PROJECT = { id: 'p1', name: 'Trading', slug: 'trading', color: '#22d3ee' }
const AGENT = {
  id: 'a1', project_id: 'p1', name: 'Nova', description: 'Marknadsanalys',
  model: 'claude-sonnet-5', system_prompt: 'Du är Nova.', skill_ids: ['market.read', 'chart.annotate'],
  created_at: '2026-01-02T00:00:00Z',
}
const WORKFLOWS = [
  { id: 'w1', name: 'Morgonbriefing', steps: [{ order: 1, name: 'Hämta candles', agent_id: 'a1' }] },
  { id: 'w2', name: 'Riskkontroll', steps: [{ order: 1, name: 'Bedöm risk', agent_id: 'other' }] },
]

const build = (over: Partial<Parameters<typeof assembleAgentDetail>[0]> = {}) =>
  assembleAgentDetail({
    agent: AGENT, project: PROJECT, workflows: WORKFLOWS,
    runningWorkflowIds: new Set(['w1']), ...over,
  })

// ─────────────────────────────────────────────────────────────────────────────
// Data honesty
// ─────────────────────────────────────────────────────────────────────────────

describe('agent detail · data honesty', () => {
  it('is scoped to the project the URL names', () => {
    expect(LOADER).toMatch(/\.eq\('project_id', project\.id\)/)
    expect(LOADER).toMatch(/\.eq\('id', agentId\)/)
    // The route resolves the project from the slug before looking anything up.
    expect(PAGE).toContain('getProjectBySlug(params.slug)')
  })

  it('a foreign agent cannot be rendered under this project', () => {
    // Both the query and the route's notFound() enforce it; the query is the
    // one that must not be loosened.
    expect(LOADER).toContain("eq('project_id', project.id)")
    expect(PAGE).toContain('notFound()')
  })

  it('invents no agent and no field', () => {
    const model = build()
    expect(model.agent.name).toBe('Nova')
    expect(model.agent.model).toBe('claude-sonnet-5')
    expect(model.agent.skillIds).toEqual(['market.read', 'chart.annotate'])
  })

  it('fabricates no metric, score or count', () => {
    // Asserted on the MODEL, not on source text: the unavailable copy names
    // autonomy and delegation precisely to say they are NOT per-agent, and a
    // substring scan would flag that honest denial as an invention.
    const keys = new Set<string>()
    const walk = (value: unknown) => {
      if (!value || typeof value !== 'object') return
      for (const [key, child] of Object.entries(value)) { keys.add(key); walk(child) }
    }
    walk(build())
    for (const forbidden of [
      'autonomy', 'autonomi', 'successRate', 'health', 'score',
      'tokens', 'uptime', 'performance', 'lastActive', 'lastSeen',
    ]) {
      expect([...keys], forbidden).not.toContain(forbidden)
    }
    expect(codeOnly(VIEW) + codeOnly(LOADER)).not.toMatch(/Math\.random/)
  })

  it('reports the system prompt as presence, not content', () => {
    // The prompt is the editor's material. The detail surface says whether one
    // is configured and how long it is — never the text.
    const model = build()
    expect(model.agent.hasSystemPrompt).toBe(true)
    expect(model.agent.systemPromptChars).toBe('Du är Nova.'.length)
    expect(model).not.toHaveProperty('agent.systemPrompt')
    expect(JSON.stringify(model)).not.toContain('Du är Nova.')
  })

  it('normalises a malformed skill_ids without inventing entries', () => {
    expect(build({ agent: { ...AGENT, skill_ids: null } }).agent.skillIds).toEqual([])
    expect(build({ agent: { ...AGENT, skill_ids: ['ok', 3, '', null] } }).agent.skillIds).toEqual(['ok'])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Activity — unknown stays unknown
// ─────────────────────────────────────────────────────────────────────────────

describe('agent detail · activity', () => {
  it('is working only when a running run names it in a step', () => {
    expect(build().working).toBe(true)
    expect(build({ runningWorkflowIds: new Set(['w2']) }).working).toBe(false)
    expect(build({ runningWorkflowIds: new Set() }).working).toBe(false)
  })

  it('stays UNKNOWN — not idle — when the lookup fails', () => {
    expect(build({ runningWorkflowIds: null }).working).toBeNull()
    expect(build({ workflows: null, runningWorkflowIds: null }).working).toBeNull()
  })

  it('the view renders three distinct states, in words as well as colour', () => {
    expect(VIEW).toContain("model.working === null ? 'unknown'")
    expect(VIEW).toMatch(/Status okänd/)
    expect(VIEW).toMatch(/Arbetar/)
    expect(VIEW).toMatch(/Inaktiv/)
    // Unknown is a ring, idle is a filled dot — never the same shape.
    expect(VIEW_CSS).toMatch(/\.statusDot\[data-status='unknown'\][^}]*border:/)
    expect(VIEW_CSS).toMatch(/\.statusDot\[data-status='idle'\][^}]*background:/)
  })

  it('never derives activity from created_at or unrelated project runs', () => {
    const code = codeOnly(LOADER)
    expect(code).not.toMatch(/created_at[^\n]*working/)
    // The run query is filtered to this project AND to running.
    expect(code).toMatch(/\.eq\('status', 'running'\)/)
    expect(code).toMatch(/\.eq\('project_id', project\.id\)/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Tab classification
// ─────────────────────────────────────────────────────────────────────────────

describe('agent detail · every tab is classified against real runtime', () => {
  it('covers the eight requested sections', () => {
    expect([...AGENT_DETAIL_TABS]).toEqual([
      'overview', 'chat', 'skills', 'tools', 'memory', 'permissions', 'workflows', 'tasks',
    ])
    expect(Object.keys(AGENT_DETAIL_TAB_LABELS)).toHaveLength(8)
  })

  it('classifies each one as the audit found it', () => {
    expect(build().tabs).toEqual({
      overview: 'REAL',
      chat: 'UNAVAILABLE',      // no operator↔agent chat runtime
      skills: 'PARTIAL',        // skill_ids real, resolve against nothing
      tools: 'UNAVAILABLE',     // no tool registry, no agent→tool assignment
      memory: 'UNAVAILABLE',    // memories is keyed by project_id only
      permissions: 'UNAVAILABLE', // no per-agent permission model
      workflows: 'PARTIAL',     // membership real, history not
      tasks: 'UNAVAILABLE',     // manager_tasks has no agent column
    })
  })

  it('skills stay PARTIAL whatever the count', () => {
    // Zero declared skills is not "more available" — the capability is partial
    // because nothing resolves the labels, not because the list is short.
    expect(build({ agent: { ...AGENT, skill_ids: [] } }).tabs.skills).toBe('PARTIAL')
  })

  it('workflows fall to UNAVAILABLE when the query failed', () => {
    expect(build({ workflows: null }).tabs.workflows).toBe('UNAVAILABLE')
    expect(build({ workflows: null }).workflowsAvailable).toBe(false)
  })

  it('every UNAVAILABLE tab explains what it is and what is missing', () => {
    const model = build()
    for (const tab of AGENT_DETAIL_TABS) {
      if (model.tabs[tab] !== 'UNAVAILABLE') continue
      const copy = AGENT_DETAIL_TAB_UNAVAILABLE[tab]
      expect(copy, tab).toBeDefined()
      expect(copy!.what.length, tab).toBeGreaterThan(10)
      expect(copy!.why.length, tab).toBeGreaterThan(20)
    }
  })

  it('promises nothing a roadmap does not back', () => {
    const copy = Object.values(AGENT_DETAIL_TAB_UNAVAILABLE).map((c) => `${c.what} ${c.why}`).join(' ')
    for (const promise of ['kommer snart', 'coming soon', 'snart tillgänglig', 'planerad']) {
      expect(copy.toLowerCase(), promise).not.toContain(promise)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// The capability boundaries that matter most
// ─────────────────────────────────────────────────────────────────────────────

describe('agent detail · claims no capability Omnira does not model', () => {
  it('infers no tools from anything', () => {
    // Not from project capabilities, not from mission bounds, not from
    // delegation, not from what the model could theoretically call.
    const code = codeOnly(LOADER) + codeOnly(VIEW)
    for (const source of [
      'capability/', 'desktop-commander', 'media-generation',
      'MissionToolBound', 'DelegationEnvelope', 'attenuate',
    ]) {
      expect(code, source).not.toContain(source)
    }
    expect(build().tabs.tools).toBe('UNAVAILABLE')
  })

  it('infers no permissions or authority', () => {
    const code = codeOnly(LOADER) + codeOnly(VIEW)
    for (const source of [
      'run-authority', 'execution-stop', 'atlas_authorizations',
      'atlas_mission_ledger', 'atlas_delegation_ledger', 'approval_gates',
    ]) {
      expect(code, source).not.toContain(source)
    }
    expect(build().tabs.permissions).toBe('UNAVAILABLE')
  })

  it('does not equate project memory with agent memory', () => {
    const code = codeOnly(LOADER) + codeOnly(VIEW)
    expect(code).not.toContain("from('memories')")
    expect(code).not.toContain('memory-store')
    expect(build().tabs.memory).toBe('UNAVAILABLE')
  })

  it('does not reinterpret workflow steps as agent tasks', () => {
    // The copy names `manager_tasks` to explain why the tab is empty; what must
    // not exist is a QUERY against it, or a task derived from a workflow step.
    expect(codeOnly(LOADER)).not.toMatch(/from\(['"]manager_tasks['"]\)/)
    expect(codeOnly(VIEW)).not.toMatch(/tasks?\s*[:=]\s*\w*workflow/i)
    expect(build().tabs.tasks).toBe('UNAVAILABLE')
  })

  it('creates no skills table, registry or schema', () => {
    const code = codeOnly(LOADER) + codeOnly(VIEW)
    expect(code).not.toMatch(/from\('skills'\)/)
    expect(code).not.toMatch(/SKILL_REGISTRY|SKILL_CATALOG/)
    // The canonical field is the only source.
    expect(LOADER).toContain('skill_ids')
  })

  it('renders skill ids as the uninterpreted labels they are', () => {
    // JSX wraps prose across lines, so whitespace is normalised before matching.
    expect(VIEW.replace(/\s+/g, ' ')).toMatch(/inget färdighetsregister/i)
    // Structural, not a word scan: the note deliberately NAMES description,
    // version and derived capability in order to say they are absent. What must
    // be true is that each list item renders the identifier and nothing else.
    const skills = VIEW.slice(VIEW.indexOf('function Skills'), VIEW.indexOf('function Workflows'))
    const items = [...skills.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/g)].map((m) => m[1].trim())
    expect(items).toHaveLength(1)
    expect(items[0]).toBe('{id}')
  })

  it('borrows no Intelligence Graph vocabulary', () => {
    const code = codeOnly(LOADER) + codeOnly(VIEW)
    for (const term of [
      'READ_MEMORY', 'USED_TOOL', 'DELEGATED_TO', 'USES_SKILL',
      'graph-contract', 'IntelligenceGraph', 'edges',
    ]) {
      expect(code, term).not.toContain(term)
    }
  })

  it('uses the same agent↔workflow link Organisation does, and only that one', () => {
    expect(LOADER).toContain('step?.agent_id === agent.id')
    expect(ORGANISATION).toContain('step?.agent_id')
  })

  it('shows workflow membership without implying history', () => {
    const model = build()
    expect(model.workflows).toHaveLength(1)
    expect(model.workflows[0]).toMatchObject({
      workflowId: 'w1', workflowName: 'Morgonbriefing', running: true,
    })
    expect(VIEW.replace(/\s+/g, ' ')).toMatch(/Historik per agent finns inte/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// The server/client boundary
// ─────────────────────────────────────────────────────────────────────────────

describe('agent detail · the server/client boundary holds', () => {
  it('the loader stays server-only', () => {
    expect(LOADER).toMatch(/^import 'server-only'/)
    expect(LOADER).toContain('createAdminClient')
  })

  it('the shared contract carries no server-only marker and no data access', () => {
    // It is imported by a client component, so anything server-side in here
    // lands in the browser bundle.
    expect(SHARED).not.toContain("import 'server-only'")
    for (const forbidden of ['createAdminClient', 'createClient', 'from(', 'supabase']) {
      expect(SHARED, forbidden).not.toContain(forbidden)
    }
  })

  it('the client component takes runtime values ONLY from the shared module', () => {
    // This is the regression `next build` caught: importing these three
    // constants from the server-only loader pulled it into the client bundle.
    // `tsc` and vitest both pass either way — only the build enforces it.
    expect(VIEW).toMatch(/^'use client'/)
    for (const value of ['AGENT_DETAIL_TABS', 'AGENT_DETAIL_TAB_LABELS', 'AGENT_DETAIL_TAB_UNAVAILABLE']) {
      expect(SHARED, value).toContain(`export const ${value}`)
    }
    const runtimeImport = VIEW.slice(VIEW.indexOf('import {'), VIEW.indexOf('import type'))
    expect(runtimeImport).toContain("from '@/lib/os/agent-detail-shared'")
    // The only thing it may take from the server-only module is a type.
    expect(VIEW).toMatch(/import type \{ AgentDetailModel \} from '@\/lib\/os\/agent-detail'/)
    expect(VIEW).not.toMatch(/^import \{[^}]*\} from '@\/lib\/os\/agent-detail'/m)
  })

  it('the loader does not re-export the contract', () => {
    // A re-export would let a client component reach those constants THROUGH
    // the server-only module and reintroduce the exact failure.
    expect(LOADER).not.toMatch(/export \{[^}]*AGENT_DETAIL_TAB/)
    expect(LOADER).not.toMatch(/export \* from '@\/lib\/os\/agent-detail-shared'/)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// The editor
// ─────────────────────────────────────────────────────────────────────────────

describe('agent detail · the editor is preserved, not replaced', () => {
  it('there is exactly one agent editor in the codebase', () => {
    // Both routes render the same component; neither reimplements the form.
    expect(PAGE).toContain("import EditAgentClient from './EditAgentClient'")
    expect(EDIT_PAGE).toContain("import EditAgentClient from '../EditAgentClient'")
    expect(codeOnly(VIEW)).not.toContain('EditAgentClient')
  })

  it('the detail surface performs no mutation', () => {
    const code = codeOnly(VIEW) + codeOnly(LOADER)
    for (const mutation of ['.update(', '.insert(', '.delete(', '.upsert(']) {
      expect(code, mutation).not.toContain(mutation)
    }
  })

  it('the editor still owns the mutation it always did', () => {
    expect(EDITOR).toContain('handleSubmit')
    expect(EDITOR).toContain('handleDelete')
  })

  it('the edit action is reachable from the detail header', () => {
    expect(VIEW).toContain('href={editHref}')
    expect(VIEW).toMatch(/Redigera agent/)
    expect(PAGE).toMatch(/editHref=\{`\/projects\/\$\{params\.slug\}\/agents\/\$\{params\.id\}\/edit`\}/)
  })

  it('the edit route keeps the same scoping guard', () => {
    expect(EDIT_PAGE).toContain('getProjectBySlug(params.slug)')
    expect(EDIT_PAGE).toContain("eq('project_id', project.id)")
    expect(EDIT_PAGE).toContain('notFound()')
  })

  it('legacy still lands on the editor, exactly as before', () => {
    expect(PAGE).toContain('isVNext(generation)')
    const legacyBranch = PAGE.slice(PAGE.indexOf('if (!isVNext(generation))'), PAGE.indexOf('const model'))
    expect(legacyBranch).toContain('<EditAgentClient')
    expect(legacyBranch).not.toContain('<AgentDetail')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Routing
// ─────────────────────────────────────────────────────────────────────────────

describe('agent detail · routing', () => {
  it('Organisation links resolve into this route', () => {
    // Organisation builds `<project route>/agents/<id>`, which is this page.
    expect(ORGANISATION).toContain('`${href}/agents/${agent.id}`')
    expect(resolveDestination('project_home', { project: 'trading' })?.href).toBe('/projects/trading')
  })

  it('introduces no second agent route model', () => {
    // `edit` is a child of the agent, not a parallel taxonomy.
    const code = codeOnly(LOADER) + codeOnly(VIEW)
    expect(code).not.toMatch(/['"`]\/agents\//)
  })

  it('breadcrumbs use the existing shared builder', () => {
    const trail = buildBreadcrumbs('/projects/trading/agents/a1b2c3d4-1111-4111-8111-111111111111', {
      projects: [{ slug: 'trading', name: 'Trading' }],
    })
    expect(trail.map((c) => c.label))
      .toEqual(['Omnira', 'Projekt', 'Trading', 'Agenter', 'a1b2c3d4…'])
    expect(trail.at(-1)!.current).toBe(true)
  })

  it('the edit sub-route reads as a child of the agent', () => {
    const trail = buildBreadcrumbs('/projects/trading/agents/a1b2c3d4-1111-4111-8111-111111111111/edit', {
      projects: [{ slug: 'trading', name: 'Trading' }],
    })
    expect(trail.map((c) => c.label).at(-1)).toBe('Redigera')
    expect(trail.map((c) => c.label).at(-2)).toBe('a1b2c3d4…')
  })

  it('advertises no shortcut it does not have', () => {
    expect(keyboardHintsFor('/projects/trading/agents/a1').map((h) => h.keys.join('+')))
      .toEqual(['⌘+K', 'Alt+Space'])
  })

  it('adds no keyboard owner and no return marker', () => {
    const code = codeOnly(VIEW)
    expect(code).not.toMatch(/addEventListener\(\s*['"]key/)
    expect(code).not.toContain('KeyboardEvent')
    expect(code).not.toContain('markAtlasProjectRailOpen')
    expect(code).not.toContain('router.back')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// UX
// ─────────────────────────────────────────────────────────────────────────────

describe('agent detail · presentation', () => {
  it('uses a real tablist with native buttons', () => {
    expect(VIEW).toContain('role="tablist"')
    expect(VIEW).toContain('role="tab"')
    expect(VIEW).toContain('role="tabpanel"')
    expect(VIEW).toContain('aria-selected={active === tab}')
    expect(VIEW).toContain('aria-controls=')
    expect(VIEW).toContain('type="button"')
  })

  it('keeps focus visible on tabs, the panel and the edit action', () => {
    expect(VIEW_CSS).toMatch(/\.tab:focus-visible[\s\S]{0,120}outline:/)
    expect(VIEW_CSS).toContain('.panel:focus-visible')
  })

  it('unavailable panels are announced as notes, not errors', () => {
    expect(VIEW).toContain('role="note"')
  })

  it('honours the resolved motion signal', () => {
    expect(VIEW_CSS).toContain('@media (prefers-reduced-motion: reduce)')
    expect(VIEW_CSS).toContain(":where(html:not([data-motion='full']))")
    const block = VIEW_CSS.slice(VIEW_CSS.indexOf('@media (prefers-reduced-motion: reduce)'))
    expect(block).toMatch(/animation: none/)
    // Nothing is hidden under reduced motion — no state was carried by movement.
    expect(block).not.toMatch(/display:\s*none/)
  })

  it('scales with the display preference and never uses zoom', () => {
    expect(VIEW_CSS).not.toMatch(/^\s*zoom:/m)
    expect(VIEW_CSS).not.toMatch(/font-size:\s*[0-9.]+px/)
    expect(VIEW_CSS).toMatch(/font-size: [0-9.]+rem/)
  })

  it('cannot overflow the page, and the tab strip scrolls instead of wrapping', () => {
    expect(VIEW_CSS).toContain('overflow-x: hidden')
    expect(VIEW_CSS).toMatch(/\.tabs \{[\s\S]{0,400}overflow-x: auto/)
    expect(VIEW_CSS).toMatch(/@media \(max-width: 640px\)/)
  })

  it('keeps the agent subordinate to the project in the header', () => {
    // The project is named above the agent, so this reads as a level in the
    // hierarchy rather than a standalone profile page.
    expect(VIEW.indexOf('styles.context')).toBeLessThan(VIEW.indexOf('styles.name'))
    expect(VIEW).toContain('project.href')
  })
})
