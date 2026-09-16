/**
 * vNext Phase 18 T1 — Intelligence Graph (`/intelligence/graph`).
 *
 * Four risks carry this slice, and the suite is organised around them:
 *
 *   1. SAYING MORE THAN THE SOURCE SUPPORTS. The builder labels every runtime
 *      edge DERIVED, calls a current definition DELEGATED_TO and a
 *      `runs.workflow_id` column STARTED. The vNext surface words and draws each
 *      relation by what the builder actually reads — so the builder lines those
 *      words rest on are pinned here, and a class can be lowered by the payload
 *      but never raised.
 *   2. CLAIMING LIVENESS. Live Operations is a snapshot. It carries the server's
 *      `generatedAt`, refreshes only when the operator asks, and nothing in the
 *      graph code polls.
 *   3. LOSING THE ROLLBACK. `?ui=legacy` must render the page that shipped —
 *      pinned by hash: the page body, the client markup, the inspector file,
 *      and four canvas renders byte-for-byte against origin/main 430259e.
 *   4. BREAKING THE SHELL. The vNext page sits in the vNext chrome (breadcrumbs,
 *      hint bar, mobile header), not the legacy CommandBar the old height assumed.
 */
import React, { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { IntelligenceGraphEdge, IntelligenceGraphNode } from '@/lib/intelligence/graph-contract'
import { GraphCanvas } from '@/components/platform/intelligence/GraphCanvas'
import { NodeInspector } from '@/components/platform/intelligence/NodeInspector'
import { getEdgeVisual } from '@/components/platform/intelligence/graph-visuals'
import { buildGraphBreadcrumbs, computeGraphFilterState } from '@/components/platform/intelligence/graph-navigation'
import type { useIntelligenceGraph } from '@/components/platform/intelligence/useIntelligenceGraph'
import { DEFAULT_WINDOW } from '@/lib/intelligence/operations-graph'
import {
  KIND_ORDER,
  OPERATIONS_RUN_CAP,
  RELATION_TRUTH_COPY,
  RELATION_TRUTH_STROKE,
  RUNTIME_SOURCE_TABLE,
  ZOOM_LEVEL_LABELS,
  graphLocation,
  kindCountLabel,
  kindFilterLabel,
  nodeProvenance,
  nodeStatus,
  operatorLabel,
  relationLegend,
  relationTruth,
  relationWording,
  runtimeDestination,
  snapshotCounts,
  snapshotStamp,
} from '@/lib/os/intelligence-graph-shared'
import {
  OPERATIONS_FIXTURE_EDGES,
  OPERATIONS_FIXTURE_NODES,
  OPERATIONS_FIXTURE_PAYLOAD,
  SYSTEM_FIXTURE_EDGES,
  SYSTEM_FIXTURE_NODES,
  SYSTEM_FIXTURE_PAYLOAD,
  SYSTEM_UNAVAILABLE_PAYLOAD,
} from './intelligence-graph-fixture'

// The app compiles JSX with the automatic runtime; vitest's transform uses the
// classic one, so components rendered here need `React` in scope.
;(globalThis as unknown as { React: typeof React }).React = React

type GraphState = ReturnType<typeof useIntelligenceGraph>

const mocks = vi.hoisted(() => ({ graph: { current: null as unknown }, cookie: { current: null as string | null } }))

vi.mock('@/components/platform/intelligence/useIntelligenceGraph', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/components/platform/intelligence/useIntelligenceGraph')>()
  return { ...actual, useIntelligenceGraph: () => mocks.graph.current }
})

vi.mock('next/headers', () => ({
  cookies: () => ({ get: (name: string) => (name === 'omnira_ui' && mocks.cookie.current !== null ? { value: mocks.cookie.current } : undefined) }),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {}, refresh: () => {} }),
  usePathname: () => '/intelligence/graph',
  useSearchParams: () => new URLSearchParams(),
}))

const WEB_ROOT = resolve(__dirname, '../..')
const read = (rel: string) => readFileSync(resolve(WEB_ROOT, rel), 'utf8')
const sha = (text: string) => createHash('sha256').update(text).digest('hex')
/** Executable source only — comments may name what the code must not do. */
const codeOnly = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim()
const noop = () => {}

const HOOK = read('components/platform/intelligence/useIntelligenceGraph.ts')
const VNEXT = read('components/platform/vnext/IntelligenceGraphVNext.tsx')
const INSPECTOR = read('components/platform/vnext/IntelligenceGraphInspector.tsx')
const SHARED = read('lib/os/intelligence-graph-shared.ts')
const CSS = read('components/platform/vnext/IntelligenceGraphVNext.module.css')
const CANVAS = read('components/platform/intelligence/GraphCanvas.tsx')
const BUILDER = read('lib/intelligence/operations-graph.ts')

function node(id: string): IntelligenceGraphNode {
  const found = [...OPERATIONS_FIXTURE_NODES, ...SYSTEM_FIXTURE_NODES].find((candidate) => candidate.id === id)
  if (!found) throw new Error(`fixture node ${id} missing`)
  return found
}

function edge(relation: string, extra: Partial<IntelligenceGraphEdge> = {}): IntelligenceGraphEdge {
  return { id: `${relation}:x`, source: 'a', target: 'b', relation: relation as IntelligenceGraphEdge['relation'], metadata: {}, ...extra }
}

/** A hook state shaped exactly like `useIntelligenceGraph` returns, derived from a payload. */
function graphState(over: Partial<GraphState> & { data?: GraphState['data'] } = {}): GraphState {
  const data = over.data === undefined ? (OPERATIONS_FIXTURE_PAYLOAD as GraphState['data']) : over.data
  const nodes = data?.nodes ?? []
  const edges = data?.edges ?? []
  const selected = over.selected ?? null
  const selectedEdges = selected ? edges.filter((e) => e.source === selected.id || e.target === selected.id) : []
  const neighborIds = new Set(selectedEdges.flatMap((e) => [e.source, e.target]))
  const mode = over.mode ?? 'operations'
  const base: GraphState = {
    cameraRef: { current: { x: 0, y: 0, w: 1200, h: 800 } },
    navigationHistory: { current: [] },
    mode,
    communityId: null,
    projectFilter: 'all',
    setProjectFilter: noop,
    hours: 24,
    setHours: noop,
    statusFilter: new Set(),
    setStatusFilter: noop,
    data,
    loading: false,
    error: null,
    selected,
    setSelected: noop,
    fitSignal: 0,
    setFitSignal: noop,
    kindFilter: new Set(),
    setKindFilter: noop,
    relationFilter: new Set(),
    setRelationFilter: noop,
    drillScope: null,
    isolateScope: null,
    cameraCommand: null,
    setCameraCommand: noop,
    zoomLevel: 'portfolio',
    setZoomLevel: noop,
    searchResultId: null,
    setSearchResultId: noop,
    query: '',
    setQuery: noop,
    searchPending: false,
    nodes,
    edges,
    filterState: computeGraphFilterState(nodes, { kinds: new Set(), statuses: new Set() }),
    dimmedIds: new Set(),
    dimmedEdgeIds: new Set(),
    filtersActive: false,
    visibleHits: [],
    presentKinds: [...new Set(nodes.map((n) => n.kind))],
    presentRelations: [...new Set(edges.map((e) => e.relation))],
    selectedEdges,
    neighborNodes: nodes.filter((n) => neighborIds.has(n.id)),
    drillIn: noop,
    isolateNode: noop,
    exitIsolate: noop,
    goBack: noop,
    openSearchHit: noop,
    clearFilters: noop,
    resetView: noop,
    resetAll: noop,
    handleEscape: noop,
    switchMode: noop,
    refresh: noop,
    breadcrumbs: buildGraphBreadcrumbs(mode === 'operations' ? 'operations' : 'system', null, null, null),
    unavailable: data ? data.available === false : null,
  }
  return { ...base, ...over, data }
}

async function renderVNext(state: GraphState): Promise<string> {
  mocks.graph.current = state
  const { IntelligenceGraphVNext } = await import('@/components/platform/vnext/IntelligenceGraphVNext')
  return renderToStaticMarkup(createElement(IntelligenceGraphVNext))
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. The rollback is the page that shipped
// ─────────────────────────────────────────────────────────────────────────────

function legacyCanvas(props: Record<string, unknown>): string {
  return renderToStaticMarkup(createElement(GraphCanvas as never, { onSelect: () => {}, ...props }))
}

const LEGACY_CANVAS_RENDERS: Record<string, { props: Record<string, unknown>; hash: string }> = {
  'operations-portfolio': {
    props: { nodes: OPERATIONS_FIXTURE_NODES, edges: OPERATIONS_FIXTURE_EDGES, selectedId: null, mode: 'operations' },
    hash: 'ffa43ab30ef902dd8e23934dfdcec6c51d8937986bce254bf167a787bca1ba3e',
  },
  'operations-selected-sheet': {
    props: { nodes: OPERATIONS_FIXTURE_NODES, edges: OPERATIONS_FIXTURE_EDGES, selectedId: 'run:r2', mode: 'operations', inspectorOpen: true, semanticContext: 'detail' },
    hash: '7a93740daa37ee7b4e6c9cff94229db5716e0d0938a45a02142f9dd2c01306f8',
  },
  'operations-isolated': {
    props: { nodes: OPERATIONS_FIXTURE_NODES, edges: OPERATIONS_FIXTURE_EDGES, selectedId: 'workflow:w1', mode: 'operations', isolatedIds: new Set(['workflow:w1', 'run:r1', 'run:r2', 'run:r4', 'agent:a1', 'agent:a2']) },
    hash: '8e8fef004f83cde31e2d69ca377646c7cfdc1de1b3778f05e3f96c2779ea8bb2',
  },
  'system-detail': {
    props: { nodes: SYSTEM_FIXTURE_NODES, edges: SYSTEM_FIXTURE_EDGES, selectedId: null, mode: 'system', semanticContext: 'detail' },
    hash: 'bc7776a43113bfe936ad0f3f805c8bf1cdf6d6007164c5715f96c1d18c12a1e0',
  },
}

describe('phase 18 · the legacy rollback is the page that shipped', () => {
  it('renders the legacy canvas byte-identically to origin/main 430259e', () => {
    for (const [name, { props, hash }] of Object.entries(LEGACY_CANVAS_RENDERS)) {
      expect(sha(legacyCanvas(props)), name).toBe(hash)
    }
  })

  it('keeps the legacy client markup byte-identical', () => {
    const client = read('components/platform/intelligence/IntelligenceGraphClient.tsx')
    const block = client.slice(client.indexOf('  return (\n    <div\n      ref={rootRef}'))
    expect(sha(block)).toBe('d4115d02711acc3d766351803a6decc32aea12b118fd5b4918be6f66062e39ec')
  })

  it('moves the previous page body verbatim into IntelligenceGraphLegacy', () => {
    const legacy = read('app/(platform)/intelligence/graph/IntelligenceGraphLegacy.tsx')
    const start = legacy.indexOf('    <div className="flex h-[calc(100vh-4rem)]')
    const end = legacy.indexOf('\n    </div>\n', start) + '\n    </div>\n'.length
    expect(start).toBeGreaterThan(0)
    expect(sha(legacy.slice(start, end))).toBe('2a99711985382448699a31252a7544c1a246d60c597c84cd5d80dd86d9cd0356')
  })

  it('leaves the legacy inspector file untouched', () => {
    expect(sha(read('components/platform/intelligence/NodeInspector.tsx')))
      .toBe('5ed411a3b4f59235fa1609514d47bfb7e08798846faf0aae8adba8ce81ca881a')
  })

  it('never shows the vNext snapshot vocabulary in legacy', () => {
    const client = read('components/platform/intelligence/IntelligenceGraphClient.tsx')
    expect(client).not.toContain('refresh')
    expect(client).not.toContain('Ögonblicksbild')
    expect(client).not.toContain("appearance=")
    expect(client).not.toContain('edgeVisual')
  })

  it('gives legacy and vNext ONE navigation implementation', () => {
    const client = read('components/platform/intelligence/IntelligenceGraphClient.tsx')
    for (const src of [client, VNEXT]) {
      expect(src).toContain('useIntelligenceGraph()')
      // No second copy of the fetch, URL or drilldown logic in either surface.
      expect(codeOnly(src)).not.toMatch(/\bfetch\(/)
      expect(src).not.toContain('replaceState')
      expect(src).not.toContain('buildDrilldownScope')
    }
  })
})

describe('phase 18 · the page picks a generation and nothing else', () => {
  beforeEach(() => { mocks.cookie.current = null; mocks.graph.current = graphState() })

  it('renders vNext by default and legacy on the rollback cookie', async () => {
    const { default: IntelligenceGraphPage } = await import('@/app/(platform)/intelligence/graph/page')
    const { IntelligenceGraphVNext } = await import('@/components/platform/vnext/IntelligenceGraphVNext')
    const { IntelligenceGraphLegacy } = await import('@/app/(platform)/intelligence/graph/IntelligenceGraphLegacy')

    const vnext = await IntelligenceGraphPage()
    expect(vnext.type).toBe(IntelligenceGraphVNext)

    mocks.cookie.current = 'legacy'
    const legacy = await IntelligenceGraphPage()
    expect(legacy.type).toBe(IntelligenceGraphLegacy)
  })

  it('keeps the page free of data access and keeps its metadata', () => {
    const page = read('app/(platform)/intelligence/graph/page.tsx')
    expect(codeOnly(page)).not.toMatch(/createClient|createAdminClient|\bfetch\(|supabase/)
    expect(page).toContain("title: 'Intelligence Graph · Omnira'")
    expect(page).toContain('resolveUiGeneration')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 1. Relations are never said with more certainty than their source
// ─────────────────────────────────────────────────────────────────────────────

describe('phase 18 · relation truth', () => {
  it('classifies the runtime relations by the column the builder reads', () => {
    for (const relation of ['CONTAINS', 'STARTED', 'PRODUCED', 'REQUESTED_APPROVAL', 'TRACKS']) {
      expect(relationTruth(edge(relation, { confidence: 'DERIVED' })), relation).toBe('direct')
    }
    expect(relationTruth(edge('DELEGATED_TO', { confidence: 'DERIVED' }))).toBe('definition')
  })

  it('never raises a class: INFERRED and bundles stay derived whatever the relation', () => {
    for (const relation of ['CONTAINS', 'STARTED', 'DELEGATED_TO', 'imports_from', 'calls']) {
      expect(relationTruth(edge(relation, { confidence: 'INFERRED' })), relation).toBe('derived')
      expect(relationTruth(edge(relation, { confidence: 'EXTRACTED', metadata: { bundledEdges: 3 } })), relation).toBe('derived')
    }
  })

  it('treats an unknown or unlabelled relation as derived', () => {
    expect(relationTruth(edge('SUPERVISES'))).toBe('derived')
    expect(relationTruth(edge('references', { confidence: 'DERIVED' }))).toBe('derived')
    expect(relationTruth(edge('imports'))).toBe('derived')
    expect(relationTruth(edge('imports', { confidence: 'EXTRACTED' }))).toBe('direct')
  })

  it('rests each class on a builder line that still says what it did', () => {
    // CONTAINS — the agent's and workflow's own project_id column.
    expect(BUILDER).toMatch(/source: `project:\$\{a\.project_id\}`, target: `agent:\$\{a\.id\}`,\s*relation: 'CONTAINS'/)
    expect(BUILDER).toMatch(/source: `project:\$\{w\.project_id\}`, target: `workflow:\$\{w\.id\}`,\s*relation: 'CONTAINS'/)
    // DELEGATED_TO — the CURRENT steps JSON, not a stored link.
    expect(BUILDER).toContain('const steps = parseWorkflowSteps(w.steps)')
    expect(BUILDER).toMatch(/source: `workflow:\$\{w\.id\}`, target: `agent:\$\{step\.agent_id\}`,\s*relation: 'DELEGATED_TO'/)
    // STARTED — runs.workflow_id, only when the column is set.
    expect(BUILDER).toMatch(/if \(r\.workflow_id\) \{\s*addEdge\(\{[\s\S]{0,160}relation: 'STARTED'/)
    // PRODUCED / REQUESTED_APPROVAL — the child row's run_id.
    expect(BUILDER).toMatch(/source: `run:\$\{o\.run_id\}`, target: `output:\$\{o\.id\}`,\s*relation: 'PRODUCED'/)
    expect(BUILDER).toMatch(/source: `run:\$\{ap\.run_id\}`, target: `approval:\$\{ap\.id\}`,\s*relation: 'REQUESTED_APPROVAL'/)
    // TRACKS — manager_tasks.run_id or workflow_id.
    expect(BUILDER).toContain("const target = t.run_id ? `run:${t.run_id}` : t.workflow_id ? `workflow:${t.workflow_id}` : null")
  })

  it('knows every relation the builder emits, and no other runtime relation', () => {
    const emitted = new Set([...BUILDER.matchAll(/relation: '([A-Z_]+)'/g)].map((match) => match[1]))
    expect([...emitted].sort()).toEqual(['CONTAINS', 'DELEGATED_TO', 'PRODUCED', 'REQUESTED_APPROVAL', 'STARTED', 'TRACKS'])
    for (const relation of emitted) expect(relationTruth(edge(relation)), relation).not.toBe('derived')
  })

  it('rests the static classes on the importer and the overview bundler', () => {
    expect(read('lib/intelligence/graphify-import.ts')).toContain("confidence: raw.confidence === 'EXTRACTED' ? 'EXTRACTED' : 'INFERRED',")
    expect(read('lib/intelligence/system-graph.ts')).toContain('metadata: { bundledEdges: count },')
  })

  it('words runtime relations after the column, never as an act', () => {
    for (const relation of ['CONTAINS', 'DELEGATED_TO', 'STARTED', 'PRODUCED', 'REQUESTED_APPROVAL', 'TRACKS']) {
      const wording = relationWording(edge(relation))
      const words = `${wording.name} ${wording.forward} ${wording.backward}`.toLowerCase()
      expect(words, relation).not.toMatch(/delegera|startade|started|delegated|approved|godkände/)
    }
    expect(relationWording(edge('STARTED')).backward).toBe('körning av')
    expect(relationWording(edge('DELEGATED_TO')).forward).toContain('nuvarande')
    expect(relationWording(edge('references', { metadata: { bundledEdges: 4 } })).name).toBe('Kodkopplingar mellan grupper')
    expect(relationWording(edge('SUPERVISES')).name).toBe('SUPERVISES')
  })

  it('describes only the classes the payload contains, most certain first', () => {
    expect(relationLegend(OPERATIONS_FIXTURE_EDGES).map((entry) => entry.truth)).toEqual(['direct', 'definition'])
    expect(relationLegend(SYSTEM_FIXTURE_EDGES).map((entry) => entry.truth)).toEqual(['direct', 'derived'])
    expect(relationLegend([])).toEqual([])
    const [direct] = relationLegend(OPERATIONS_FIXTURE_EDGES)
    expect(direct.relations).toContain('Körning av workflow')
    expect(RELATION_TRUTH_COPY.definition.description).toContain('inte vad som faktiskt kördes')
  })

  it('draws the class with line style only, over the relation visual', async () => {
    const { truthEdgeVisual } = await import('@/components/platform/vnext/IntelligenceGraphVNext')
    for (const value of OPERATIONS_FIXTURE_EDGES) {
      const base = getEdgeVisual(value)
      const drawn = truthEdgeVisual(value, base)
      const stroke = RELATION_TRUTH_STROKE[relationTruth(value)]
      expect(drawn.dash, value.id).toBe(stroke.dash)
      expect(drawn.stroke, value.id).toBe(base.stroke)
      expect(drawn.width, value.id).toBe(base.width)
      expect(drawn.opacity, value.id).toBeCloseTo(base.opacity * stroke.opacityScale)
    }
    const inferred = SYSTEM_FIXTURE_EDGES.find((value) => value.confidence === 'INFERRED')!
    expect(truthEdgeVisual(inferred, getEdgeVisual(inferred)).dash).toBe(RELATION_TRUTH_STROKE.derived.dash)
    // The three classes are distinguishable without colour.
    expect(new Set(Object.values(RELATION_TRUTH_STROKE).map((stroke) => stroke.dash ?? 'solid')).size).toBe(3)
  })

  it('the canvas renders what edgeVisual returns, and legacy passes none', () => {
    const marked = renderToStaticMarkup(createElement(GraphCanvas as never, {
      onSelect: () => {}, nodes: OPERATIONS_FIXTURE_NODES, edges: OPERATIONS_FIXTURE_EDGES, selectedId: 'workflow:w1',
      mode: 'operations', semanticContext: 'detail', edgeVisual: (_edge: unknown, visual: object) => ({ ...visual, dash: '9 9' }),
    }))
    expect(marked).toContain('stroke-dasharray="9 9"')
    expect(CANVAS).toContain('const visual = edgeVisual ? edgeVisual(edgeValue, getEdgeVisual(edgeValue)) : getEdgeVisual(edgeValue)')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 2. A snapshot, named as one
// ─────────────────────────────────────────────────────────────────────────────

describe('phase 18 · snapshot vocabulary', () => {
  it('stamps Live Operations with the server generatedAt', () => {
    const stamp = snapshotStamp('operations', OPERATIONS_FIXTURE_PAYLOAD.meta, 'UTC')
    expect(stamp.label).toBe('Ögonblicksbild · hämtad 09:12')
    expect(stamp.detail).toContain('2026')
    expect(snapshotStamp('operations', undefined, 'UTC').label).toBe('Ögonblicksbild · hämtningstid okänd')
    expect(snapshotStamp('operations', { ...OPERATIONS_FIXTURE_PAYLOAD.meta, generatedAt: 'nonsense' }, 'UTC').label)
      .toBe('Ögonblicksbild · hämtningstid okänd')
  })

  it('never says a static artifact was fetched, and drops the importer epoch', () => {
    const stamp = snapshotStamp('system', SYSTEM_FIXTURE_PAYLOAD.meta, 'UTC')
    expect(stamp.label).toBe('Statisk kodkarta · commit 430259e6be · genererad 10 sep. 2026')
    expect(stamp.label).not.toContain('hämtad')
    const epoch = snapshotStamp('system', { ...SYSTEM_FIXTURE_PAYLOAD.meta, generatedAt: new Date(0).toISOString() }, 'UTC')
    expect(epoch.label).toBe('Statisk kodkarta · commit 430259e6be')
    expect(epoch.detail).toBeNull()
  })

  it('counts the payload, names statuses as words, and reports the run cap', () => {
    const counts = snapshotCounts(OPERATIONS_FIXTURE_NODES)
    expect(counts.items.map((item) => `${item.value} ${item.noun}`)).toEqual([
      '2 projekt', '3 agenter', '2 workflows', '4 körningar', '2 granskningar', '1 utdata', '1 uppgift',
    ])
    const runs = counts.items.find((item) => item.kind === 'run')!
    expect(runs.breakdown.map((entry) => `${entry.value} ${entry.label}`)).toEqual(['1 kör', '1 misslyckades', '1 inväntar granskning'])
    expect(counts.items.find((item) => item.kind === 'approval')!.breakdown.map((entry) => entry.label)).toEqual(['väntar på granskning'])
    expect(counts.runCapReached).toBe(false)

    const capped = Array.from({ length: OPERATIONS_RUN_CAP }, (_, index) => ({ ...node('run:r1'), id: `run:cap-${index}` }))
    expect(snapshotCounts(capped).runCapReached).toBe(true)
    expect(snapshotCounts(capped.slice(1)).runCapReached).toBe(false)
  })

  it('pins the cap to the builder window the route passes', () => {
    expect(OPERATIONS_RUN_CAP).toBe(DEFAULT_WINDOW.maxRuns)
    expect(read('app/api/intelligence/graph/operations/route.ts')).toContain('window: { hours, maxRuns: DEFAULT_WINDOW.maxRuns }')
  })

  it('orders and words every kind the contract knows', () => {
    expect(KIND_ORDER).toHaveLength(11)
    expect(kindCountLabel('run', 1)).toBe('1 körning')
    expect(kindCountLabel('run', 2)).toBe('2 körningar')
    expect(kindFilterLabel('task')).toBe('Uppgifter')
    expect(kindCountLabel('mystery', 2)).toBe('2 mystery')
  })

  it('uses the shared status vocabulary and never folds an unknown status into a known one', () => {
    expect(nodeStatus(node('run:r2'))).toMatchObject({ label: 'Misslyckades', tone: 'failed', unknown: false })
    expect(nodeStatus(node('run:r4'))).toMatchObject({ label: 'Kör', tone: 'running' })
    expect(nodeStatus({ kind: 'run', status: 'pending' })).toMatchObject({ unknown: true, raw: 'pending' })
    expect(nodeStatus(node('approval:ap1'))).toMatchObject({ label: 'Väntar på granskning', tone: 'approval' })
    expect(nodeStatus({ kind: 'approval', status: 'teleported' })).toMatchObject({ label: 'Okänd status', unknown: true })
    expect(nodeStatus(node('workflow:w2'))).toMatchObject({ label: 'Inaktiv' })
    expect(nodeStatus(node('project:11111111-1111-4111-8111-111111111111'))).toBeNull()
  })

  it('says "Godkänd av" only for an approved row', () => {
    expect(operatorLabel({ kind: 'approval', status: 'approved' })).toBe('Godkänd av')
    for (const status of ['pending', 'rejected', 'returned', 'revised', 'needs_input']) {
      expect(operatorLabel({ kind: 'approval', status }), status).toBe('Operatör')
    }
  })

  it('names the source table the builder read each runtime node from', () => {
    for (const [kind, table] of Object.entries(RUNTIME_SOURCE_TABLE)) {
      expect(BUILDER, kind).toContain(`db.from('${table}')`)
    }
    expect(nodeProvenance(node('run:r2'), OPERATIONS_FIXTURE_PAYLOAD.meta)).toEqual({ source: 'Omnira-databasen', detail: 'tabellen runs' })
    expect(nodeProvenance(node('task:t1'), OPERATIONS_FIXTURE_PAYLOAD.meta).detail).toBe('tabellen manager_tasks')
    expect(nodeProvenance(node('c:lib/intelligence/graph-contract.ts'), SYSTEM_FIXTURE_PAYLOAD.meta))
      .toEqual({ source: 'Graphify-artefakt', detail: 'apps/web/lib/intelligence/graph-contract.ts:L1 · commit 430259e6be' })
  })

  it('links runtime nodes exactly where the legacy inspector does', () => {
    for (const value of OPERATIONS_FIXTURE_NODES) {
      const legacy = renderToStaticMarkup(createElement(NodeInspector, {
        node: value, edges: [], neighbors: [], onClose: () => {}, onSelectNeighbor: () => {},
      }))
      const legacyHref = legacy.match(/<a[^>]*href="([^"]+)"/)?.[1] ?? null
      expect(runtimeDestination(value)?.href ?? null, value.id).toBe(legacyHref)
    }
  })

  it('names the place in the graph and the zoom level in Swedish', () => {
    expect(graphLocation('system', 3, 'graph-contract.ts', null)).toEqual(['Översikt', 'Subsystem 3', 'graph-contract.ts'])
    expect(graphLocation('operations', 3, null, 'Daglig artikel')).toEqual(['Översikt', 'Isolerad: Daglig artikel'])
    expect(Object.keys(ZOOM_LEVEL_LABELS).sort()).toEqual(['detail', 'execution', 'operational', 'portfolio', 'project'])
    expect(read('components/platform/intelligence/graph-readability.ts'))
      .toContain("export type GraphZoomLevel = 'portfolio' | 'project' | 'operational' | 'detail' | 'execution'")
  })
})

describe('phase 18 · no polling, no realtime claim', () => {
  it('the hook has one timer — the search debounce — and refresh is an explicit nonce', () => {
    const code = codeOnly(HOOK)
    expect(code.match(/setTimeout\(/g) ?? []).toHaveLength(1)
    expect(code).toMatch(/const t = setTimeout\(\(\) => \{\s*fetch\(`\/api\/intelligence\/graph\/system\?q=/)
    expect(code).not.toMatch(/setInterval|EventSource|WebSocket|requestAnimationFrame|visibilitychange/)
    expect(code).toContain('}, [url, refreshNonce])')
    expect(code).toMatch(/const refresh = useCallback\(\(\) => \{\s*if \(!url \|\| loading\) return/)
  })

  it('reaches only the two authenticated GET routes', () => {
    const urls = [...codeOnly(HOOK).matchAll(/['`](\/api\/[^'`?$]+)/g)].map((match) => match[1])
    expect(new Set(urls)).toEqual(new Set(['/api/intelligence/graph/system', '/api/intelligence/graph/operations']))
    for (const src of [HOOK, VNEXT, INSPECTOR, SHARED]) {
      expect(codeOnly(src)).not.toMatch(/method:\s*['"](POST|PUT|PATCH|DELETE)/)
    }
    for (const src of [VNEXT, INSPECTOR, SHARED]) expect(codeOnly(src)).not.toMatch(/\bfetch\(/)
  })

  it('keeps refreshed selections only when the new payload still has them', () => {
    // A refresh is the SAME url with a new nonce; any other re-run is a new url
    // and must not inherit a waiting refresh intent.
    expect(HOOK).toContain('const isRefresh = refreshNonce !== handledRefreshNonce.current')
    expect(HOOK).toContain('handledRefreshNonce.current = refreshNonce')
    expect(HOOK).toContain('const intent = isRefresh ? refreshIntent.current : null')
    expect(HOOK).toMatch(/refreshIntent\.current = null\s*const controller = new AbortController\(\)/)
    // The intent resolves against the NEW payload — ids it no longer has are dropped.
    expect(HOOK).toMatch(/if \(intent\) \{[\s\S]{0,260}const resolved = resolveGraphNavigationIntent\(payload\.nodes \?\? \[\], payload\.edges \?\? \[\], intent\)\s*setSelected\(resolved\.selected\)\s*setDrillScope\(resolved\.drillScope\)\s*setIsolateScope\(resolved\.isolateScope\)\s*setSearchResultId\(null\)\s*return\s*\}/)
    expect(HOOK).toMatch(/refreshIntent\.current = \{\s*selectedId: selected\?\.id \?\? null,\s*drillId: drillScope\?\.rootId \?\? null,\s*isolateId: isolateScope\?\.rootId \?\? null,/)
  })

  it('makes no liveness claim in any vNext surface text', async () => {
    const html = text(await renderVNext(graphState()))
    expect(html).not.toMatch(/realtid|live-?data|live-?läge|strömmar|uppdateras löpande/i)
    // "Live" appears only inside the canonical product name.
    expect(html.match(/\blive\b/gi) ?? []).toHaveLength((html.match(/Live Operations/g) ?? []).length)
    expect(html).toContain('Uppdateras inte automatiskt.')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// The vNext surface over today's payloads
// ─────────────────────────────────────────────────────────────────────────────

describe('phase 18 · vNext surface', () => {
  it('shows the snapshot, its counts, the legend and the vNext canvas', async () => {
    const html = await renderVNext(graphState())
    const words = text(html)
    expect(words).toMatch(/Ögonblicksbild · hämtad \d{2}:\d{2}/)
    expect(html).toContain('data-testid="graph-refresh"')
    expect(html).not.toMatch(/data-testid="graph-refresh"[^>]*disabled/)
    expect(words).toContain('I denna ögonblicksbild')
    expect(words).toContain('4 körningar')
    expect(words).toContain('1 misslyckades')
    expect(words).toContain(`högst ${OPERATIONS_RUN_CAP} per hämtning`)
    expect(words).toContain('Granskningar, utdata och uppgifter visas bara när de hör till en av körningarna.')
    expect(html).not.toContain('data-testid="graph-run-cap"')
    expect(words).toContain('Direkt lagrad referens i databasen eller i koden')
    expect(words).toContain('Definition namngiven i en nuvarande definition')
    expect(words).not.toContain('Härledd')
    expect(html).toContain('data-appearance="vnext"')
    expect(html).toContain('aria-label="Zooma ut"')
    expect(html).toContain('aria-label="Zooma in"')
    expect(words).toContain('Anpassa')
    expect(words).toContain('Nivå: Portfölj')
  })

  it('draws definition relations dashed on the vNext canvas', async () => {
    const scope = { kind: 'workflow' as const, rootId: 'workflow:w1', label: 'Daglig artikel', nodeIds: new Set(['workflow:w1', 'agent:a1', 'agent:a2', 'run:r1', 'run:r2', 'run:r4']) }
    const html = await renderVNext(graphState({ selected: node('workflow:w1'), drillScope: scope }))
    const lineDashes = (markup: string) => [...markup.matchAll(/<line[^>]*stroke-dasharray="([^"]+)"/g)].map((match) => match[1])
    expect(lineDashes(html)).toContain(RELATION_TRUTH_STROKE.definition.dash)
    // Direct relations (the FK edges) are solid: the only line dashes are truth dashes.
    expect(new Set(lineDashes(html))).toEqual(new Set([RELATION_TRUTH_STROKE.definition.dash]))
    // Legacy draws the same payload with its relation dashes and no truth dash.
    const legacy = legacyCanvas({ nodes: OPERATIONS_FIXTURE_NODES, edges: OPERATIONS_FIXTURE_EDGES, selectedId: 'workflow:w1', mode: 'operations', semanticContext: 'detail' })
    expect(lineDashes(legacy)).not.toContain(RELATION_TRUTH_STROKE.definition.dash)
    expect(lineDashes(legacy)).toContain('5 3')
  })

  it('never reuses a status-ring dash for a relation line', () => {
    const visuals = read('components/platform/intelligence/graph-visuals.ts')
    const statusDashes = [...visuals.slice(visuals.indexOf('export function getStatusVisual'), visuals.indexOf('const EDGE_VISUALS'))
      .matchAll(/dash: '([^']+)'/g)].map((match) => match[1])
    expect(statusDashes.length).toBeGreaterThan(0)
    for (const stroke of Object.values(RELATION_TRUTH_STROKE)) {
      if (stroke.dash) expect(statusDashes).not.toContain(stroke.dash)
    }
  })

  it('keeps Execution Replay disabled and draws no Atlas node', async () => {
    const html = await renderVNext(graphState())
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Execution Replay<\/button>/)
    expect(text(html).match(/Atlas/g) ?? []).toHaveLength(1) // the eyebrow only
    expect(VNEXT).toContain('nodes={nodes}')
    expect(VNEXT).toContain('edges={edges}')
    expect(codeOnly(VNEXT + INSPECTOR + SHARED)).not.toMatch(/kind: ['"]atlas|atlas:|SUPERVISES|DIRECTS|READ_MEMORY|USES_SKILL/)
  })

  it('disables Uppdatera while a request is in flight', async () => {
    const html = await renderVNext(graphState({ loading: true }))
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*data-testid="graph-refresh"/)
    expect(text(html)).toContain('Uppdaterar…')
    expect(text(html)).toContain('Hämtar ögonblicksbild…')
  })

  it('says when the run cap was reached', async () => {
    const runs = Array.from({ length: OPERATIONS_RUN_CAP }, (_, index) => ({ ...node('run:r1'), id: `run:cap-${index}` }))
    const data = { ...OPERATIONS_FIXTURE_PAYLOAD, nodes: [...OPERATIONS_FIXTURE_NODES, ...runs] }
    const html = await renderVNext(graphState({ data: data as GraphState['data'] }))
    expect(html).toContain('data-testid="graph-run-cap"')
    expect(text(html)).toContain(`Taket på ${OPERATIONS_RUN_CAP} körningar nåddes — äldre körningar i fönstret kan saknas.`)
  })

  it('says when a window holds no runs', async () => {
    const nodes = OPERATIONS_FIXTURE_NODES.filter((value) => ['project', 'agent', 'workflow'].includes(value.kind))
    const html = await renderVNext(graphState({ data: { ...OPERATIONS_FIXTURE_PAYLOAD, nodes, edges: [] } as GraphState['data'] }))
    expect(text(html)).toContain('Inga körningar skapade de senaste 24 h.')
  })

  it('renders a failed request as a failure, with no counts, legend or canvas', async () => {
    const html = await renderVNext(graphState({ data: null, error: 'Grafen kunde inte hämtas (500).' }))
    const words = text(html)
    expect(words).toContain('Ögonblicksbild · hämtningen misslyckades')
    expect(words).toContain('Hämtningen misslyckades')
    expect(html).not.toContain('data-testid="graph-counts"')
    expect(html).not.toContain('data-testid="graph-legend"')
    expect(html).not.toContain('Live Operations snapshot graph')
  })

  it('keeps the honest System Map empty state when the artifact is missing', async () => {
    const html = await renderVNext(graphState({ mode: 'system', data: SYSTEM_UNAVAILABLE_PAYLOAD as GraphState['data'] }))
    const words = text(html)
    expect(words).toContain('Ingen System Map-artefakt ännu')
    expect(words).toContain('Grafen är inte trasig; Graphify-generering och leverans hanteras separat.')
    expect(html).not.toContain('data-testid="graph-stamp"')
    expect(html).not.toContain('data-testid="graph-refresh"')
    expect(html).not.toContain('data-testid="graph-counts"')
  })

  it('stamps, counts and explains nothing from the previous mode while a new one loads', async () => {
    const html = await renderVNext(graphState({ mode: 'system', loading: true }))
    expect(html).not.toContain('data-testid="graph-stamp"')
    expect(html).not.toContain('data-testid="graph-counts"')
    expect(html).not.toContain('data-testid="graph-legend"')
  })

  it('stamps a static artifact as a code map', async () => {
    const html = await renderVNext(graphState({ mode: 'system', data: SYSTEM_FIXTURE_PAYLOAD as GraphState['data'] }))
    expect(text(html)).toMatch(/Statisk kodkarta · commit 430259e6be · genererad \d+ sep\. 2026/)
    expect(text(html)).toContain('I den här vyn')
    expect(text(html)).toContain('Härledd')
  })

  it('inspects a run with provenance, status as stored, and its relations in words', async () => {
    const html = await renderVNext(graphState({ selected: node('run:r2') }))
    const words = text(html)
    expect(html).toContain('data-testid="graph-inspector"')
    expect(words).toContain('Status vid hämtning Misslyckades')
    expect(words).toContain('Källa Omnira-databasen · tabellen runs')
    expect(words).toContain('Lagrat fel Provider timeout')
    expect(words).toContain('körning av Daglig artikel Direkt')
    expect(words).toContain('har uppgiften Följ upp timeout Direkt')
    expect(html).toContain('href="/agent-activity"')
    expect(words).toContain('Fördjupa')
    expect(words).toContain('Isolera kedjan')
  })

  it('shows a definition relation as a definition, with its step', async () => {
    const html = await renderVNext(graphState({ selected: node('workflow:w1') }))
    const words = text(html)
    expect(words).toContain('nämner i nuvarande steg Skribent steg: Skriv utkast Definition')
    expect(words).toContain('har körningen Daglig artikel · r1000001 Direkt')
  })

  it('never borrows an approval decision', async () => {
    const approved = text(await renderVNext(graphState({ selected: node('approval:ap2') })))
    expect(approved).toContain('Godkänd av Andre')
    const pendingWithOperator = { ...node('approval:ap1'), metadata: { ...node('approval:ap1').metadata, operator: 'Andre' } }
    const pending = text(await renderVNext(graphState({ selected: pendingWithOperator })))
    expect(pending).toContain('Operatör Andre')
    expect(pending).not.toContain('Godkänd av')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Canvas additions are optional and legacy-neutral
// ─────────────────────────────────────────────────────────────────────────────

describe('phase 18 · canvas additions', () => {
  it('zoom commands share the keyboard step and are applied once per nonce', () => {
    expect(CANVAS).toContain("type: 'fit-graph' | 'fit-node' | 'fit-scope' | 'restore' | 'zoom-in' | 'zoom-out'")
    expect(CANVAS).toContain("if (event.key === '+' || event.key === '=') { event.preventDefault(); changeZoom(1 / ZOOM_STEP) }")
    expect(CANVAS).toContain("else if (event.key === '-') { event.preventDefault(); changeZoom(ZOOM_STEP) }")
    expect(CANVAS).toContain("const factor = cameraCommand.type === 'zoom-in' ? 1 / ZOOM_STEP : ZOOM_STEP")
    expect(CANVAS).toContain('const ZOOM_STEP = 1.16')
    expect(CANVAS).toContain('if (handledZoomNonceRef.current === cameraCommand.nonce) return')
    expect(CANVAS).toContain('handledZoomNonceRef.current = cameraCommand.nonce')
    // A command already in state at mount belongs to an earlier canvas.
    expect(CANVAS).toMatch(/useRef<number \| null>\(\s*cameraCommand && \(cameraCommand\.type === 'zoom-in' \|\| cameraCommand\.type === 'zoom-out'\) \? cameraCommand\.nonce : null,/)
    expect(VNEXT).toMatch(/zoomSequence\.current \+= 1\s*setCameraCommand\(\{ nonce: zoomSequence\.current, type \}\)/)
  })

  it('marks only a non-default appearance, so legacy markup cannot move', () => {
    expect(CANVAS).toContain("data-appearance={appearance === 'dark' ? undefined : appearance}")
    expect(read('components/platform/intelligence/graph-visuals.ts')).toContain("export type GraphAppearance = 'dark' | 'light' | 'vnext'")
    expect(read('components/platform/intelligence/GraphCanvas.module.css'))
      .toContain(".canvas[data-appearance='vnext'] .node:hover .identity {")
  })

  it('keeps cyan — the running status — off the vNext canvas ground and hover', () => {
    const visuals = read('components/platform/intelligence/graph-visuals.ts')
    const vnextTokens = visuals.slice(visuals.indexOf('    vnext: {'), visuals.indexOf('    },', visuals.indexOf('    vnext: {')))
    expect(vnextTokens).not.toMatch(/22d3ee|34,\s*211,\s*238|67e8f9/i)
    const canvasCss = read('components/platform/intelligence/GraphCanvas.module.css')
    const hover = canvasCss.slice(canvasCss.indexOf(".canvas[data-appearance='vnext']"))
    expect(hover.slice(0, hover.indexOf('}'))).not.toMatch(/34 211 238|22d3ee/i)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// 4. The vNext shell, scale and motion
// ─────────────────────────────────────────────────────────────────────────────

describe('phase 18 · layout, scale and motion', () => {
  it('fills the height the vNext shell leaves, not the legacy CommandBar height', () => {
    expect(CSS).toContain('min-height: calc(100dvh - var(--ig-shell-chrome));')
    expect(CSS).toContain('--ig-shell-chrome: calc(14px + 1.00625rem + 2.25rem);')
    expect(CSS).not.toMatch(/100vh\s*-\s*4rem/)
    // The chrome it subtracts is the chrome those components declare.
    expect(read('components/platform/os/Breadcrumbs.module.css')).toMatch(/\.nav \{\s*\/\*[^*]*\*\/\s*padding: 14px 28px 0;\s*font-size: 0\.71875rem;[^}]*line-height: 1\.4;/)
    const hints = read('components/platform/os/KeyboardHints.module.css')
    expect(hints).toContain('padding: 0.5rem 8.5rem 0.625rem 1.75rem;')
    expect(hints).toMatch(/\.cap \{[^}]*height: 1\.125rem;/)
    expect(read('components/platform/vnext/AtlasHomeVNext.module.css')).toContain('min-height: 62px;')
  })

  it('docks the inspector at the breakpoint and share the canvas reserves for it', () => {
    expect(CSS).toMatch(/@media \(max-width: 767px\) \{\s*\.inspectorDock \{[^}]*height: min\(48%, 24rem\);/)
    expect(CANVAS).toContain('const inspectorBottomInset = inspectorOpen && viewport.width < 768 ? view.h * 0.48 : 0')
    expect(CSS).toMatch(/\.inspectorDock \{\s*position: relative;\s*flex: none;\s*width: 20rem;/)
  })

  it('sizes type in rem so the display-scale preference reaches it', () => {
    expect(CSS.match(/font-size:\s*\d+(\.\d+)?px/g) ?? []).toEqual([])
    expect(CSS).toContain('font-family: var(--font-geist-sans), Inter, ui-sans-serif, system-ui, sans-serif;')
  })

  it('honours an explicit "full" motion override in every reduced-motion block', () => {
    const blocks = CSS.split('@media (prefers-reduced-motion: reduce)').slice(1)
    expect(blocks.length).toBeGreaterThan(0)
    for (const block of blocks) {
      const body = block.slice(0, block.indexOf('\n}'))
      const selectors = [...body.matchAll(/^\s{2,}([^\s@{][^{]*)\{/gm)].map((match) => match[1].trim())
      expect(selectors.length).toBeGreaterThan(0)
      for (const selector of selectors) {
        for (const part of selector.split(',')) expect(part.trim()).toMatch(/^:where\(html:not\(\[data-motion='full'\]\)\) /)
      }
    }
    // Nothing on this surface animates; transitions are the only motion.
    expect(CSS).not.toMatch(/animation:|@keyframes/)
  })

  it('never imports the design references', () => {
    for (const src of [VNEXT, INSPECTOR, SHARED, CSS, HOOK]) {
      expect(src).not.toMatch(/design\/references|refs\/|Omnira OS\.dc/)
    }
  })
})
