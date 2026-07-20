import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => {
  class OperationsGraphLimitError extends Error {}
  return {
    createClient: vi.fn(),
    createAdminClient: vi.fn(),
    buildOperationsGraph: vi.fn(),
    OperationsGraphLimitError,
  }
})

vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: mocks.createAdminClient }))
vi.mock('@/lib/intelligence/operations-graph', () => ({
  DEFAULT_WINDOW: { hours: 24, maxRuns: 120 },
  buildOperationsGraph: mocks.buildOperationsGraph,
  OperationsGraphLimitError: mocks.OperationsGraphLimitError,
}))

import { GET } from '@/app/api/intelligence/graph/operations/route'

const SNAPSHOT = {
  generatedAt: '2026-07-14T10:00:00.000Z',
  requestedHours: 24,
  authorizedProjectIds: ['project-1'],
  appliedProjectId: null,
  returnedProjectIds: ['project-1'],
  queriedSources: ['projects', 'agents', 'workflows', 'runs'],
  delivery: 'snapshot_only' as const,
  sourceFreshness: 'unknown' as const,
  capabilities: {
    realtime: false as const, polling: true as const, incidents: false as const, toolCalls: false as const,
    atlasRuntime: false as const, managerRuntime: false as const, correlation: false as const, causation: false as const, replay: false as const,
  },
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.createClient.mockResolvedValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) } })
  mocks.createAdminClient.mockReturnValue({})
  mocks.buildOperationsGraph.mockResolvedValue({
    projects: [{ id: 'project-1', name: 'Project', slug: 'project', color: '#fff' }],
    snapshot: SNAPSHOT,
    graph: {
      meta: { source: 'runtime', generatedAt: SNAPSHOT.generatedAt, nodeCount: 0, edgeCount: 0 },
      nodes: [],
      edges: [],
    },
  })
})

describe('GET /api/intelligence/graph/operations', () => {
  it('returns the snapshot response with private no-store headers', async () => {
    const response = await GET(new NextRequest('http://localhost/api/intelligence/graph/operations'))

    expect(response.status).toBe(200)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store, max-age=0')
    expect(response.headers.get('Vary')).toBe('Cookie')
    await expect(response.json()).resolves.toMatchObject({ available: true, snapshot: SNAPSHOT })
  })

  it('keeps authentication failures private and non-cacheable', async () => {
    mocks.createClient.mockResolvedValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) } })

    const response = await GET(new NextRequest('http://localhost/api/intelligence/graph/operations'))

    expect(response.status).toBe(401)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store, max-age=0')
  })

  it('rejects an invalid hours value with private no-store headers', async () => {
    const response = await GET(new NextRequest('http://localhost/api/intelligence/graph/operations?hours=0'))

    expect(response.status).toBe(400)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store, max-age=0')
    expect(response.headers.get('Vary')).toBe('Cookie')
    await expect(response.json()).resolves.toEqual({ error: 'invalid hours (1–720)' })
  })

  it('rejects an invalid project id with private no-store headers', async () => {
    const response = await GET(new NextRequest('http://localhost/api/intelligence/graph/operations?project=not-a-uuid'))

    expect(response.status).toBe(400)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store, max-age=0')
    expect(response.headers.get('Vary')).toBe('Cookie')
    await expect(response.json()).resolves.toEqual({ error: 'invalid project id' })
  })

  it('returns a generic private 500 response for an unexpected builder failure', async () => {
    mocks.buildOperationsGraph.mockRejectedValue(new Error('sensitive builder failure'))

    const response = await GET(new NextRequest('http://localhost/api/intelligence/graph/operations'))
    const body = await response.json()

    expect(response.status).toBe(500)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store, max-age=0')
    expect(response.headers.get('Vary')).toBe('Cookie')
    expect(body).toEqual({ error: 'operations graph unavailable' })
    expect(JSON.stringify(body)).not.toContain('sensitive builder failure')
  })

  it('returns no partial data when the final graph response exceeds its cap', async () => {
    mocks.buildOperationsGraph.mockRejectedValue(new mocks.OperationsGraphLimitError())

    const response = await GET(new NextRequest('http://localhost/api/intelligence/graph/operations'))

    expect(response.status).toBe(503)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store, max-age=0')
    await expect(response.json()).resolves.toEqual({ error: 'operations graph unavailable' })
  })
})
