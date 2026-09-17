/**
 * Phase 18 T2b — the deterministic spatial layout for vNext Live Operations.
 *
 * What must hold, whatever the arrangement looks like:
 *  - the same snapshot, aspect and anchor give the same places, in any row order;
 *  - quiet projects are placed on a calmer orbit and never hidden;
 *  - every count and caption says what the snapshot holds, nothing more;
 *  - agents are grouped only by a workflow definition that names them;
 *  - runs are counted per workflow, and shown one by one only for a real
 *    status, a pin, or inside the workflow view;
 *  - Atlas links only to owned project hubs and is never a node.
 */
import { describe, expect, it } from 'vitest'
import type { IntelligenceGraphEdge, IntelligenceGraphNode } from '@/lib/intelligence/graph-contract'
import { PROD_SHAPED_PROJECTS as P, productionShapedOperations } from '@/lib/qa/intelligence-graph-fixture'
import {
  PORTFOLIO_REVEAL,
  PROJECT_REVEAL,
  SPATIAL_METRICS,
  SPATIAL_STRETCH,
  classifySpatialAspect,
  computeSpatialLayout,
  hubSubtext,
  isOperationallyActive,
  projectMonogram,
  runNeedsOwnPlace,
  runsByWorkflow,
  spatialDensityLevel,
  spatialEdgeLevel,
  spatialNodeVisibility,
  spatialReportedLevel,
  summarizeProject,
  type SpatialAnchor,
  type SpatialAspect,
  type SpatialLayout,
} from './spatial-layout'

const hub = (projectId: string) => `project:${projectId}`
const snapshot = (hours = 24, attention = false) => productionShapedOperations(hours, { attention })
const layoutOf = (anchor: SpatialAnchor, hours = 24, attention = false, aspect: SpatialAspect = 'wide') => {
  const payload = snapshot(hours, attention)
  return { payload, layout: computeSpatialLayout({ nodes: payload.nodes, edges: payload.edges, anchor, aspect }) }
}

/**
 * The snapshot plus satellite rows the operations payload carries: an output
 * whose row has no project (outputs.project_id is nullable) produced by a
 * counted run, a task that tracks a failed run, and five outputs of that
 * failed run — more than its stack shows.
 */
function withSatellites() {
  const payload = snapshot(24, true)
  const nodes: IntelligenceGraphNode[] = [
    ...payload.nodes,
    { id: 'output:tp-a', kind: 'output', label: 'Manus v1', source: 'runtime', metadata: {} },
    { id: 'task:tp-a', kind: 'task', label: 'Följ upp timeout', source: 'runtime', projectId: P.prompt, status: 'open', metadata: {} },
    ...[1, 2, 3, 4, 5].map((index): IntelligenceGraphNode => ({ id: `output:tp-f${index}`, kind: 'output', label: `Utkast ${index}`, source: 'runtime', projectId: P.prompt, metadata: {} })),
  ]
  const edges: IntelligenceGraphEdge[] = [
    ...payload.edges,
    { id: 'run:tp-003→output:tp-a', source: 'run:tp-003', target: 'output:tp-a', relation: 'PRODUCED', confidence: 'DERIVED', metadata: {} },
    { id: 'task:tp-a→run:tp-001', source: 'task:tp-a', target: 'run:tp-001', relation: 'TRACKS', confidence: 'DERIVED', metadata: {} },
    ...[1, 2, 3, 4, 5].map((index): IntelligenceGraphEdge => ({ id: `run:tp-001→output:tp-f${index}`, source: 'run:tp-001', target: `output:tp-f${index}`, relation: 'PRODUCED', confidence: 'DERIVED', metadata: {} })),
  ]
  return { ...payload, nodes, edges }
}

/**
 * A snapshot built to crowd every ring: a project with 15 workflows, 80
 * agents (60 named, 20 not), 30 failed runs in one workflow with an output
 * each and 12 runs without a workflow; a project with 50 agents and nothing
 * else; a workflow naming 20 agents; and an output on every run.
 */
function crowded() {
  const payload = snapshot(24 * 30, true)
  const nodes: IntelligenceGraphNode[] = [...payload.nodes]
  const edges: IntelligenceGraphEdge[] = [...payload.edges]
  const S = 'cccccccc-0000-4000-8000-000000000009'
  const Q = 'cccccccc-0000-4000-8000-000000000010'
  const at = (minutes: number) => new Date(Date.parse('2026-09-16T10:00:00Z') - minutes * 60_000).toISOString()
  nodes.push({ id: `project:${S}`, kind: 'project', label: 'Trängsel', source: 'runtime', projectId: S, metadata: { color: '#60a5fa' } })
  nodes.push({ id: `project:${Q}`, kind: 'project', label: 'Bara agenter', source: 'runtime', projectId: Q, metadata: { color: '#f472b6' } })
  for (let agent = 0; agent < 80; agent++) nodes.push({ id: `agent:c-${agent}`, kind: 'agent', label: `Agent ${String(agent).padStart(2, '0')}`, source: 'runtime', projectId: S, metadata: {} })
  for (let agent = 0; agent < 50; agent++) nodes.push({ id: `agent:q-${agent}`, kind: 'agent', label: `Q ${agent}`, source: 'runtime', projectId: Q, metadata: {} })
  for (let workflow = 0; workflow < 15; workflow++) {
    nodes.push({ id: `workflow:c-${workflow}`, kind: 'workflow', label: `Flöde ${String(workflow).padStart(2, '0')}`, source: 'runtime', projectId: S, status: 'active', metadata: {} })
    for (let step = 0; step < 4; step++) {
      edges.push({ id: `workflow:c-${workflow}→agent:c-${workflow * 4 + step}`, source: `workflow:c-${workflow}`, target: `agent:c-${workflow * 4 + step}`, relation: 'DELEGATED_TO', metadata: { order: step + 1 } })
    }
  }
  for (let run = 0; run < 40; run++) {
    nodes.push({ id: `run:c-${run}`, kind: 'run', label: `run c${run}`, source: 'runtime', projectId: S, status: run < 30 ? 'failed' : 'done', metadata: { createdAt: at(run) } })
    edges.push({ id: `workflow:c-0→run:c-${run}`, source: 'workflow:c-0', target: `run:c-${run}`, relation: 'STARTED', metadata: {} })
  }
  for (let run = 0; run < 12; run++) {
    nodes.push({ id: `run:co-${run}`, kind: 'run', label: `utan workflow ${run}`, source: 'runtime', projectId: S, status: run < 5 ? 'failed' : 'done', metadata: { createdAt: at(100 + run) } })
  }
  nodes.push({ id: 'workflow:tp-long', kind: 'workflow', label: 'Lång kedja', source: 'runtime', projectId: P.prompt, status: 'active', metadata: {} })
  for (let step = 0; step < 20; step++) {
    nodes.push({ id: `agent:tp-s${step}`, kind: 'agent', label: `Steg ${step}`, source: 'runtime', projectId: P.prompt, metadata: {} })
    edges.push({ id: `workflow:tp-long→agent:tp-s${step}`, source: 'workflow:tp-long', target: `agent:tp-s${step}`, relation: 'DELEGATED_TO', metadata: { order: step } })
  }
  for (const run of nodes.filter((node) => node.kind === 'run')) {
    nodes.push({ id: `output:${run.id}`, kind: 'output', label: `Utdata ${run.id}`, source: 'runtime', metadata: {} })
    edges.push({ id: `${run.id}→output:${run.id}`, source: run.id, target: `output:${run.id}`, relation: 'PRODUCED', metadata: {} })
  }
  return { nodes, edges }
}

/** Everything a layout decides, in a form `toEqual` compares exactly. */
function serialise(layout: SpatialLayout) {
  return {
    level: layout.level,
    anchorId: layout.anchorId,
    positions: [...layout.positions.entries()].sort(([a], [b]) => a.localeCompare(b)),
    roles: [...layout.roles.entries()].sort(([a], [b]) => a.localeCompare(b)),
    hubs: [...layout.hubs].sort((a, b) => a.nodeId.localeCompare(b.nodeId)),
    atlas: layout.atlas,
    clusters: [...layout.clusters].sort((a, b) => a.id.localeCompare(b.id)),
    bands: [...layout.unlinkedBands].sort((a, b) => a.id.localeCompare(b.id)),
    aggregated: [...layout.aggregatedRunIds].sort(),
    fitBounds: layout.fitBounds,
  }
}

/** A deterministic shuffle, so the test itself is reproducible. */
function shuffled<T>(values: readonly T[], seed: number): T[] {
  const result = [...values]
  let state = seed
  for (let index = result.length - 1; index > 0; index--) {
    state = (state * 1103515245 + 12345) % 2147483648
    const swap = state % (index + 1)
    ;[result[index], result[swap]] = [result[swap], result[index]]
  }
  return result
}

/** Angle of a point around the origin with the aspect stretch taken back out. */
function unstretchedAngle(x: number, y: number, aspect: SpatialAspect = 'wide') {
  return Math.atan2(y / SPATIAL_STRETCH[aspect].y, x / SPATIAL_STRETCH[aspect].x)
}
function unstretchedRadius(x: number, y: number, aspect: SpatialAspect = 'wide', calm = false) {
  const stretch = SPATIAL_STRETCH[aspect]
  return Math.hypot(x / stretch.x, y / (calm ? stretch.calmY : stretch.y))
}
function angularDistance(a: number, b: number) {
  const difference = Math.abs(a - b) % (Math.PI * 2)
  return Math.min(difference, Math.PI * 2 - difference)
}

describe('phase 18 T2b · the spatial layout is deterministic', () => {
  const anchors: SpatialAnchor[] = [
    { level: 'portfolio' },
    { level: 'project', projectId: P.familjeStunden },
    { level: 'project', projectId: P.prompt },
    { level: 'workflow', workflowId: 'workflow:tp-1' },
    { level: 'run', runId: 'run:tp-004' },
  ]

  it('gives the same places for the same snapshot, aspect and anchor', () => {
    for (const anchor of anchors) {
      for (const aspect of ['wide', 'balanced', 'tall'] as const) {
        const payload = snapshot(24 * 7, true)
        const first = computeSpatialLayout({ nodes: payload.nodes, edges: payload.edges, anchor, aspect })
        const second = computeSpatialLayout({ nodes: payload.nodes, edges: payload.edges, anchor, aspect })
        expect(serialise(second), `${JSON.stringify(anchor)} ${aspect}`).toEqual(serialise(first))
      }
    }
  })

  it('does not depend on the order the rows arrived in', () => {
    const base = snapshot(24 * 30, true)
    // Rows that name the same thing twice decide by a stable rule, not by which arrived first.
    const payload = {
      nodes: [...base.nodes, { id: 'output:twice', kind: 'output', label: 'Dubbel', source: 'runtime', projectId: P.prompt, metadata: {} } as IntelligenceGraphNode],
      edges: [
        ...base.edges,
        { id: 'workflow:tp-2→run:tp-000', source: 'workflow:tp-2', target: 'run:tp-000', relation: 'STARTED', metadata: {} },
        { id: 'run:tp-000→output:twice', source: 'run:tp-000', target: 'output:twice', relation: 'PRODUCED', metadata: {} },
        { id: 'run:tp-001→output:twice', source: 'run:tp-001', target: 'output:twice', relation: 'PRODUCED', metadata: {} },
      ] as IntelligenceGraphEdge[],
    }
    for (const anchor of [...anchors, { level: 'workflow', workflowId: 'workflow:tp-2' } as SpatialAnchor]) {
      const reference = serialise(computeSpatialLayout({ nodes: payload.nodes, edges: payload.edges, anchor, aspect: 'wide' }))
      for (const seed of [7, 99, 2026]) {
        const reordered = computeSpatialLayout({
          nodes: shuffled(payload.nodes, seed),
          edges: shuffled(payload.edges, seed + 1),
          anchor,
          aspect: 'wide',
        })
        expect(serialise(reordered), `${JSON.stringify(anchor)} seed ${seed}`).toEqual(reference)
      }
    }
  })

  it('places every row of the snapshot, and nothing that is not in it', () => {
    const payload = withSatellites()
    const ids = new Set(payload.nodes.map((node) => node.id))
    const layout = computeSpatialLayout({ nodes: payload.nodes, edges: payload.edges, anchor: { level: 'portfolio' }, aspect: 'wide' })
    for (const node of payload.nodes) expect(layout.positions.has(node.id), node.id).toBe(true)
    for (const [id, value] of layout.positions) {
      expect(ids.has(id), id).toBe(true)
      expect(Number.isFinite(value.x) && Number.isFinite(value.y) && value.r > 0, id).toBe(true)
    }
  })

  it('classifies the stage, not the canvas, into three aspect classes', () => {
    expect(classifySpatialAspect(1124, 590)).toBe('wide')
    expect(classifySpatialAspect(964, 371)).toBe('wide')
    expect(classifySpatialAspect(339, 325)).toBe('balanced')
    expect(classifySpatialAspect(339, 480)).toBe('tall')
    expect(classifySpatialAspect(0, 0)).toBe('balanced')
  })
})

describe('phase 18 T2b · nothing the layout shows overlaps', () => {
  /** Every circle a level shows without anyone asking: placed nodes, run counts and Atlas. */
  function overlaps(layout: SpatialLayout) {
    const circles = [
      ...[...layout.positions.values()].filter((value) => !layout.aggregatedRunIds.has(value.id) && !layout.shownWithParent.has(value.id)),
      ...layout.clusters.map((cluster) => ({ id: cluster.id, x: cluster.x, y: cluster.y, r: cluster.r })),
      { id: 'atlas', x: layout.atlas.x, y: layout.atlas.y, r: layout.atlas.r },
    ]
    const found: string[] = []
    for (let i = 0; i < circles.length; i++) {
      for (let j = i + 1; j < circles.length; j++) {
        const a = circles[i]
        const b = circles[j]
        // Positions are rounded to hundredths.
        if (Math.hypot(a.x - b.x, a.y - b.y) < a.r + b.r - 0.05) found.push(`${a.id} × ${b.id}`)
      }
    }
    return found
  }

  const datasets: Array<[string, { nodes: IntelligenceGraphNode[]; edges: IntelligenceGraphEdge[] }]> = [
    ['24 h', snapshot(24)],
    ['7 d', snapshot(24 * 7)],
    ['30 d', snapshot(24 * 30)],
    ['7 d with attention', snapshot(24 * 7, true)],
    ['satellites', withSatellites()],
    ['crowded', crowded()],
  ]

  it.each(datasets)('%s — at every level, in every aspect', (_name, payload) => {
    const anchors: SpatialAnchor[] = [
      { level: 'portfolio' },
      ...payload.nodes.filter((node) => node.kind === 'project').map((node): SpatialAnchor => ({ level: 'project', projectId: node.projectId! })),
      ...['workflow:tp-1', 'workflow:tp-5', 'workflow:tp-long', 'workflow:c-0']
        .filter((id) => payload.nodes.some((node) => node.id === id))
        .map((workflowId): SpatialAnchor => ({ level: 'workflow', workflowId })),
      ...['run:tp-orphan-0', 'run:c-39'].filter((id) => payload.nodes.some((node) => node.id === id)).map((runId): SpatialAnchor => ({ level: 'run', runId })),
    ]
    for (const anchor of anchors) {
      for (const aspect of ['wide', 'balanced', 'tall'] as const) {
        const layout = computeSpatialLayout({ nodes: payload.nodes, edges: payload.edges, anchor, aspect })
        expect(overlaps(layout), `${JSON.stringify(anchor)} ${aspect}`).toEqual([])
      }
    }
  })

  it('keeps every row that must be seen on the canvas when a ring runs out of room', () => {
    const payload = crowded()
    const project = computeSpatialLayout({ nodes: payload.nodes, edges: payload.edges, anchor: { level: 'project', projectId: 'cccccccc-0000-4000-8000-000000000009' }, aspect: 'wide' })
    const failed = payload.nodes.filter((node) => node.kind === 'run' && node.status === 'failed' && node.projectId === 'cccccccc-0000-4000-8000-000000000009')
    expect(failed).toHaveLength(35)
    for (const run of failed) expect(project.aggregatedRunIds.has(run.id), run.id).toBe(false)
    const workflow = computeSpatialLayout({ nodes: payload.nodes, edges: payload.edges, anchor: { level: 'workflow', workflowId: 'workflow:c-0' }, aspect: 'wide' })
    for (const run of failed.filter((node) => node.id.startsWith('run:c-'))) expect(workflow.aggregatedRunIds.has(run.id), run.id).toBe(false)
    expect(workflow.clusters.find((cluster) => cluster.kind === 'older')?.memberIds.every((id) => id.startsWith('run:c-'))).toBe(true)
  })

  it('leaves the sector under a portfolio hub open for its name and counts', () => {
    const { payload, layout } = layoutOf({ level: 'portfolio' }, 24 * 7, true)
    const open = (360 - SPATIAL_METRICS.portfolio.arcSpanDegrees) / 2
    let checked = 0
    for (const hub of layout.hubs) {
      const children = [...layout.positions.values()].filter((value) => {
        const node = payload.nodes.find((candidate) => candidate.id === value.id)
        return node?.projectId === hub.projectId && value.id !== hub.nodeId && !layout.shownWithParent.has(value.id) && !layout.aggregatedRunIds.has(value.id)
      })
      checked += children.length
      for (const child of children) {
        // Degrees away from straight down (SVG y grows downward).
        const fromDown = Math.abs(((Math.atan2(child.y - hub.y, child.x - hub.x) * 180) / Math.PI) - 90)
        expect(Math.min(fromDown, 360 - fromDown), `${hub.label} ${child.id}`).toBeGreaterThan(open - 1)
      }
    }
    expect(checked).toBeGreaterThan(40)
  })
})

describe('phase 18 T2b · portfolio', () => {
  it('puts Atlas at the centre, larger than any project hub, linked only to the owned hubs', () => {
    const { payload, layout } = layoutOf({ level: 'portfolio' })
    expect(layout.level).toBe('portfolio')
    expect(layout.atlas).toMatchObject({ x: 0, y: 0, receded: false })
    for (const value of layout.hubs) expect(layout.atlas.r).toBeGreaterThan(value.r)
    const projectIds = payload.nodes.filter((node) => node.kind === 'project').map((node) => node.id).sort()
    expect([...layout.atlas.linkedHubIds].sort()).toEqual(projectIds)
    // Atlas is not a node: nothing in the placement is called atlas.
    expect([...layout.positions.keys()].some((id) => id.toLowerCase().includes('atlas'))).toBe(false)
  })

  it('puts projects with operational activity on the inner orbit and quiet ones on the calmer outer orbit, hiding none', () => {
    const { layout } = layoutOf({ level: 'portfolio' })
    const byProject = new Map(layout.hubs.map((value) => [value.projectId, value]))
    expect(layout.hubs).toHaveLength(4)
    expect(byProject.get(P.prompt)!.orbit).toBe('active')
    expect(byProject.get(P.familjeStunden)!.orbit).toBe('active')
    expect(byProject.get(P.gainPilot)!.orbit).toBe('calm')
    expect(byProject.get(P.audit)!.orbit).toBe('calm')
    const radius = (projectId: string) => {
      const value = byProject.get(projectId)!
      return unstretchedRadius(value.x, value.y, 'wide', value.orbit === 'calm')
    }
    expect(Math.min(radius(P.gainPilot), radius(P.audit))).toBeGreaterThan(Math.max(radius(P.prompt), radius(P.familjeStunden)))
    expect(byProject.get(P.gainPilot)!.r).toBeLessThan(byProject.get(P.prompt)!.r)
    // Visible at the overview, whatever their activity.
    const projects = snapshot().nodes.filter((node) => node.kind === 'project')
    expect(projects).toHaveLength(4)
    for (const project of projects) expect(spatialNodeVisibility(project, layout, { depth: 1 }), project.label).toBe('visible')
  })

  it('says only what the snapshot holds under each hub', () => {
    const texts = (hours: number) => new Map(layoutOf({ level: 'portfolio' }, hours).layout.hubs.map((value) => [value.label, value.subtext]))
    expect(Object.fromEntries(texts(24))).toEqual({
      'Familje-Stunden': '33 agenter · 5 workflows',
      'The Prompt': '2 agenter · 6 workflows · 13 körningar',
      GainPilot: 'Inga agenter eller workflows',
      'AUDIT 0b': '2 inaktiva workflows',
    })
    expect(texts(24 * 7).get('The Prompt')).toBe('2 agenter · 6 workflows · 86 körningar')
    expect(texts(24 * 30).get('The Prompt')).toBe('2 agenter · 6 workflows · 120 körningar')
    expect(hubSubtext({ agents: 1, workflows: 1, activeWorkflows: 1, runs: 1, attentionRuns: 0 })).toBe('1 agent · 1 workflow · 1 körning')
    expect(hubSubtext({ agents: 0, workflows: 0, activeWorkflows: 0, runs: 3, attentionRuns: 0 })).toBe('Inga agenter eller workflows · 3 körningar')
  })

  it('derives activity from runs in the window or an active workflow, and nothing else', () => {
    const nodes = snapshot().nodes
    expect(isOperationallyActive(summarizeProject(nodes, P.prompt))).toBe(true)
    expect(isOperationallyActive(summarizeProject(nodes, P.familjeStunden))).toBe(true)
    expect(isOperationallyActive(summarizeProject(nodes, P.gainPilot))).toBe(false)
    expect(isOperationallyActive(summarizeProject(nodes, P.audit))).toBe(false)
  })

  it('names hubs with a stable monogram', () => {
    expect(['Familje-Stunden', 'The Prompt', 'GainPilot', 'AUDIT 0b', 'Omnira', 'x'].map(projectMonogram)).toEqual(['FS', 'TP', 'GP', 'A0', 'OM', 'X'])
  })

  it('keeps children folded at the overview and unfolds them with zoom depth', () => {
    const { payload, layout } = layoutOf({ level: 'portfolio' })
    const workflow = payload.nodes.find((node) => node.id === 'workflow:fs-1')!
    const agent = payload.nodes.find((node) => node.id === 'agent:fs-01')!
    expect(layout.positions.has(workflow.id) && layout.positions.has(agent.id)).toBe(true)
    expect(spatialNodeVisibility(workflow, layout, { depth: 1 })).toBe('hidden')
    expect(spatialNodeVisibility(agent, layout, { depth: 1 })).toBe('hidden')
    expect(spatialNodeVisibility(workflow, layout, { depth: PORTFOLIO_REVEAL.workflows })).toBe('visible')
    expect(spatialNodeVisibility(agent, layout, { depth: PORTFOLIO_REVEAL.workflows })).toBe('hidden')
    expect(spatialNodeVisibility(agent, layout, { depth: PORTFOLIO_REVEAL.agents })).toBe('visible')
  })

  it('does not unfold a hub’s children when the hub is selected, but shows what a selected child touches', () => {
    const { payload, layout } = layoutOf({ level: 'portfolio' })
    const fsHub = hub(P.familjeStunden)
    const agent = payload.nodes.find((node) => node.id === 'agent:fs-01')!
    const neighbours = new Set(payload.edges.filter((edge) => edge.source === fsHub || edge.target === fsHub).flatMap((edge) => [edge.source, edge.target]))
    expect(spatialNodeVisibility(agent, layout, { depth: 1, selectedId: fsHub, neighborIds: neighbours })).toBe('hidden')
    const workflow = payload.nodes.find((node) => node.id === 'workflow:fs-1')!
    const agentNeighbours = new Set(['agent:fs-01', 'workflow:fs-1', fsHub])
    expect(spatialNodeVisibility(workflow, layout, { depth: 1, selectedId: 'agent:fs-01', neighborIds: agentNeighbours })).toBe('visible')
  })
})

describe('phase 18 T2b · project view', () => {
  it('makes the drilled project the centre, with its workflows on one inner ring', () => {
    const { layout } = layoutOf({ level: 'project', projectId: P.familjeStunden })
    expect(layout.level).toBe('project')
    expect(layout.anchorId).toBe(hub(P.familjeStunden))
    expect(layout.positions.get(hub(P.familjeStunden))).toMatchObject({ x: 0, y: 0 })
    expect(layout.roles.get(hub(P.familjeStunden))).toBe('anchor')
    const rings = ['workflow:fs-1', 'workflow:fs-2', 'workflow:fs-3', 'workflow:fs-4', 'workflow:fs-5']
      .map((id) => layout.positions.get(id)!)
      .map((value) => unstretchedRadius(value.x, value.y))
    for (const ring of rings) expect(ring).toBeCloseTo(rings[0], 0)
  })

  it('places each named agent beside the workflow whose definition names it', () => {
    const { payload, layout } = layoutOf({ level: 'project', projectId: P.familjeStunden })
    const workflowAngle = new Map([1, 2, 3, 4, 5].map((index) => {
      const value = layout.positions.get(`workflow:fs-${index}`)!
      return [`workflow:fs-${index}`, unstretchedAngle(value.x, value.y)]
    }))
    const naming = new Map<string, string>()
    for (const edge of payload.edges) if (edge.relation === 'DELEGATED_TO' && edge.source.startsWith('workflow:fs-')) naming.set(edge.target, edge.source)
    expect(naming.size).toBe(25)
    for (const [agentId, workflowId] of naming) {
      const value = layout.positions.get(agentId)!
      const angle = unstretchedAngle(value.x, value.y)
      const nearest = [...workflowAngle.entries()].sort((a, b) => angularDistance(angle, a[1]) - angularDistance(angle, b[1]))[0][0]
      expect(nearest, agentId).toBe(workflowId)
    }
  })

  it('gives agents no workflow names a captioned band of their own, beyond the named ones', () => {
    const { payload, layout } = layoutOf({ level: 'project', projectId: P.familjeStunden })
    const named = new Set(payload.edges.filter((edge) => edge.relation === 'DELEGATED_TO').map((edge) => edge.target))
    const unnamed = payload.nodes.filter((node) => node.kind === 'agent' && node.projectId === P.familjeStunden && !named.has(node.id)).map((node) => node.id).sort()
    expect(unnamed).toHaveLength(8)
    expect(layout.unlinkedBands).toHaveLength(1)
    expect([...layout.unlinkedBands[0].memberIds].sort()).toEqual(unnamed)
    expect(layout.unlinkedBands[0].count).toBe(8)
    const radius = (id: string) => { const value = layout.positions.get(id)!; return unstretchedRadius(value.x, value.y) }
    const outerNamed = Math.max(...[...named].filter((id) => id.startsWith('agent:fs-')).map(radius))
    for (const id of unnamed) expect(radius(id), id).toBeGreaterThan(outerNamed)
  })

  it('lets the other projects and Atlas recede, in the directions they lay on the portfolio', () => {
    const portfolio = layoutOf({ level: 'portfolio' }).layout
    const { layout } = layoutOf({ level: 'project', projectId: P.familjeStunden })
    for (const projectId of [P.prompt, P.gainPilot, P.audit]) {
      expect(layout.roles.get(hub(projectId)), projectId).toBe('context')
      expect(layout.hubs.find((value) => value.projectId === projectId)!.orbit).toBe('receded')
    }
    expect(layout.atlas.receded).toBe(true)
    expect(layout.atlas.linkedHubIds).toEqual([hub(P.familjeStunden)])
    const payload = snapshot()
    for (const projectId of [P.prompt, P.gainPilot, P.audit]) {
      const node = payload.nodes.find((candidate) => candidate.id === hub(projectId))!
      expect(spatialNodeVisibility(node, layout, { depth: 1 }), projectId).toBe('dimmed')
      expect(spatialNodeVisibility(node, layout, { depth: 1, selectedId: node.id }), projectId).toBe('visible')
    }
    // The Prompt lies to the right of Familje-Stunden on the portfolio, and to the right here too.
    const origin = portfolio.positions.get(hub(P.familjeStunden))!
    const tp = portfolio.positions.get(hub(P.prompt))!
    const tpHere = layout.positions.get(hub(P.prompt))!
    expect(Math.sign(tpHere.x)).toBe(Math.sign(tp.x - origin.x))
    // Nothing of another project is placed.
    expect([...layout.positions.keys()].filter((id) => id.startsWith('agent:tp-') || id.startsWith('workflow:tp-'))).toEqual([])
  })

  it('leaves the sector straight below the drilled hub open for its name and counts', () => {
    for (const [hours, attention] of [[24, false], [24 * 7, true]] as const) {
      for (const projectId of [P.familjeStunden, P.prompt, P.audit]) {
        for (const aspect of ['wide', 'balanced', 'tall'] as const) {
          const payload = snapshot(hours, attention)
          const layout = computeSpatialLayout({ nodes: payload.nodes, edges: payload.edges, anchor: { level: 'project', projectId }, aspect })
          const slots = [...layout.roles.entries()].filter(([, role]) => role === 'structure').map(([id]) => id).filter((id) => id.startsWith('workflow:'))
            .map((id) => layout.positions.get(id)!)
            .concat(layout.clusters.map((cluster) => ({ id: cluster.id, x: cluster.x, y: cluster.y, r: cluster.r })))
          const open = slots.length >= 4 ? 50 : 60
          for (const slot of slots) {
            // Degrees from straight down, with the aspect stretch taken back out (SVG y grows downward).
            const angle = (unstretchedAngle(slot.x, slot.y, aspect) * 180) / Math.PI
            const fromDown = Math.abs(((angle - 90) % 360 + 540) % 360 - 180)
            expect(fromDown, `${projectId} ${aspect} ${slot.id}`).toBeGreaterThanOrEqual(open - 0.5)
          }
        }
      }
    }
  })

  it('keeps a sparse project sparse instead of enlarging its hub', () => {
    const { layout } = layoutOf({ level: 'project', projectId: P.gainPilot })
    const width = layout.fitBounds.maxX - layout.fitBounds.minX
    const hubRadius = layout.positions.get(hub(P.gainPilot))!.r
    expect(width).toBeGreaterThan(hubRadius * 8)
    expect([...layout.roles.values()].filter((role) => role === 'structure')).toEqual([])
  })
})

describe('phase 18 T2b · runs are counted per workflow', () => {
  it('turns 13, 86 and 120 runs into one cluster per workflow with the true count', () => {
    for (const hours of [24, 24 * 7, 24 * 30]) {
      const { payload, layout } = layoutOf({ level: 'project', projectId: P.prompt }, hours)
      const started = runsByWorkflow(payload.nodes, payload.edges)
      const clusters = layout.clusters.filter((cluster) => cluster.kind === 'workflow')
      expect(clusters.map((cluster) => [cluster.parentId, cluster.count]).sort()).toEqual(
        [...started.entries()].map(([workflowId, runs]) => [workflowId, runs.length]).sort(),
      )
      const total = payload.nodes.filter((node) => node.kind === 'run').length
      expect(clusters.reduce((sum, cluster) => sum + cluster.count, 0)).toBe(total)
      // Every run is counted; none is shown on its own, since all are done.
      expect(layout.aggregatedRunIds.size).toBe(total)
      for (const run of payload.nodes.filter((node) => node.kind === 'run')) {
        expect(spatialNodeVisibility(run, layout, { depth: 1 }), run.id).toBe('hidden')
      }
      for (const cluster of clusters) {
        expect(cluster.distribution).toEqual([{ status: 'done', count: cluster.count }])
        expect(cluster.r).toBeLessThan(SPATIAL_METRICS.hub.focus)
      }
    }
  })

  it('shows running, waiting and failed runs on their own, and counts a run with no workflow in its project', () => {
    const { payload, layout } = layoutOf({ level: 'project', projectId: P.prompt }, 24, true)
    const own = payload.nodes.filter((node) => node.kind === 'run' && runNeedsOwnPlace(node))
    expect(own.map((node) => node.status).sort()).toEqual(['awaiting_approval', 'failed', 'failed', 'running'])
    for (const run of own) {
      expect(layout.aggregatedRunIds.has(run.id), run.id).toBe(false)
      expect(spatialNodeVisibility(run, layout, { depth: 1 }), run.id).toBe('visible')
    }
    const orphan = layout.clusters.find((cluster) => cluster.kind === 'no-workflow')!
    expect(orphan.parentId).toBe(hub(P.prompt))
    expect([...orphan.memberIds].sort()).toEqual(['run:tp-orphan-0', 'run:tp-orphan-1'])
    expect(orphan.distribution).toEqual([{ status: 'done', count: 1 }, { status: 'failed', count: 1 }])
    // A pending approval of a waiting run sits beside it, visible.
    const approval = payload.nodes.find((node) => node.kind === 'approval')!
    expect(layout.roles.get(approval.id)).toBe('satellite')
    expect(spatialNodeVisibility(approval, layout, { depth: 1 })).toBe('visible')
  })

  it('shows a counted run only while it is selected, focused or a search result — without moving anything', () => {
    const { payload, layout } = layoutOf({ level: 'project', projectId: P.prompt })
    const run = payload.nodes.find((node) => node.id === 'run:tp-004')!
    expect(layout.aggregatedRunIds.has(run.id)).toBe(true)
    expect(spatialNodeVisibility(run, layout, { depth: 1 })).toBe('hidden')
    expect(spatialNodeVisibility(run, layout, { depth: 1, selectedId: run.id })).toBe('visible')
    expect(spatialNodeVisibility(run, layout, { depth: 1, searchResultId: run.id })).toBe('visible')
    // Selecting its workflow does not spill every counted run onto the canvas.
    expect(spatialNodeVisibility(run, layout, { depth: 1, selectedId: 'workflow:tp-2', neighborIds: new Set([run.id]) })).toBe('hidden')
  })
})

describe('phase 18 T2b · satellites follow the row they belong to', () => {
  const layoutWith = (anchor: SpatialAnchor) => {
    const payload = withSatellites()
    return { payload, layout: computeSpatialLayout({ nodes: payload.nodes, edges: payload.edges, anchor, aspect: 'wide' }) }
  }
  const distance = (layout: SpatialLayout, a: string, b: string) => {
    const pa = layout.positions.get(a)!
    const pb = layout.positions.get(b)!
    return Math.hypot(pa.x - pb.x, pa.y - pb.y)
  }

  it('shows what a counted run produced only with that run — even an output row with no project', () => {
    const { payload, layout } = layoutWith({ level: 'project', projectId: P.prompt })
    expect(layout.aggregatedRunIds.has('run:tp-003')).toBe(true)
    expect(layout.roles.get('output:tp-a')).toBe('satellite')
    expect(layout.shownWithParent.get('output:tp-a')).toBe('run:tp-003')
    // Beside the run's own slot, not on its workflow or cluster.
    const { runRadius, satelliteRadius } = SPATIAL_METRICS.project
    expect(distance(layout, 'output:tp-a', 'run:tp-003')).toBeCloseTo(runRadius + satelliteRadius + 4 + satelliteRadius, 1)
    const output = payload.nodes.find((node) => node.id === 'output:tp-a')!
    for (const depth of [1, PROJECT_REVEAL.satellites, 10]) expect(spatialNodeVisibility(output, layout, { depth }), `depth ${depth}`).toBe('hidden')
    expect(spatialNodeVisibility(output, layout, { depth: 1, selectedId: 'run:tp-003' })).toBe('visible')
    expect(spatialNodeVisibility(output, layout, { depth: 1, searchResultId: 'run:tp-003' })).toBe('visible')
  })

  it('stacks a shown run’s satellites outward, shows three, and brings the rest with the run', () => {
    const { payload, layout } = layoutWith({ level: 'project', projectId: P.prompt })
    const satellites = ['task:tp-a', 'output:tp-f1', 'output:tp-f2', 'output:tp-f3', 'output:tp-f4', 'output:tp-f5']
    for (const id of satellites) expect(layout.roles.get(id), id).toBe('satellite')
    const shown = satellites.filter((id) => !layout.shownWithParent.has(id))
    expect(shown).toHaveLength(3)
    // Closest first, in label order, one line away from the run.
    const byDistance = [...satellites].sort((a, b) => distance(layout, a, 'run:tp-001') - distance(layout, b, 'run:tp-001'))
    expect(byDistance).toEqual(['task:tp-a', 'output:tp-f1', 'output:tp-f2', 'output:tp-f3', 'output:tp-f4', 'output:tp-f5'].sort((a, b) => {
      const label = (id: string) => payload.nodes.find((node) => node.id === id)!.label
      return label(a).localeCompare(label(b), 'sv')
    }))
    const node = (id: string) => payload.nodes.find((candidate) => candidate.id === id)!
    const held = satellites.find((id) => layout.shownWithParent.has(id))!
    expect(spatialNodeVisibility(node(held), layout, { depth: PROJECT_REVEAL.satellites })).toBe('hidden')
    expect(spatialNodeVisibility(node(held), layout, { depth: 1, selectedId: 'run:tp-001' })).toBe('visible')
    expect(spatialNodeVisibility(node(shown[0]), layout, { depth: PROJECT_REVEAL.satellites })).toBe('visible')
  })

  it('never holds back what needs attention: a pending approval shows beside its run, which is never only a count', () => {
    const payload = snapshot(24)
    const nodes: IntelligenceGraphNode[] = [...payload.nodes, { id: 'approval:late', kind: 'approval', label: 'Approval · sen', source: 'runtime', projectId: P.prompt, status: 'pending', metadata: {} }]
    const edges: IntelligenceGraphEdge[] = [...payload.edges, { id: 'run:tp-009→approval:late', source: 'run:tp-009', target: 'approval:late', relation: 'REQUESTED_APPROVAL', confidence: 'DERIVED', metadata: {} }]
    const layout = computeSpatialLayout({ nodes, edges, anchor: { level: 'project', projectId: P.prompt }, aspect: 'wide' })
    // run:tp-009 is stored as done, yet it holds a pending approval.
    expect(nodes.find((node) => node.id === 'run:tp-009')!.status).toBe('done')
    expect(layout.aggregatedRunIds.has('run:tp-009')).toBe(false)
    expect(layout.shownWithParent.has('approval:late')).toBe(false)
    expect(spatialNodeVisibility(nodes.find((node) => node.id === 'approval:late')!, layout, { depth: 1 })).toBe('visible')
  })

  it('never places another project’s satellite inside a drilled project', () => {
    const payload = withSatellites()
    const layout = computeSpatialLayout({ nodes: payload.nodes, edges: payload.edges, anchor: { level: 'project', projectId: P.familjeStunden }, aspect: 'wide' })
    expect(layout.positions.has('output:tp-a')).toBe(false)
    expect(layout.positions.has('task:tp-a')).toBe(false)
  })
})

describe('phase 18 T2b · workflow and run views', () => {
  it('lays a workflow’s runs newest first along one arc and counts what does not fit', () => {
    const { payload, layout } = layoutOf({ level: 'workflow', workflowId: 'workflow:tp-1' }, 24 * 7)
    expect(layout.level).toBe('workflow')
    expect(layout.positions.get('workflow:tp-1')).toMatchObject({ x: 0, y: 0 })
    const runs = runsByWorkflow(payload.nodes, payload.edges).get('workflow:tp-1')!
    const placed = runs.filter((run) => !layout.aggregatedRunIds.has(run.id))
    const older = layout.clusters.find((cluster) => cluster.kind === 'older')!
    expect(placed.length + older.count).toBe(runs.length)
    const createdAt = (run: IntelligenceGraphNode) => Date.parse(String(run.metadata.createdAt))
    const byAngle = [...placed].sort((a, b) => {
      const pa = layout.positions.get(a.id)!
      const pb = layout.positions.get(b.id)!
      return unstretchedAngle(pa.x, pa.y) - unstretchedAngle(pb.x, pb.y)
    })
    for (let index = 1; index < byAngle.length; index++) expect(createdAt(byAngle[index - 1])).toBeGreaterThan(createdAt(byAngle[index]))
    // The older runs really are older than every placed one.
    const newestOlder = Math.max(...older.memberIds.map((id) => createdAt(payload.nodes.find((node) => node.id === id)!)))
    expect(newestOlder).toBeLessThan(Math.min(...placed.map(createdAt)))
  })

  it('puts the agents the definition names opposite the runs, first step on top', () => {
    const { layout } = layoutOf({ level: 'workflow', workflowId: 'workflow:tp-1' })
    const writer = layout.positions.get('agent:tp-writer')!
    const editor = layout.positions.get('agent:tp-editor')!
    expect(writer.x).toBeLessThan(0)
    expect(editor.x).toBeLessThan(0)
    expect(writer.y).toBeLessThan(editor.y)
    expect(layout.hubs.map((value) => value.orbit)).toEqual(['receded'])
    expect(layout.atlas).toMatchObject({ receded: true, linkedHubIds: [] })
  })

  it('opens a run in its workflow with the run in place, and a run without one in its project', () => {
    // The oldest run of its workflow: in the workflow view it would be counted among the older ones.
    expect(layoutOf({ level: 'workflow', workflowId: 'workflow:tp-2' }, 24 * 7).layout.aggregatedRunIds.has('run:tp-085')).toBe(true)
    const withWorkflow = layoutOf({ level: 'run', runId: 'run:tp-085' }, 24 * 7).layout
    expect(withWorkflow.level).toBe('workflow')
    expect(withWorkflow.anchorId).toBe('workflow:tp-2')
    expect(withWorkflow.aggregatedRunIds.has('run:tp-085')).toBe(false)
    expect(withWorkflow.clusters.find((cluster) => cluster.kind === 'older')!.count).toBe(29 - 13)
    const orphan = layoutOf({ level: 'run', runId: 'run:tp-orphan-1' }, 24, true).layout
    expect(orphan.level).toBe('project')
    expect(orphan.anchorId).toBe(hub(P.prompt))
    expect(orphan.aggregatedRunIds.has('run:tp-orphan-1')).toBe(false)
  })
})

describe('phase 18 T2b · semantic levels', () => {
  it('changes information density with the level and the zoom depth, not with pixels alone', () => {
    expect(spatialDensityLevel('portfolio', 1)).toBe('portfolio')
    expect(spatialDensityLevel('portfolio', PORTFOLIO_REVEAL.workflows)).toBe('project')
    expect(spatialDensityLevel('portfolio', PORTFOLIO_REVEAL.agents)).toBe('operational')
    expect(spatialDensityLevel('portfolio', PORTFOLIO_REVEAL.satellites)).toBe('detail')
    expect(spatialDensityLevel('project', 1)).toBe('project')
    expect(spatialDensityLevel('project', PROJECT_REVEAL.agentLabels)).toBe('operational')
    expect(spatialDensityLevel('project', PROJECT_REVEAL.satellites)).toBe('detail')
    expect(spatialEdgeLevel('project', 1)).toBe('operational')
    expect(spatialDensityLevel('workflow', 1)).toBe('operational')
    expect(spatialDensityLevel('workflow', 1, true)).toBe('execution')
  })

  it('names the level to the operator as portfolio, project or detail', () => {
    expect(spatialReportedLevel('portfolio', 1)).toBe('portfolio')
    expect(spatialReportedLevel('project', 1)).toBe('project')
    expect(spatialReportedLevel('project', PROJECT_REVEAL.agentLabels)).toBe('project')
    expect(spatialReportedLevel('workflow', 1)).toBe('detail')
    expect(spatialReportedLevel('workflow', 1, true)).toBe('execution')
  })
})

describe('phase 18 T2c · a phone opens a crowded project by its core', () => {
  const neighboursOf = (edges: readonly IntelligenceGraphEdge[], id: string) => new Set([id, ...edges.filter((edge) => edge.source === id || edge.target === id).flatMap((edge) => [edge.source, edge.target])])

  it('brings a crowded project’s agents with zoom, as their names come — and keeps them all on a wide canvas', () => {
    const { payload, layout } = layoutOf({ level: 'project', projectId: P.familjeStunden })
    const agent = payload.nodes.find((node) => node.id === 'agent:fs-01')!
    const workflow = payload.nodes.find((node) => node.id === 'workflow:fs-1')!
    expect(spatialNodeVisibility(agent, layout, { depth: 1, compactAgents: true })).toBe('hidden')
    expect(spatialNodeVisibility(agent, layout, { depth: PROJECT_REVEAL.agentLabels, compactAgents: true })).toBe('visible')
    expect(spatialNodeVisibility(workflow, layout, { depth: 1, compactAgents: true })).toBe('visible')
    expect(spatialNodeVisibility(agent, layout, { depth: 1 })).toBe('visible')
    // Asked for, it is shown.
    expect(spatialNodeVisibility(agent, layout, { depth: 1, compactAgents: true, selectedId: agent.id })).toBe('visible')
    expect(spatialNodeVisibility(agent, layout, { depth: 1, compactAgents: true, searchResultId: agent.id })).toBe('visible')
  })

  it('does not unfold them when the drilled project itself is selected, but shows what a selected workflow names', () => {
    const { payload, layout } = layoutOf({ level: 'project', projectId: P.familjeStunden })
    const fsHub = hub(P.familjeStunden)
    const agents = payload.nodes.filter((node) => node.kind === 'agent' && node.projectId === P.familjeStunden)
    const fromHub = neighboursOf(payload.edges, fsHub)
    expect(agents.filter((agent) => spatialNodeVisibility(agent, layout, { depth: 1, compactAgents: true, selectedId: fsHub, neighborIds: fromHub }) !== 'hidden')).toEqual([])
    // On a wide canvas the drilled project's selection hides nothing either — it never did.
    expect(agents.every((agent) => spatialNodeVisibility(agent, layout, { depth: 1, selectedId: fsHub, neighborIds: fromHub }) === 'visible')).toBe(true)
    const fromWorkflow = neighboursOf(payload.edges, 'workflow:fs-1')
    const named = agents.filter((agent) => fromWorkflow.has(agent.id))
    expect(named).toHaveLength(5)
    for (const agent of named) {
      expect(spatialNodeVisibility(agent, layout, { depth: 1, compactAgents: true, selectedId: 'workflow:fs-1', neighborIds: fromWorkflow }), agent.id).toBe('visible')
    }
  })
})
