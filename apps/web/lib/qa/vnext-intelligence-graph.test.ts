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
import { fitGraphBounds, fitNodeIds, preserveSelectedNeighborhoodCamera, reservedCanvasBoxes } from '@/components/platform/intelligence/graph-readability'
import type { useIntelligenceGraph } from '@/components/platform/intelligence/useIntelligenceGraph'
import { DEFAULT_WINDOW } from '@/lib/intelligence/operations-graph'
import {
  INSPECTOR_WIDTH,
  INSPECTOR_WIDTH_STORAGE_KEY,
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
  clampInspectorWidth,
  inspectorMaxWidth,
  parseStoredInspectorWidth,
  runtimeDestination,
  snapshotCounts,
  snapshotFigures,
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
const CONTROLS = read('components/platform/vnext/IntelligenceGraphControls.tsx')
const HUD = read('components/platform/vnext/IntelligenceGraphHud.tsx')
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
    for (const src of [HOOK, VNEXT, INSPECTOR, SHARED, CONTROLS, HUD]) {
      expect(codeOnly(src)).not.toMatch(/method:\s*['"](POST|PUT|PATCH|DELETE)/)
    }
    for (const src of [VNEXT, INSPECTOR, SHARED, CONTROLS, HUD]) expect(codeOnly(src)).not.toMatch(/\bfetch\(/)
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
    // T2a: the counts sit beside the stamp, named for assistive tech rather than titled.
    expect(html).toContain('aria-label="Antal i denna ögonblicksbild"')
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
    expect(html).toContain('aria-label="Antal i den här vyn"')
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
  it('is exactly as tall as the vNext shell leaves it, not the legacy CommandBar height', () => {
    // T2a: a height, not a minimum — the canvas absorbs what the chrome does not use.
    expect(CSS).toMatch(/\.field \{[^}]*\n  height: calc\(100dvh - var\(--ig-shell-chrome\)\);\n  min-height: 28rem;/)
    expect(CSS).not.toContain('min-height: calc(100dvh - var(--ig-shell-chrome));')
    expect(CSS).toContain('--ig-shell-chrome: calc(var(--ig-mobile-header) + var(--ig-crumbs) + var(--ig-hints));')
    expect(CSS).toContain('--ig-crumbs: calc(14px + 1.00625rem);')
    expect(CSS).toContain('--ig-hints: 2.25rem;')
    expect(CSS).toMatch(/@media \(max-width: 1023px\) \{\s*\.field \{ --ig-mobile-header: 62px; \}/)
    expect(CSS).toMatch(/@media \(max-width: 900px\) \{\s*\.field \{ --ig-hints: 2\.125rem; \}/)
    expect(CSS).toMatch(/@media \(max-width: 640px\) \{\s*\.field \{\s*--ig-crumbs: calc\(12px \+ 1\.00625rem\);\s*--ig-hints: 2\.0625rem;/)
    expect(CSS).not.toMatch(/100vh\s*-\s*4rem/)
    // The chrome it subtracts is the chrome those components declare.
    expect(read('components/platform/os/Breadcrumbs.module.css')).toMatch(/\.nav \{\s*\/\*[^*]*\*\/\s*padding: 14px 28px 0;\s*font-size: 0\.71875rem;[^}]*line-height: 1\.4;/)
    const hints = read('components/platform/os/KeyboardHints.module.css')
    expect(hints).toContain('padding: 0.5rem 8.5rem 0.625rem 1.75rem;')
    expect(hints).toMatch(/\.cap \{[^}]*height: 1\.125rem;/)
    expect(read('components/platform/vnext/AtlasHomeVNext.module.css')).toContain('min-height: 62px;')
  })

  it('docks the inspector at the breakpoint and share the canvas reserves for it', () => {
    // T2a: the sheet's top stays on the canvas reserve; its bottom stops above the activity peek.
    expect(CSS).toMatch(/@media \(max-width: 767px\) \{\s*\.inspectorDock \{[^}]*height: calc\(min\(48%, 24rem\) - var\(--ig-sheet-clear\)\);\s*bottom: var\(--ig-sheet-clear\);/)
    expect(CANVAS).toContain('const inspectorBottomInset = inspectorOpen && viewport.width < 768 ? view.h * 0.48 : 0')
    // T2a: the docked width is the operator's, inside the limits in INSPECTOR_WIDTH.
    expect(CSS).toMatch(/\.inspectorDock \{\s*position: relative;\s*flex: none;[^}]*width: clamp\(18rem, var\(--ig-inspector-width, 22rem\), max\(18rem, 100% - 24\.75rem\)\);/)
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
    for (const src of [VNEXT, INSPECTOR, SHARED, CSS, HOOK, CONTROLS, HUD]) {
      expect(src).not.toMatch(/design\/references|refs\/|Omnira OS\.dc/)
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Phase 18 T2a — canvas first
//
// T2a does not move a node. It frees the canvas: a fixed-height page, one
// control row, the view's description laid over the canvas, and an inspector
// the operator can resize or put away — all while keeping every T1 statement
// (stamp, counts, cap, truth classes, provenance) on screen or one click away,
// and keeping the shell's floating Atlas launcher and activity peek clear.
// ─────────────────────────────────────────────────────────────────────────────

/** The markup between an element's opening tag (found by `marker`) and the next sibling marker. */
function section(html: string, marker: string, until?: string): string {
  const start = html.indexOf(marker)
  expect(start, marker).toBeGreaterThanOrEqual(0)
  const end = until ? html.indexOf(until, start + marker.length) : -1
  // End before the tag that carries `until`, so no half-open tag leaks into text().
  return html.slice(start, end > start ? html.lastIndexOf('<', end) : undefined)
}

describe('phase 18 T2a · one control row', () => {
  beforeEach(() => { mocks.graph.current = graphState() })

  it('puts modes, search, Filter and the view menu in one row, and nothing else above the canvas', async () => {
    const html = await renderVNext(graphState())
    const controls = section(html, 'data-testid="graph-controls"', 'data-testid="graph-canvas-frame"')
    expect(controls).toContain('aria-label="Grafläge"')
    expect(controls).toContain('aria-label="Sök i aktuell graf"')
    expect(controls).toContain('data-testid="graph-filter-toggle"')
    expect(controls).toContain('data-testid="graph-view-toggle"')
    // The header box, then the control row, then the stage — no second filter row, no counts strip.
    const order = ['data-testid="graph-snapshot"', 'data-testid="graph-controls"', 'data-testid="graph-canvas-frame"'].map((marker) => html.indexOf(marker))
    expect(order.every((value, index) => value >= 0 && (index === 0 || value > order[index - 1]))).toBe(true)
    for (const gone of ['styles.toolbar', 'styles.filters}', 'styles.filterGroups', 'styles.relationMenu', 'styles.counts}']) {
      expect(VNEXT + CONTROLS + HUD, gone).not.toContain(gone)
    }
    expect(CSS).not.toMatch(/^\.(toolbar|filters|filterGroups|filterToggle|relationMenu|counts) /m)
  })

  it('folds project, time window, status, kinds and relations into the Filter menu, closed', async () => {
    const html = await renderVNext(graphState())
    const toggle = html.match(/<button[^>]*data-testid="graph-filter-toggle"[^>]*>/)![0]
    expect(toggle).toContain('aria-expanded="false"')
    const panelId = toggle.match(/aria-controls="([^"]+)"/)![1]
    const panel = section(html, `id="${panelId}"`, 'data-testid="graph-view-toggle"')
    expect(panel).toMatch(/^id="[^"]+" class="[^"]+" data-columns="two" hidden=""/)
    const words = text(`<div ${panel}`)
    for (const group of ['Projekt', 'Alla projekt', 'Tidsfönster för körningar', '24 h', '7 d', '30 d', 'Körningsstatus', 'Nodtyper', 'Relationer', 'Rensa filter']) {
      expect(words, group).toContain(group)
    }
    // It says what the groups do: two change what is fetched, the rest only dim.
    expect(words).toContain('Projekt och tidsfönster styr vad som hämtas.')
    expect(HOOK).toContain("const params = new URLSearchParams({ hours: String(hours) })")
    expect(HOOK).toContain("if (projectFilter !== 'all') params.set('project', projectFilter)")
    // Two columns keep the menu short enough to stay above the floating corner; a phone stacks it.
    expect(CSS).toMatch(/\.filterPanel\[data-columns='two'\] \{\s*display: grid;\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/)
    expect(CSS).toMatch(/@media \(max-width: 640px\) \{\s*\.filterPanel\[data-columns='two'\] \{ display: flex; \}/)
  })

  it('counts the dimming filters on the Filter button', async () => {
    const quiet = await renderVNext(graphState())
    expect(quiet).not.toMatch(/aria-label="\d+ aktiva"/)
    const html = await renderVNext(graphState({ kindFilter: new Set(['run']), statusFilter: new Set(['failed']), filtersActive: true }))
    expect(html).toMatch(/<span[^>]*aria-label="2 aktiva"[^>]*>2<\/span>/)
  })

  it('keeps the resets and fullscreen in the view menu, each saying what it does', async () => {
    const html = await renderVNext(graphState())
    const toggle = html.match(/<button[^>]*data-testid="graph-view-toggle"[^>]*>/)![0]
    expect(toggle).toContain('aria-expanded="false"')
    expect(toggle).toContain('aria-label="Vy: återställ och helskärm"')
    const words = text(section(html, 'data-testid="graph-view-panel"', 'data-testid="graph-canvas-frame"'))
    expect(words).toContain('Återställ vy Rensar val och fördjupning och anpassar vyn')
    expect(words).toContain('Återställ allt Rensar även filter, sökning, isolering och historik')
    expect(words).toContain('Helskärm')
    expect(CONTROLS).toMatch(/onClick=\{run\(graph\.resetView\)\}/)
    expect(CONTROLS).toMatch(/onClick=\{run\(graph\.resetAll\)\}/)
  })

  it('closes a menu on Escape only from inside it, and on a press outside it', () => {
    const hook = CONTROLS.slice(CONTROLS.indexOf('export function usePopover'), CONTROLS.indexOf('export interface IntelligenceGraphControlsProps'))
    expect(hook).toContain("if (!rootRef.current?.contains(document.activeElement)) return")
    expect(hook).toContain('triggerRef.current?.focus()')
    expect(hook).toMatch(/if \(rootRef\.current && !rootRef\.current\.contains\(event\.target as Node\)\) setOpen\(false\)/)
    expect(hook).toContain("document.removeEventListener('pointerdown', onPointerDown)")
  })

  it('keeps Execution Replay disabled in the row', async () => {
    const controls = section(await renderVNext(graphState()), 'data-testid="graph-controls"', 'aria-label="Sök i aktuell graf"')
    expect(controls).toMatch(/<button[^>]*disabled=""[^>]*title="Kräver händelsedata per steg, som Omnira inte registrerar ännu\."[^>]*>Execution Replay<\/button>/)
  })
})

describe('phase 18 T2a · the snapshot box', () => {
  it('stamps, counts and refreshes in one box beside the title', async () => {
    const html = await renderVNext(graphState())
    const box = section(html, 'data-testid="graph-snapshot"', 'data-testid="graph-controls"')
    const words = text(`<div ${box}`)
    expect(words).toMatch(/^Ögonblicksbild · hämtad \d{2}:\d{2} Uppdateras inte automatiskt\. /)
    expect(words).toContain('2 projekt 3 agenter 2 workflows 4 körningar · senaste 24 h 1 kör 1 misslyckades 1 inväntar granskning')
    expect(words).toMatch(/Uppdatera$/)
  })

  it('names the run window at the run figure, and says a window with no runs', async () => {
    const week = text(await renderVNext(graphState({ hours: 24 * 7 })))
    expect(week).toContain('4 körningar · senaste 7 d')
    const nodes = OPERATIONS_FIXTURE_NODES.filter((value) => ['project', 'agent', 'workflow'].includes(value.kind))
    const empty = text(await renderVNext(graphState({ data: { ...OPERATIONS_FIXTURE_PAYLOAD, nodes, edges: [] } as GraphState['data'] })))
    expect(empty).toContain('0 körningar · senaste 24 h')
  })

  it('adds a zero-run figure only in Live Operations, in kind order', () => {
    const projectsOnly = snapshotCounts(OPERATIONS_FIXTURE_NODES.filter((value) => value.kind !== 'run'))
    const figures = snapshotFigures('operations', projectsOnly)
    expect(figures.map((item) => `${item.value} ${item.noun}`)).toEqual([
      '2 projekt', '3 agenter', '2 workflows', '0 körningar', '2 granskningar', '1 utdata', '1 uppgift',
    ])
    expect(figures.map((item) => item.kind)).toEqual([...figures.map((item) => item.kind)].sort((a, b) => KIND_ORDER.indexOf(a) - KIND_ORDER.indexOf(b)))
    expect(snapshotFigures('system', projectsOnly)).toBe(projectsOnly.items)
    const withRuns = snapshotCounts(OPERATIONS_FIXTURE_NODES)
    expect(snapshotFigures('operations', withRuns)).toBe(withRuns.items)
  })

  it('warns about the run cap inside the box when it is reached', async () => {
    const runs = Array.from({ length: OPERATIONS_RUN_CAP }, (_, index) => ({ ...node('run:r1'), id: `run:cap-${index}` }))
    const data = { ...OPERATIONS_FIXTURE_PAYLOAD, nodes: [...OPERATIONS_FIXTURE_NODES, ...runs] }
    const html = await renderVNext(graphState({ data: data as GraphState['data'] }))
    expect(section(html, 'data-testid="graph-snapshot"', 'data-testid="graph-controls"')).toContain('data-testid="graph-run-cap"')
  })
})

describe('phase 18 T2a · on the canvas', () => {
  const workflowScope = { kind: 'workflow' as const, rootId: 'workflow:w1', label: 'Daglig artikel', nodeIds: new Set(['workflow:w1', 'agent:a1', 'agent:a2', 'run:r1', 'run:r2', 'run:r4']) }

  it('lays place, scope and filter state over the canvas, ahead of it in reading order', async () => {
    const html = await renderVNext(graphState({
      drillScope: workflowScope,
      isolateScope: workflowScope,
      projectFilter: '11111111-1111-4111-8111-111111111111',
      kindFilter: new Set(['run']),
      filtersActive: true,
      filterState: { matchingIds: new Set(['run:r1']), dimmedIds: new Set(), matchCount: 4, criticalOutsideFilters: 2 },
    }))
    const frame = section(html, 'data-testid="graph-canvas-frame"')
    const place = section(frame, 'data-testid="graph-place"', 'role="group" aria-label="Live Operations snapshot graph"')
    const words = text(`<div ${place}`)
    expect(words).toContain('Tillbaka')
    // The isolation is said once, by its own chip — not again as a crumb.
    expect(words).toContain('Översikt / Daglig artikel')
    expect(words).not.toContain('/ Isolerad:')
    expect(words.match(/Isolerad: Daglig artikel/g) ?? []).toHaveLength(1)
    expect(words).toMatch(/Projekt: \S.* Visa alla/)
    expect(words).toContain('Isolerad: Daglig artikel Lämna isolering Anpassa till urvalet')
    expect(words).toContain('4 matchar · övriga dimmade Rensa filter')
    expect(words).toContain('2 kritiska objekt bevarade utanför filtermatch')
    // Tab reaches Tillbaka before the canvas.
    expect(frame.indexOf('Tillbaka')).toBeLessThan(frame.indexOf('aria-label="Live Operations snapshot graph"'))
  })

  it('names a project scope, since a scoped snapshot counts only that project', async () => {
    const all = await renderVNext(graphState())
    expect(all).not.toContain('data-testid="graph-project-scope"')
    const scoped = text(await renderVNext(graphState({ projectFilter: '11111111-1111-4111-8111-111111111111' })))
    const name = OPERATIONS_FIXTURE_PAYLOAD.projects?.find((project) => project.id === '11111111-1111-4111-8111-111111111111')?.name ?? 'valt projekt'
    expect(scoped).toContain(`Projekt: ${name} Visa alla`)
  })

  it('keeps the legend key and its folded explanation on the canvas', async () => {
    const html = await renderVNext(graphState())
    const legend = section(section(html, 'data-testid="graph-canvas-frame"'), 'data-testid="graph-legend"')
    const toggle = legend.match(/<button[^>]*aria-controls="graph-legend-panel"[^>]*>/)![0]
    expect(toggle).toContain('aria-expanded="false"')
    expect(legend).toMatch(/id="graph-legend-panel" class="[^"]+" hidden=""/)
    const words = text(`<section ${legend}`)
    expect(words).toContain('Om ögonblicksbilden')
    expect(words).toContain(`Körningar skapade de senaste 24 h, högst ${OPERATIONS_RUN_CAP} per hämtning.`)
    expect(words).toContain('Granskningar, utdata och uppgifter visas bara när de hör till en av körningarna.')
    expect(words).toMatch(/Direkt Definition Förklaring$/)
  })

  it('keeps the zoom controls on the canvas', async () => {
    const frame = section(await renderVNext(graphState()), 'data-testid="graph-canvas-frame"')
    expect(frame).toContain('aria-label="Zooma ut"')
    expect(frame).toContain('data-testid="graph-zoom-level"')
  })
})

describe('phase 18 T2a · inspector', () => {
  it('puts the actions under the name, above three tabs', async () => {
    const html = await renderVNext(graphState({ selected: node('run:r2') }))
    const inspector = section(html, 'data-testid="graph-inspector"')
    const at = (marker: string) => inspector.indexOf(marker)
    expect(at('data-testid="inspector-actions"')).toBeGreaterThan(at('Stäng inspektören'))
    expect(at('role="tablist"')).toBeGreaterThan(at('data-testid="inspector-actions"'))
    expect(at('data-testid="inspector-panel-overview"')).toBeGreaterThan(at('role="tablist"'))
    const tabs = [...inspector.matchAll(/<button[^>]*role="tab"[^>]*>([\s\S]*?)<\/button>/g)]
    expect(tabs.map((match) => text(match[1]))).toEqual(['Översikt', 'Kopplingar 2', 'Källa'])
    expect(tabs.map((match) => /aria-selected="true"/.test(match[0]))).toEqual([true, false, false])
    expect(tabs.map((match) => /tabindex="0"/.test(match[0]))).toEqual([true, false, false])
  })

  it('pairs every tab with its panel and shows only the selected one', async () => {
    const html = await renderVNext(graphState({ selected: node('run:r2') }))
    const inspector = section(html, 'data-testid="graph-inspector"')
    for (const value of ['overview', 'relations', 'source']) {
      const panel = inspector.match(new RegExp(`<div[^>]*role="tabpanel"[^>]*data-testid="inspector-panel-${value}"[^>]*>`))![0]
      const panelId = panel.match(/ id="([^"]+)"/)![1]
      const labelledBy = panel.match(/aria-labelledby="([^"]+)"/)![1]
      expect(inspector).toContain(`aria-controls="${panelId}"`)
      expect(inspector).toContain(`id="${labelledBy}"`)
      expect(/hidden=""/.test(panel), value).toBe(value !== 'overview')
    }
    const overview = text(section(inspector, 'data-testid="inspector-panel-overview"', 'data-testid="inspector-panel-relations"'))
    expect(overview).toContain('Status vid hämtning Misslyckades')
    expect(overview).toContain('Lagrat fel Provider timeout')
    const relations = text(section(inspector, 'data-testid="inspector-panel-relations"', 'data-testid="inspector-panel-source"'))
    expect(relations).toContain('körning av Daglig artikel Direkt')
    const source = text(section(inspector, 'data-testid="inspector-panel-source"'))
    expect(source).toMatch(/Källa Omnira-databasen · tabellen runs Ögonblicksbild · hämtad \d{2}:\d{2}/)
  })

  it('moves between tabs with the arrow keys, Home and End', () => {
    expect(INSPECTOR).toContain("if (event.key === 'ArrowRight') next = INSPECTOR_TABS[(index + 1) % INSPECTOR_TABS.length]")
    expect(INSPECTOR).toContain("else if (event.key === 'ArrowLeft') next = INSPECTOR_TABS[(index - 1 + INSPECTOR_TABS.length) % INSPECTOR_TABS.length]")
    expect(INSPECTOR).toContain("else if (event.key === 'Home') next = INSPECTOR_TABS[0]")
    expect(INSPECTOR).toContain("else if (event.key === 'End') next = INSPECTOR_TABS[INSPECTOR_TABS.length - 1]")
    expect(INSPECTOR).toContain('document.getElementById(tabId(next))?.focus()')
  })

  it('says so when a node has nothing more to show, instead of an empty panel', async () => {
    const project = node('project:11111111-1111-4111-8111-111111111111')
    const html = await renderVNext(graphState({ selected: project }))
    expect(text(section(html, 'data-testid="inspector-panel-overview"', 'data-testid="inspector-panel-relations"')))
      .toContain('Ögonblicksbilden har inga fler fält för det här objektet.')
  })

  it('can be put away without dropping the selection, and brought back', async () => {
    const html = await renderVNext(graphState({ selected: node('run:r2') }))
    expect(html).toContain('aria-label="Dölj inspektören"')
    expect(html).toContain('aria-label="Stäng inspektören"')
    expect(html).not.toContain('data-testid="graph-show-inspector"')
    // Hidden is per selection: selecting anything else opens the panel again.
    expect(VNEXT).toContain('const inspectorVisible = Boolean(selected) && hiddenFor !== selected?.id')
    expect(VNEXT).toContain('inspectorOpen={inspectorVisible}')
    expect(VNEXT).toMatch(/hiddenInspector=\{selected && !inspectorVisible\s*\? \{ label: selected\.label, onShow: showInspector, buttonRef: showInspectorRef \}/)
    expect(VNEXT).toMatch(/setHiddenFor\(selected\.id\)\s*\/\/[^\n]*\n\s*requestAnimationFrame\(\(\) => showInspectorRef\.current\?\.focus\(\)\)/)
    // Closing still deselects, as in T1.
    expect(VNEXT).toContain('onClose={() => setSelected(null)}')
    const { GraphPlace } = await import('@/components/platform/vnext/IntelligenceGraphHud')
    const place = renderToStaticMarkup(createElement(GraphPlace, {
      location: ['Översikt'], onBack: null, projectScope: null, isolate: null, filters: null, criticalOutsideFilters: 0,
      truncatedAt: null, noMatch: false, hiddenInspector: { label: 'Daglig artikel · r2000002', onShow: noop, buttonRef: { current: null } },
    }))
    expect(place).toMatch(/<button[^>]*title="Visa inspektören för Daglig artikel · r2000002"[^>]*data-testid="graph-show-inspector"/)
  })
})

describe('phase 18 T2a · inspector width', () => {
  it('keeps the width inside the limits and the canvas beside it', () => {
    expect(INSPECTOR_WIDTH).toMatchObject({ min: 18, default: 22, max: 36, canvasMin: 24, gap: 0.75 })
    // A wide stage: the preference stands, up to the maximum.
    expect(clampInspectorWidth(22, 90)).toBe(22)
    expect(clampInspectorWidth(50, 90)).toBe(36)
    expect(clampInspectorWidth(10, 90)).toBe(18)
    // 1280 px with the sidebar: 60.25 rem of stage leaves 35.5 rem for the panel at most.
    expect(inspectorMaxWidth(60.25)).toBe(35.5)
    expect(clampInspectorWidth(36, 60.25)).toBe(35.5)
    // 1024 px with the sidebar: the canvas keeps 24 rem, the panel gives way.
    expect(inspectorMaxWidth(44.25)).toBe(19.5)
    expect(clampInspectorWidth(22, 44.25)).toBe(19.5)
    // Too narrow for both: the panel keeps its minimum, never less.
    expect(inspectorMaxWidth(30)).toBe(18)
    expect(clampInspectorWidth(22, 30)).toBe(18)
    // Not yet measured: only the absolute limits apply.
    expect(inspectorMaxWidth(0)).toBe(36)
    expect(clampInspectorWidth(Number.NaN, 90)).toBe(22)
    // Quarter-rem steps, so a drag and the arrow keys land on the same values.
    expect(clampInspectorWidth(22.3, 90)).toBe(22.25)
  })

  it('reads a stored width only when it is a number, clamped to the limits', () => {
    expect(parseStoredInspectorWidth(null)).toBeNull()
    expect(parseStoredInspectorWidth('')).toBeNull()
    expect(parseStoredInspectorWidth('wide')).toBeNull()
    expect(parseStoredInspectorWidth('Infinity')).toBeNull()
    expect(parseStoredInspectorWidth('26.5')).toBe(26.5)
    expect(parseStoredInspectorWidth('90')).toBe(36)
    expect(parseStoredInspectorWidth('4')).toBe(18)
    expect(INSPECTOR_WIDTH_STORAGE_KEY).toBe('omnira:intelligence-graph-inspector-width')
  })

  it('renders a keyboard-operable splitter with the limits it enforces', async () => {
    const html = await renderVNext(graphState({ selected: node('run:r2') }))
    const separator = html.match(/<div[^>]*role="separator"[^>]*>/)![0]
    expect(separator).toContain('aria-orientation="vertical"')
    expect(separator).toContain('aria-label="Inspektörens bredd"')
    expect(separator).toContain(`aria-valuemin="${INSPECTOR_WIDTH.min}"`)
    expect(separator).toContain(`aria-valuenow="${INSPECTOR_WIDTH.default}"`)
    expect(separator).toContain(`aria-valuemax="${INSPECTOR_WIDTH.max}"`)
    expect(separator).toContain('tabindex="0"')
    const dock = html.match(/<div[^>]*data-testid="graph-inspector-dock"[^>]*>/)![0]
    expect(dock).toContain(`--ig-inspector-width:${INSPECTOR_WIDTH.default}rem`)
    // The panel is on the right: left widens, right narrows.
    expect(VNEXT).toContain("if (event.key === 'ArrowLeft') next = renderedWidth + step")
    expect(VNEXT).toContain("else if (event.key === 'ArrowRight') next = renderedWidth - step")
    expect(VNEXT).toContain("else if (event.key === 'Home') next = INSPECTOR_WIDTH.min")
    expect(VNEXT).toContain("else if (event.key === 'End') next = widthMax")
    expect(VNEXT).toContain('const next = clampInspectorWidth(drag.startRem + (drag.startX - event.clientX) / drag.rootPx, drag.stageRem)')
  })

  it('applies the same limits in the stylesheet, so a stale width still renders sanely', () => {
    const cssMax = `100% - ${INSPECTOR_WIDTH.canvasMin + INSPECTOR_WIDTH.gap}rem`
    expect(CSS).toContain(`width: clamp(${INSPECTOR_WIDTH.min}rem, var(--ig-inspector-width, ${INSPECTOR_WIDTH.default}rem), max(${INSPECTOR_WIDTH.min}rem, ${cssMax}));`)
    expect(CSS).toMatch(/\.stage \{[^}]*gap: 0\.75rem;/)
    // The sheet below 768 px is not resizable.
    expect(CSS).toMatch(/@media \(max-width: 767px\) \{[^@]*\.resizeHandle \{ display: none; \}/)
  })

  it('remembers the width per viewer and survives storage that throws', () => {
    expect(VNEXT).toMatch(/try \{\s*const stored = parseStoredInspectorWidth\(window\.localStorage\.getItem\(INSPECTOR_WIDTH_STORAGE_KEY\)\)/)
    expect(VNEXT).toMatch(/try \{\s*window\.localStorage\.setItem\(INSPECTOR_WIDTH_STORAGE_KEY, String\(rem\)\)\s*\} catch/)
  })
})

describe('phase 18 T2a · shell geometry', () => {
  const PEEK = read('components/platform/os/MobileRailToggle.tsx')
  const LAUNCHER = read('components/platform/os/AtlasMiniOrb.tsx')

  it('measures the floating corner from the activity peek and the Atlas launcher', () => {
    // The peek: right-5 (1.25rem) + px-4 twice (2rem) + w-3.5 icon (0.875rem) + gap-2 (0.5rem) + a 12px label,
    // and with live events gap-2 (0.5rem) + a 4px dot + gap-1 (0.25rem) + 10px digits.
    expect(PEEK).toContain('fixed z-50 bottom-5 right-5 h-11 px-4 rounded-full flex items-center gap-2')
    expect(PEEK).toContain('<Activity className="w-3.5 h-3.5" />')
    expect(PEEK).toContain('<span className="text-[12px] font-semibold tracking-tight">Activity</span>')
    expect(PEEK).toContain('<span className="inline-flex items-center gap-1 caption-mono text-[10px] text-white/90">')
    expect(PEEK).toContain('<PulseDot tone="emerald" size={4} />')
    const remParts = 1.25 + 2 + 0.875 + 0.5 + 0.5 + 0.25 + 0.5 // … + 0.5rem of air
    expect(CSS).toContain(`--ig-float-right: calc(${remParts}rem + 63px);`)
    // Up from the bottom: the peek alone is bottom-5 + h-11 (4rem); from lg the launcher sits on top of it.
    expect(LAUNCHER).toContain('const MINI_SIZE = 52')
    expect(LAUNCHER).toContain('const LAUNCHER_BOTTOM = ACTIVITY_PEEK_BOTTOM + ACTIVITY_PEEK_HEIGHT + STACK_GAP  // 76')
    expect(LAUNCHER).toMatch(/className="hidden lg:block fixed z-50"\s*style=\{\{ bottom: `\$\{LAUNCHER_BOTTOM\}px`, right: `\$\{STACK_RIGHT\}px` \}\}/)
    expect(CSS).toContain('--ig-float-top: 4.5rem;')
    expect(CSS).toMatch(/@media \(min-width: 1024px\) \{\s*\.field \{ --ig-float-top: calc\(max\(4rem, 128px\) \+ 0\.5rem\); \}/)
    // The peek is on this route at every width: it only stands down on Atlas Home.
    expect(read('lib/nav/activity-peek-visibility.ts')).toContain('return pathname === ATLAS_HOME_PATH && isVNext(generation)')
  })

  it('keeps the panel above the floating corner and the legend beside it', () => {
    expect(CSS).toContain('margin-bottom: max(0px, calc(var(--ig-float-top) - var(--ig-hints) - var(--ig-pad-bottom)));')
    expect(CSS).toMatch(/@media \(min-width: 768px\) \{[^@]*\.stage\[data-inspector='closed'\] \.legend \{\s*right: max\(0\.625rem, calc\(var\(--ig-float-right\) - var\(--ig-pad-x\)\)\);/)
    // Below 768 the sheet ends above the peek, and the legend keeps left of it.
    expect(CSS).toContain('--ig-sheet-clear: max(0px, calc(var(--ig-float-top) - var(--ig-hints) - var(--ig-pad-bottom)));')
    expect(CSS).toContain('max-width: calc(100% - 1.25rem - max(0px, calc(var(--ig-float-right) - var(--ig-pad-x))));')
  })

  it('goes fullscreen with the header, where the shell chrome is gone', () => {
    expect(VNEXT).toContain('ref={fieldRef}')
    expect(VNEXT).toMatch(/const element = fieldRef\.current\n/)
    expect(VNEXT).toContain('else await element.requestFullscreen()')
    expect(CSS).toMatch(/\.field:fullscreen \{\s*--ig-float-right: 0px;\s*--ig-float-top: 0px;\s*--ig-hints: 0px;\s*height: 100dvh;/)
  })

  it('lets the canvas corners answer to the canvas width, not the viewport', () => {
    expect(CSS).toMatch(/\.canvasFrame \{[^}]*container-type: inline-size;\s*container-name: ig-canvas;/)
    expect(CSS).toMatch(/@container ig-canvas \(max-width: 40rem\) \{\s*\.legendKey \{ display: none; \}/)
  })
})

describe('phase 18 T2a · the canvas keeps nodes out from under its own controls', () => {
  const bounds = { minX: 100, minY: 100, maxX: 1100, maxY: 700 }
  const viewport = { width: 964, height: 471 }

  it('fits into the band between the overlays at the canvas aspect ratio', () => {
    const plain = fitGraphBounds(bounds, viewport)
    const banded = fitGraphBounds(bounds, viewport, undefined, { top: 50, bottom: 50 })
    expect(banded.w / banded.h).toBeCloseTo(viewport.width / viewport.height, 6)
    // The graph (with its padding) lies inside the band: 50 px from each edge, in world units.
    const unitsPerPx = banded.h / viewport.height
    expect(bounds.minY - 64).toBeGreaterThanOrEqual(banded.y + 50 * unitsPerPx - 1e-6)
    expect(bounds.maxY + 64).toBeLessThanOrEqual(banded.y + banded.h - 50 * unitsPerPx + 1e-6)
    expect(banded.h).toBeGreaterThan(plain.h)
  })

  it('is exactly the old camera when no overlay is given', () => {
    const plain = fitGraphBounds(bounds, viewport)
    expect(fitGraphBounds(bounds, viewport, undefined, undefined)).toEqual(plain)
    expect(fitGraphBounds(bounds, viewport, undefined, { top: 0, bottom: 0 })).toEqual(plain)
    const layout = new Map([['a', { id: 'a', x: 200, y: 200, r: 20 }], ['b', { id: 'b', x: 800, y: 500, r: 20 }]])
    expect(fitNodeIds(layout, new Set(['a', 'b']), viewport, undefined)).toEqual(fitNodeIds(layout, new Set(['a', 'b']), viewport))
    const camera = { x: 0, y: 0, w: 900, h: 600 }
    expect(preserveSelectedNeighborhoodCamera(camera, layout, new Set(['a']), 'a', viewport, false, undefined))
      .toEqual(preserveSelectedNeighborhoodCamera(camera, layout, new Set(['a']), 'a', viewport, false))
  })

  it('pans a selection out from under the top row without zooming', () => {
    const camera = { x: 0, y: 0, w: 900, h: 600 }
    const layout = new Map([['top', { id: 'top', x: 450, y: 60, r: 20 }]])
    const plain = preserveSelectedNeighborhoodCamera(camera, layout, new Set(['top']), 'top', { width: 900, height: 600 }, false)
    const banded = preserveSelectedNeighborhoodCamera(camera, layout, new Set(['top']), 'top', { width: 900, height: 600 }, false, { top: 48 })
    expect(banded.w).toBe(camera.w)
    expect(banded.h).toBe(camera.h)
    expect(banded.y).toBeLessThan(plain.y)
  })

  it('reserves label space only for the sheet and the overlays actually given', () => {
    const camera = { x: 100, y: 50, w: 900, h: 600 }
    // Legacy: no sheet, no overlay — nothing reserved, exactly as before.
    expect(reservedCanvasBoxes(camera, 471, 0)).toEqual([])
    expect(reservedCanvasBoxes(camera, 471, 0, { top: 0, bottom: 0 })).toEqual([])
    // The mobile sheet alone: the same single box the canvas always reserved.
    expect(reservedCanvasBoxes(camera, 471, 288)).toEqual([{ minX: 100, minY: 362, maxX: 1000, maxY: 650 }])
    // Overlays: full-width bands, converted from px to world units.
    const banded = reservedCanvasBoxes(camera, 600, 0, { top: 48, bottom: 50 })
    expect(banded).toEqual([
      { minX: 100, minY: 50, maxX: 1000, maxY: 98 },
      { minX: 100, minY: 600, maxX: 1000, maxY: 650 },
    ])
    expect(CANVAS).toContain('() => reservedCanvasBoxes(view, viewport.height, inspectorBottomInset, { top: overlayTopPx, bottom: overlayBottomPx }),')
  })

  it('passes the page overlay to the camera and the labels, and legacy passes none', () => {
    expect(CANVAS).toContain('overlayInsets?: GraphOverlayInsets')
    expect(CANVAS).toContain('setView(fitGraphBounds(graphBounds, viewport, undefined, overlayRef.current))')
    expect(CANVAS).toContain('const next = fitNodeIds(layout, ids, viewport, overlayRef.current)')
    expect(CANVAS).toContain('const next = fitNodeIds(layout, selectedNeighborhood, viewport, overlayRef.current)')
    expect(CANVAS).toMatch(/viewport,\s*inspectorOpen,\s*overlayRef\.current,\s*\)\)/)
    // A new inset alone never moves the camera: it is read from a ref, not a dependency.
    expect(CANVAS).toMatch(/const fit = useCallback\(\(\) => \{\s*setView\(fitGraphBounds\(graphBounds, viewport, undefined, overlayRef\.current\)\)\s*\}, \[graphBounds, viewport\]\)/)
    expect(VNEXT).toContain('overlayInsets={overlayInsets}')
    expect(read('components/platform/intelligence/IntelligenceGraphClient.tsx')).not.toContain('overlayInsets')
  })

  it('stays quiet in the top corner at the top of an unfiltered graph', async () => {
    const html = await renderVNext(graphState())
    expect(html).not.toContain('data-testid="graph-place"')
    expect(VNEXT).toMatch(/top: \(narrow \|\| placeShown \? HUD_ROW_REM : 0\) \* rootPx,/)
    expect(VNEXT).toContain('const HUD_ROW_REM = 3.125')
  })
})
