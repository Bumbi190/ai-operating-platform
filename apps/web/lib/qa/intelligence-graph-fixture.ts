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
