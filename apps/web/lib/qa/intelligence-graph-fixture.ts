import type { IntelligenceGraphEdge, IntelligenceGraphNode } from '@/lib/intelligence/graph-contract'

/**
 * A runtime graph payload in exactly the shapes `buildOperationsGraph`
 * (lib/intelligence/operations-graph.ts) emits: `kind:uuid` node ids, the
 * builder's metadata keys, stored statuses, and one edge per relation it
 * derives — including a DELEGATED_TO edge carrying its step metadata and a
 * TRACKS edge from a task to a run. Test-only; nothing here reaches the app.
 */

export const FIXTURE_PROJECT_A = '11111111-1111-4111-8111-111111111111'
export const FIXTURE_PROJECT_B = '22222222-2222-4222-8222-222222222222'

const A = FIXTURE_PROJECT_A
const B = FIXTURE_PROJECT_B

export const OPERATIONS_FIXTURE_NODES: IntelligenceGraphNode[] = [
  { id: `project:${A}`, kind: 'project', label: 'The Prompt', source: 'runtime', projectId: A, metadata: { slug: 'ai-media-automation', color: '#8b5cf6' } },
  { id: `project:${B}`, kind: 'project', label: 'Familje-Stunden', source: 'runtime', projectId: B, metadata: { slug: 'familje-stunden', color: '#34d399' } },
  { id: 'agent:a1', kind: 'agent', label: 'Skribent', source: 'runtime', projectId: A, metadata: { model: 'claude-sonnet-4-6', description: null } },
  { id: 'agent:a2', kind: 'agent', label: 'Faktagranskare', source: 'runtime', projectId: A, metadata: { model: 'claude-sonnet-4-6', description: null } },
  { id: 'agent:b1', kind: 'agent', label: 'Illustratör', source: 'runtime', projectId: B, metadata: { model: null, description: null } },
  { id: 'workflow:w1', kind: 'workflow', label: 'Daglig artikel', source: 'runtime', projectId: A, status: 'active', metadata: { trigger: 'cron' } },
  { id: 'workflow:w2', kind: 'workflow', label: 'Månadssläpp', source: 'runtime', projectId: B, status: 'inactive', metadata: { trigger: 'manual' } },
  { id: 'run:r1', kind: 'run', label: 'Daglig artikel · r1000001', source: 'runtime', projectId: A, status: 'done', metadata: { createdAt: '2026-09-16T06:00:00.000Z', startedAt: '2026-09-16T06:00:02.000Z', finishedAt: '2026-09-16T06:04:10.000Z', error: null, attempts: 1, kind: 'workflow', projectName: 'The Prompt' } },
  { id: 'run:r2', kind: 'run', label: 'Daglig artikel · r2000002', source: 'runtime', projectId: A, status: 'failed', metadata: { createdAt: '2026-09-16T07:00:00.000Z', startedAt: null, finishedAt: null, error: 'Provider timeout', attempts: 2, kind: 'workflow', projectName: 'The Prompt' } },
  { id: 'run:r3', kind: 'run', label: 'Månadssläpp · r3000003', source: 'runtime', projectId: B, status: 'awaiting_approval', metadata: { createdAt: '2026-09-16T08:00:00.000Z', startedAt: null, finishedAt: null, error: null, attempts: 1, kind: 'workflow', projectName: 'Familje-Stunden' } },
  { id: 'run:r4', kind: 'run', label: 'Daglig artikel · r4000004', source: 'runtime', projectId: A, status: 'running', metadata: { createdAt: '2026-09-16T09:00:00.000Z', startedAt: '2026-09-16T09:00:01.000Z', finishedAt: null, error: null, attempts: 1, kind: 'workflow', projectName: 'The Prompt' } },
  { id: 'approval:ap1', kind: 'approval', label: 'Approval · story_draft', source: 'runtime', projectId: B, status: 'pending', metadata: { kind: 'workflow', createdAt: '2026-09-16T08:05:00.000Z', reviewedAt: null, operator: null } },
  { id: 'approval:ap2', kind: 'approval', label: 'Approval · article', source: 'runtime', projectId: A, status: 'approved', metadata: { kind: 'article_publish', createdAt: '2026-09-16T06:05:00.000Z', reviewedAt: '2026-09-16T06:30:00.000Z', operator: 'Andre' } },
  { id: 'output:o1', kind: 'output', label: 'artikel.md', source: 'runtime', projectId: A, metadata: { type: 'markdown', createdAt: '2026-09-16T06:04:00.000Z' } },
  { id: 'task:t1', kind: 'task', label: 'Följ upp timeout', source: 'runtime', projectId: A, status: 'pending', metadata: { priority: 'high', createdAt: '2026-09-16T07:10:00.000Z' } },
]

export const OPERATIONS_FIXTURE_EDGES: IntelligenceGraphEdge[] = [
  { id: `project:${A}→agent:a1`, source: `project:${A}`, target: 'agent:a1', relation: 'CONTAINS', confidence: 'DERIVED', metadata: {} },
  { id: `project:${A}→agent:a2`, source: `project:${A}`, target: 'agent:a2', relation: 'CONTAINS', confidence: 'DERIVED', metadata: {} },
  { id: `project:${B}→agent:b1`, source: `project:${B}`, target: 'agent:b1', relation: 'CONTAINS', confidence: 'DERIVED', metadata: {} },
  { id: `project:${A}→workflow:w1`, source: `project:${A}`, target: 'workflow:w1', relation: 'CONTAINS', confidence: 'DERIVED', metadata: {} },
  { id: `project:${B}→workflow:w2`, source: `project:${B}`, target: 'workflow:w2', relation: 'CONTAINS', confidence: 'DERIVED', metadata: {} },
  { id: 'workflow:w1→agent:a1', source: 'workflow:w1', target: 'agent:a1', relation: 'DELEGATED_TO', confidence: 'DERIVED', metadata: { step: 'Skriv utkast', order: 1 } },
  { id: 'workflow:w1→agent:a2', source: 'workflow:w1', target: 'agent:a2', relation: 'DELEGATED_TO', confidence: 'DERIVED', metadata: { step: 'Faktagranska', order: 2 } },
  { id: 'workflow:w2→agent:b1', source: 'workflow:w2', target: 'agent:b1', relation: 'DELEGATED_TO', confidence: 'DERIVED', metadata: { step: 'Illustrera', order: 1 } },
  { id: 'workflow:w1→run:r1', source: 'workflow:w1', target: 'run:r1', relation: 'STARTED', confidence: 'DERIVED', timestamp: '2026-09-16T06:00:00.000Z', metadata: {} },
  { id: 'workflow:w1→run:r2', source: 'workflow:w1', target: 'run:r2', relation: 'STARTED', confidence: 'DERIVED', timestamp: '2026-09-16T07:00:00.000Z', metadata: {} },
  { id: 'workflow:w2→run:r3', source: 'workflow:w2', target: 'run:r3', relation: 'STARTED', confidence: 'DERIVED', timestamp: '2026-09-16T08:00:00.000Z', metadata: {} },
  { id: 'workflow:w1→run:r4', source: 'workflow:w1', target: 'run:r4', relation: 'STARTED', confidence: 'DERIVED', timestamp: '2026-09-16T09:00:00.000Z', metadata: {} },
  { id: 'run:r3→approval:ap1', source: 'run:r3', target: 'approval:ap1', relation: 'REQUESTED_APPROVAL', confidence: 'DERIVED', timestamp: '2026-09-16T08:05:00.000Z', metadata: {} },
  { id: 'run:r1→approval:ap2', source: 'run:r1', target: 'approval:ap2', relation: 'REQUESTED_APPROVAL', confidence: 'DERIVED', timestamp: '2026-09-16T06:05:00.000Z', metadata: {} },
  { id: 'run:r1→output:o1', source: 'run:r1', target: 'output:o1', relation: 'PRODUCED', confidence: 'DERIVED', timestamp: '2026-09-16T06:04:00.000Z', metadata: {} },
  { id: 'task:t1→run:r2', source: 'task:t1', target: 'run:r2', relation: 'TRACKS', confidence: 'DERIVED', timestamp: '2026-09-16T07:10:00.000Z', metadata: {} },
]

/** The operations route's response envelope around the graph. */
export const OPERATIONS_FIXTURE_PAYLOAD = {
  available: true,
  projects: [
    { id: A, name: 'The Prompt', slug: 'ai-media-automation', color: '#8b5cf6' },
    { id: B, name: 'Familje-Stunden', slug: 'familje-stunden', color: '#34d399' },
  ],
  meta: {
    source: 'runtime' as const,
    generatedAt: '2026-09-16T09:12:34.000Z',
    nodeCount: OPERATIONS_FIXTURE_NODES.length,
    edgeCount: OPERATIONS_FIXTURE_EDGES.length,
  },
  nodes: OPERATIONS_FIXTURE_NODES,
  edges: OPERATIONS_FIXTURE_EDGES,
}

/** A small static (Graphify) graph: two communities, one extracted and one inferred edge. */
export const SYSTEM_FIXTURE_NODES: IntelligenceGraphNode[] = [
  { id: 'c:lib/intelligence/graph-contract.ts', kind: 'code', label: 'graph-contract.ts', source: 'graphify', community: 1, sourceFile: 'apps/web/lib/intelligence/graph-contract.ts', sourceLocation: 'L1', degree: 4, metadata: {} },
  { id: 'c:lib/intelligence/operations-graph.ts', kind: 'code', label: 'operations-graph.ts', source: 'graphify', community: 1, sourceFile: 'apps/web/lib/intelligence/operations-graph.ts', sourceLocation: 'L1', degree: 3, metadata: {} },
  { id: 'd:docs/intelligence-graph.md', kind: 'document', label: 'intelligence-graph.md', source: 'graphify', community: 2, sourceFile: 'docs/intelligence-graph.md', degree: 2, metadata: {} },
  { id: 'r:truth-before-spectacle', kind: 'rationale', label: 'Operativ sanning före spektakel', source: 'graphify', community: 2, degree: 1, metadata: {} },
]

export const SYSTEM_FIXTURE_EDGES: IntelligenceGraphEdge[] = [
  { id: 'e1', source: 'c:lib/intelligence/operations-graph.ts', target: 'c:lib/intelligence/graph-contract.ts', relation: 'imports_from', confidence: 'EXTRACTED', metadata: {} },
  { id: 'e2', source: 'd:docs/intelligence-graph.md', target: 'c:lib/intelligence/graph-contract.ts', relation: 'references', confidence: 'INFERRED', metadata: {} },
  { id: 'e3', source: 'r:truth-before-spectacle', target: 'd:docs/intelligence-graph.md', relation: 'rationale_for', confidence: 'EXTRACTED', metadata: {} },
]

export const SYSTEM_FIXTURE_PAYLOAD = {
  available: true,
  level: 'overview',
  meta: {
    source: 'graphify' as const,
    generatedAt: '2026-09-10T12:00:00.000Z',
    builtAtCommit: '430259e6be75911b5414e615685e591e42b2d7df',
    nodeCount: SYSTEM_FIXTURE_NODES.length,
    edgeCount: SYSTEM_FIXTURE_EDGES.length,
  },
  nodes: SYSTEM_FIXTURE_NODES,
  edges: SYSTEM_FIXTURE_EDGES,
}

/** What `/api/intelligence/graph/system` answers when no artifact is deployed. */
export const SYSTEM_UNAVAILABLE_PAYLOAD = {
  available: false,
  reason: 'missing',
  hint: 'No system-graph.json artifact is available.',
}

// ─── Production-shaped runtime payload (Phase 18 T2b) ────────────────────────
//
// The shape of production on 2026-09-16, with synthetic names:
//  - four owned projects:
//    - The Prompt: 2 agents, 6 workflows, and every run in the window
//    - Familje-Stunden: 33 agents with long "[Preview]" names, 5 active workflows naming 25 of them
//    - GainPilot: no agents and no workflows
//    - AUDIT 0b: 2 inactive manual workflows
//  - 13, 86 or 120 done runs for 24 h, 7 d or 30 d
//
// `attention` adds a running, a failed and an awaiting run (with its pending
// approval) plus two runs without a workflow. It is used only to prove how
// those are placed; production has none today. Test-only.

export const PROD_SHAPED_PROJECTS = {
  prompt: 'bbbbbbbb-0000-4000-8000-000000000001',
  familjeStunden: 'bbbbbbbb-0000-4000-8000-000000000002',
  gainPilot: 'bbbbbbbb-0000-4000-8000-000000000003',
  audit: 'bbbbbbbb-0000-4000-8000-000000000004',
} as const

const PROD_SHAPED_PROJECT_ROWS = [
  { id: PROD_SHAPED_PROJECTS.prompt, name: 'The Prompt', slug: 'ai-media-automation', color: '#8b5cf6' },
  { id: PROD_SHAPED_PROJECTS.familjeStunden, name: 'Familje-Stunden', slug: 'familje-stunden', color: '#34d399' },
  { id: PROD_SHAPED_PROJECTS.gainPilot, name: 'GainPilot', slug: 'gainpilot', color: '#d4a574' },
  { id: PROD_SHAPED_PROJECTS.audit, name: 'AUDIT 0b', slug: 'omnira-selftest', color: '#6b7280' },
]

const FAMILY_ROLES = [
  'Veckoplanerare för familjeaktiviteter', 'Receptförslag och inköpslistor', 'Läxhjälp och studieplanering',
  'Barnens sömnrutiner', 'Helgutflykter i närområdet', 'Familjebudget och sparmål', 'Kalendersamordning',
  'Födelsedagsplanering', 'Skärmtidsöverenskommelser', 'Hushållssysslor och scheman', 'Fritidsaktiviteter',
  'Semesterplanering', 'Måltidsplanering vardag', 'Samtalsstöd syskon', 'Lästips för barn och unga',
  'Pysselidéer regniga dagar', 'Motion och utevistelse', 'Föräldrastöd tonår', 'Traditioner och högtider',
  'Kompisträffar och kalas', 'Digital trygghet för barn', 'Morgonrutiner utan stress', 'Kvällsrutiner och läggning',
  'Familjeråd och beslut', 'Månadsbrev till familjen', 'Minnesalbum och foton', 'Trädgård och odling med barn',
  'Husdjur och ansvar', 'Hälsa och vårdkontakter', 'Städschema storstädning', 'Resor med små barn',
  'Kultur och museibesök', 'Förberedelser inför skolstart',
]

const PROMPT_WORKFLOWS = ['Daglig short', 'Veckosammanfattning', 'Nyhetsbrev', 'Trendbevakning', 'Publiceringskö', 'Arkivering']
const FAMILY_WORKFLOWS = ['Veckans familjeplan', 'Måltider och inköp', 'Skola och läxor', 'Helg och fritid', 'Månadsbrev']

export function productionShapedOperations(hours = 24, options: { attention?: boolean } = {}) {
  const P = PROD_SHAPED_PROJECTS
  const base = Date.parse('2026-09-16T19:07:00.000Z')
  const nodes: IntelligenceGraphNode[] = []
  const edges: IntelligenceGraphEdge[] = []
  const contains = (projectId: string, target: string) => edges.push({
    id: `project:${projectId}→${target}`, source: `project:${projectId}`, target, relation: 'CONTAINS', confidence: 'DERIVED', metadata: {},
  })

  for (const row of PROD_SHAPED_PROJECT_ROWS) {
    nodes.push({ id: `project:${row.id}`, kind: 'project', label: row.name, source: 'runtime', projectId: row.id, metadata: { slug: row.slug, color: row.color } })
  }
  FAMILY_ROLES.forEach((role, index) => {
    const id = `agent:fs-${String(index + 1).padStart(2, '0')}`
    nodes.push({ id, kind: 'agent', label: `[Preview] ${role}`, source: 'runtime', projectId: P.familjeStunden, metadata: { model: 'claude-sonnet-4-6', description: null } })
    contains(P.familjeStunden, id)
  })
  for (const [id, label] of [['agent:tp-writer', 'Manusförfattare'], ['agent:tp-editor', 'Redaktör']]) {
    nodes.push({ id, kind: 'agent', label, source: 'runtime', projectId: P.prompt, metadata: { model: 'claude-sonnet-4-6', description: null } })
    contains(P.prompt, id)
  }
  FAMILY_WORKFLOWS.forEach((name, workflowIndex) => {
    const id = `workflow:fs-${workflowIndex + 1}`
    nodes.push({ id, kind: 'workflow', label: name, source: 'runtime', projectId: P.familjeStunden, status: 'active', metadata: { trigger: workflowIndex === 4 ? 'cron' : 'manual' } })
    contains(P.familjeStunden, id)
    for (let step = 0; step < 5; step++) {
      const agent = `agent:fs-${String(workflowIndex * 6 + step + 1).padStart(2, '0')}`
      edges.push({ id: `${id}→${agent}`, source: id, target: agent, relation: 'DELEGATED_TO', confidence: 'DERIVED', metadata: { step: `Steg ${step + 1}`, order: step + 1 } })
    }
  })
  PROMPT_WORKFLOWS.forEach((name, workflowIndex) => {
    const id = `workflow:tp-${workflowIndex + 1}`
    nodes.push({ id, kind: 'workflow', label: name, source: 'runtime', projectId: P.prompt, status: workflowIndex < 4 ? 'active' : 'inactive', metadata: { trigger: workflowIndex === 0 ? 'cron' : 'manual' } })
    contains(P.prompt, id)
    if (workflowIndex < 3) {
      edges.push({ id: `${id}→agent:tp-writer`, source: id, target: 'agent:tp-writer', relation: 'DELEGATED_TO', confidence: 'DERIVED', metadata: { step: 'Skriv', order: 1 } })
    }
    if (workflowIndex < 2) {
      edges.push({ id: `${id}→agent:tp-editor`, source: id, target: 'agent:tp-editor', relation: 'DELEGATED_TO', confidence: 'DERIVED', metadata: { step: 'Granska', order: 2 } })
    }
  })
  for (const [id, label] of [['workflow:audit-a', 'AUDIT 0b — TEST A (non_destructive)'], ['workflow:audit-b', 'AUDIT 0b — TEST B (approval_required)']]) {
    nodes.push({ id, kind: 'workflow', label, source: 'runtime', projectId: P.audit, status: 'inactive', metadata: { trigger: 'manual' } })
    contains(P.audit, id)
  }

  const runCount = hours <= 24 ? 13 : hours <= 24 * 7 ? 86 : 120
  for (let index = 0; index < runCount; index++) {
    const workflowIndex = index % 3
    const workflowId = `workflow:tp-${workflowIndex + 1}`
    const createdAt = new Date(base - (index + 1) * Math.floor((hours * 3_600_000) / (runCount + 2))).toISOString()
    const id = `run:tp-${String(index).padStart(3, '0')}`
    const status = options.attention && index === 0 ? 'running' : options.attention && index === 1 ? 'failed' : options.attention && index === 2 ? 'awaiting_approval' : 'done'
    nodes.push({
      id, kind: 'run', label: `${PROMPT_WORKFLOWS[workflowIndex]} · r${String(7000000 + index)}`, source: 'runtime', projectId: P.prompt, status,
      metadata: { createdAt, startedAt: createdAt, finishedAt: status === 'done' ? createdAt : null, error: status === 'failed' ? 'Provider timeout' : null, attempts: 1, kind: 'workflow', projectName: 'The Prompt' },
    })
    edges.push({ id: `${workflowId}→${id}`, source: workflowId, target: id, relation: 'STARTED', confidence: 'DERIVED', timestamp: createdAt, metadata: {} })
    if (status === 'awaiting_approval') {
      const approval = `approval:tp-${index}`
      nodes.push({ id: approval, kind: 'approval', label: 'Approval · story_draft', source: 'runtime', projectId: P.prompt, status: 'pending', metadata: { kind: 'workflow', createdAt, reviewedAt: null, operator: null } })
      edges.push({ id: `${id}→${approval}`, source: id, target: approval, relation: 'REQUESTED_APPROVAL', confidence: 'DERIVED', timestamp: createdAt, metadata: {} })
    }
  }
  if (options.attention) {
    for (const index of [0, 1]) {
      const createdAt = new Date(base - (index + 1) * 900_000).toISOString()
      nodes.push({
        id: `run:tp-orphan-${index}`, kind: 'run', label: `run tporph${index}`, source: 'runtime', projectId: P.prompt, status: index === 0 ? 'failed' : 'done',
        metadata: { createdAt, startedAt: createdAt, finishedAt: createdAt, error: index === 0 ? 'Saknar workflow' : null, attempts: 1, kind: 'adhoc', projectName: 'The Prompt' },
      })
    }
  }

  return {
    available: true,
    projects: PROD_SHAPED_PROJECT_ROWS,
    meta: { source: 'runtime' as const, generatedAt: new Date(base).toISOString(), nodeCount: nodes.length, edgeCount: edges.length },
    nodes,
    edges,
  }
}

// ─── Label stress payload (Phase 18 T2c) ─────────────────────────────────────
//
// Not production's shape: a synthetic worst case for the spatial view's labels,
// in the builder's shapes. Seven projects, several with long names (one with no
// place to break); a crowded project with 12 long-named workflows, 30 agents
// (8 named by no workflow) and runs that need attention on six workflows at
// once, plus runs without a workflow and outputs beside done runs; a project
// with exactly AGENT_NAMES_AT_OVERVIEW long-named agents, so they are named from
// its first view. Test-only.

export const LABEL_STRESS_PROJECTS = {
  crowded: 'cccccccc-0000-4000-8000-000000000001',
  named: 'cccccccc-0000-4000-8000-000000000002',
  research: 'cccccccc-0000-4000-8000-000000000003',
  empty: 'cccccccc-0000-4000-8000-000000000004',
  internal: 'cccccccc-0000-4000-8000-000000000005',
  unbroken: 'cccccccc-0000-4000-8000-000000000006',
  family: 'cccccccc-0000-4000-8000-000000000007',
} as const

const LABEL_STRESS_PROJECT_ROWS = [
  { id: LABEL_STRESS_PROJECTS.crowded, name: 'Nordisk Kundservice och Supportautomation', slug: 'nordisk-kundservice', color: '#22d3ee' },
  { id: LABEL_STRESS_PROJECTS.named, name: 'Q4-kampanj för Återförsäljare', slug: 'q4-kampanj', color: '#f472b6' },
  { id: LABEL_STRESS_PROJECTS.research, name: 'Forskningsstöd — Medicinsk litteratur', slug: 'forskningsstod', color: '#a3e635' },
  { id: LABEL_STRESS_PROJECTS.empty, name: 'Ekonomi', slug: 'ekonomi', color: '#fbbf24' },
  { id: LABEL_STRESS_PROJECTS.internal, name: 'Internt verktygsstöd', slug: 'internt', color: '#6b7280' },
  { id: LABEL_STRESS_PROJECTS.unbroken, name: 'MMMMMMMMMMMMMMMMMMMMMMMM', slug: 'mmmm', color: '#8b5cf6' },
  { id: LABEL_STRESS_PROJECTS.family, name: 'Familje-Stunden', slug: 'familje-stunden', color: '#34d399' },
]

const CROWDED_WORKFLOWS = [
  'Inkommande ärenden – prioritering och routing', 'Svarsförslag till kund', 'Eskalering till specialist',
  'Kvalitetsgranskning av svar', 'Veckorapport kundnöjdhet', 'Kunskapsbas: uppdatering av artiklar',
  'Återkoppling från produktteam', 'SLA-bevakning', 'Språkgranskning (svenska, norska, danska)',
  'Churn-signaler i ärendehistorik', 'Enkätutskick efter avslutat ärende', 'Arkivering av stängda ärenden',
]
const CROWDED_ROLES = [
  'Ärendeklassificerare', 'Tonalitetsgranskare för kundsvar', 'Specialist på fakturafrågor', 'Översättare nordiska språk',
  'Sammanfattare av långa trådar', 'Kunskapsbasredaktör', 'SLA-vakt', 'Produktfeedbackanalytiker',
]
const NAMED_AGENTS = [
  'Kampanjstrateg för återförsäljarkanalen', 'Copywriter sociala medier', 'Bildbeskrivare och alt-text',
  'Budgetanalytiker Q4', 'Juridisk granskning av erbjudanden', 'Översättare finska', 'Återförsäljarkontakt', 'Rapportskrivare',
]

export function labelStressOperations() {
  const P = LABEL_STRESS_PROJECTS
  const base = Date.parse('2026-09-16T19:07:00.000Z')
  const nodes: IntelligenceGraphNode[] = []
  const edges: IntelligenceGraphEdge[] = []
  const contains = (projectId: string, target: string) => edges.push({
    id: `project:${projectId}→${target}`, source: `project:${projectId}`, target, relation: 'CONTAINS', confidence: 'DERIVED', metadata: {},
  })
  const agent = (projectId: string, id: string, label: string) => {
    nodes.push({ id, kind: 'agent', label, source: 'runtime', projectId, metadata: { model: 'claude-sonnet-4-6', description: null } })
    contains(projectId, id)
  }
  const workflow = (projectId: string, id: string, label: string, status: 'active' | 'inactive' = 'active') => {
    nodes.push({ id, kind: 'workflow', label, source: 'runtime', projectId, status, metadata: { trigger: 'manual' } })
    contains(projectId, id)
  }
  const delegate = (workflowId: string, agentId: string, order: number) => edges.push({
    id: `${workflowId}→${agentId}`, source: workflowId, target: agentId, relation: 'DELEGATED_TO', confidence: 'DERIVED', metadata: { step: `Steg ${order}`, order },
  })
  let minute = 0
  const run = (projectId: string, projectName: string, id: string, label: string, status: string, workflowId: string | null) => {
    minute += 17
    const createdAt = new Date(base - minute * 60_000).toISOString()
    nodes.push({
      id, kind: 'run', label, source: 'runtime', projectId, status,
      metadata: { createdAt, startedAt: createdAt, finishedAt: status === 'done' ? createdAt : null, error: status === 'failed' ? 'Provider timeout' : null, attempts: 1, kind: workflowId ? 'workflow' : 'adhoc', projectName },
    })
    if (workflowId) edges.push({ id: `${workflowId}→${id}`, source: workflowId, target: id, relation: 'STARTED', confidence: 'DERIVED', timestamp: createdAt, metadata: {} })
    if (status === 'awaiting_approval') {
      nodes.push({ id: `approval:${id}`, kind: 'approval', label: 'Approval · customer_reply', source: 'runtime', projectId, status: 'pending', metadata: { kind: 'workflow', createdAt, reviewedAt: null, operator: null } })
      edges.push({ id: `${id}→approval:${id}`, source: id, target: `approval:${id}`, relation: 'REQUESTED_APPROVAL', confidence: 'DERIVED', timestamp: createdAt, metadata: {} })
    }
    if (status === 'done' && minute % 3 === 0) {
      nodes.push({ id: `output:${id}`, kind: 'output', label: `svarsutkast-${id.slice(-6)}.md`, source: 'runtime', projectId, metadata: { type: 'text', createdAt } })
      edges.push({ id: `${id}→output:${id}`, source: id, target: `output:${id}`, relation: 'PRODUCED', confidence: 'DERIVED', timestamp: createdAt, metadata: {} })
    }
  }

  for (const row of LABEL_STRESS_PROJECT_ROWS) {
    nodes.push({ id: `project:${row.id}`, kind: 'project', label: row.name, source: 'runtime', projectId: row.id, metadata: { slug: row.slug, color: row.color } })
  }

  // Crowded: 30 agents, 12 workflows naming 22 of them, attention on six workflows at once.
  for (let index = 0; index < 30; index++) {
    agent(P.crowded, `agent:nk-${String(index + 1).padStart(2, '0')}`, `${CROWDED_ROLES[index % CROWDED_ROLES.length]} ${Math.floor(index / CROWDED_ROLES.length) + 1}`)
  }
  const attention = ['running', 'failed', 'awaiting_approval', 'failed', 'running', 'cancelled']
  CROWDED_WORKFLOWS.forEach((name, workflowIndex) => {
    const id = `workflow:nk-${String(workflowIndex + 1).padStart(2, '0')}`
    workflow(P.crowded, id, name, workflowIndex === 11 ? 'inactive' : 'active')
    for (let step = 0; step < 2; step++) delegate(id, `agent:nk-${String(((workflowIndex * 2 + step) % 22) + 1).padStart(2, '0')}`, step + 1)
    const runs = 3 + ((workflowIndex * 5) % 9)
    for (let index = 0; index < runs; index++) {
      const status = index === 0 && workflowIndex < attention.length ? attention[workflowIndex] : index === 1 && workflowIndex === 3 ? 'failed' : 'done'
      run(P.crowded, 'Nordisk Kundservice och Supportautomation', `run:nk-${workflowIndex + 1}-${index}`, `${name} · r${String(8100000 + workflowIndex * 100 + index)}`, status, id)
    }
  })
  for (const [index, status] of ['failed', 'done', 'done'].entries()) {
    run(P.crowded, 'Nordisk Kundservice och Supportautomation', `run:nk-orphan-${index}`, `run nkorph${index}`, status, null)
  }

  // Named: exactly eight long-named agents, so they are named from the first view.
  NAMED_AGENTS.forEach((name, index) => agent(P.named, `agent:q4-${index + 1}`, name))
  ;['Kampanjplan', 'Annonsmaterial för sociala medier', 'Budgetuppföljning', 'Återförsäljarbrev'].forEach((name, workflowIndex) => {
    const id = `workflow:q4-${workflowIndex + 1}`
    workflow(P.named, id, name)
    for (let step = 0; step < 3; step++) delegate(id, `agent:q4-${((workflowIndex * 2 + step) % 8) + 1}`, step + 1)
    for (let index = 0; index < 4; index++) {
      const status = index === 0 && workflowIndex === 0 ? 'running' : index === 0 && workflowIndex === 1 ? 'failed' : 'done'
      run(P.named, 'Q4-kampanj för Återförsäljare', `run:q4-${workflowIndex + 1}-${index}`, `${name} · r${String(8200000 + workflowIndex * 100 + index)}`, status, id)
    }
  })

  // Research: small and quiet in the window.
  ;['Litteratursökning PubMed', 'Sammanfattning av studier', 'Referenshantering'].forEach((name, index) => {
    agent(P.research, `agent:fs-r${index + 1}`, `Forskningsassistent ${index + 1}`)
    workflow(P.research, `workflow:fs-r${index + 1}`, name)
    delegate(`workflow:fs-r${index + 1}`, `agent:fs-r${index + 1}`, 1)
    run(P.research, 'Forskningsstöd — Medicinsk litteratur', `run:fs-r${index + 1}`, `${name} · r${8300000 + index}`, 'done', `workflow:fs-r${index + 1}`)
  })

  // Internal: two inactive workflows. Unbroken: one workflow, one running run.
  workflow(P.internal, 'workflow:int-1', 'Verktygsinventering (manuell)', 'inactive')
  workflow(P.internal, 'workflow:int-2', 'Licensgranskning (manuell)', 'inactive')
  workflow(P.unbroken, 'workflow:mm-1', 'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWW')
  run(P.unbroken, 'MMMMMMMMMMMMMMMMMMMMMMMM', 'run:mm-1', 'WWWWWWWWWWWWWWWWWWWWWWWWWWWWWW · r8400000', 'running', 'workflow:mm-1')

  // Family: twelve agents, five workflows.
  for (let index = 0; index < 12; index++) agent(P.family, `agent:fam-${index + 1}`, `[Preview] Familjeassistent nummer ${index + 1}`)
  ;['Veckans familjeplan', 'Måltider och inköp', 'Skola och läxor', 'Helg och fritid', 'Månadsbrev'].forEach((name, workflowIndex) => {
    const id = `workflow:fam-${workflowIndex + 1}`
    workflow(P.family, id, name)
    delegate(id, `agent:fam-${workflowIndex * 2 + 1}`, 1)
    delegate(id, `agent:fam-${workflowIndex * 2 + 2}`, 2)
  })

  return {
    available: true,
    projects: LABEL_STRESS_PROJECT_ROWS,
    meta: { source: 'runtime' as const, generatedAt: new Date(base).toISOString(), nodeCount: nodes.length, edgeCount: edges.length },
    nodes,
    edges,
  }
}
