import { describe, expect, it } from 'vitest'
import type { IntelligenceGraphNode } from '@/lib/intelligence/graph-contract'
import { parseGraphUrlState, resolveScopedUrlNode, serializeGraphUrlState } from './graph-url-state'

describe('Phase 2 safe graph URL state', () => {
  it('round-trips only the canonical safe navigation fields', () => {
    const query = serializeGraphUrlState({
      mode: 'operations', projectId: 'project-a', selectedId: 'run:1', drillId: 'run:1', isolateId: 'run:1',
    })
    expect(parseGraphUrlState(query)).toEqual({
      mode: 'operations', projectId: 'project-a', selectedId: 'run:1', drillId: 'run:1', isolateId: 'run:1',
    })
    expect(query).not.toContain('payload')
    expect(query).not.toContain('token')
  })

  it('rejects malformed community and oversized project hints', () => {
    const state = parseGraphUrlState(`?view=replay&community=-1&project=${'x'.repeat(65)}`)
    expect(state).toEqual({ mode: 'system' })
  })

  it('cannot resolve an identifier absent from the authenticated scoped payload', () => {
    const scoped: IntelligenceGraphNode[] = [{
      id: 'run:allowed', kind: 'run', label: 'Allowed', source: 'runtime', projectId: 'project-a', metadata: {},
    }]
    expect(resolveScopedUrlNode(scoped, 'run:allowed')?.id).toBe('run:allowed')
    expect(resolveScopedUrlNode(scoped, 'run:project-b-private')).toBeNull()
  })
})
