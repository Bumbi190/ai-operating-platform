import type { IntelligenceGraphNode } from '@/lib/intelligence/graph-contract'

export interface GraphUrlState {
  mode: 'system' | 'operations'
  projectId?: string
  communityId?: number
  selectedId?: string
  drillId?: string
  isolateId?: string
}

export function parseGraphUrlState(search: string): GraphUrlState {
  const params = new URLSearchParams(search)
  const mode = params.get('view') === 'operations' ? 'operations' : 'system'
  const projectId = safeIdentifier(params.get('project'), 64)
  const selectedId = safeIdentifier(params.get('selected'), 300)
  const drillId = safeIdentifier(params.get('drill'), 300)
  const isolateId = safeIdentifier(params.get('isolate'), 300)
  const rawCommunity = params.get('community')
  const communityId = rawCommunity && /^\d{1,9}$/.test(rawCommunity) ? Number(rawCommunity) : undefined
  return {
    mode,
    ...(projectId ? { projectId } : {}),
    ...(communityId !== undefined ? { communityId } : {}),
    ...(selectedId ? { selectedId } : {}),
    ...(drillId ? { drillId } : {}),
    ...(isolateId ? { isolateId } : {}),
  }
}

export function serializeGraphUrlState(state: GraphUrlState): string {
  const params = new URLSearchParams({ view: state.mode })
  if (state.mode === 'operations' && safeIdentifier(state.projectId ?? null, 64)) params.set('project', state.projectId!)
  if (state.mode === 'system' && state.communityId !== undefined && Number.isSafeInteger(state.communityId) && state.communityId >= 0) {
    params.set('community', String(state.communityId))
  }
  if (safeIdentifier(state.selectedId ?? null, 300)) params.set('selected', state.selectedId!)
  if (safeIdentifier(state.drillId ?? null, 300)) params.set('drill', state.drillId!)
  if (safeIdentifier(state.isolateId ?? null, 300)) params.set('isolate', state.isolateId!)
  return params.toString()
}

/** URL identifiers are navigation hints only and resolve against scoped payload data. */
export function resolveScopedUrlNode(
  nodes: readonly IntelligenceGraphNode[],
  id: string | undefined,
): IntelligenceGraphNode | null {
  if (!id) return null
  return nodes.find(node => node.id === id) ?? null
}

function safeIdentifier(value: string | null, maxLength: number): string | undefined {
  if (!value || value.length > maxLength || /[\u0000-\u001f\u007f]/.test(value)) return undefined
  return value
}
