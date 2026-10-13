import { describe, expect, it } from 'vitest'
import { ACTION_REGISTRY, isGovernedEffectEnabled } from '@/lib/workflows/action-registry'
import { ACTION_CLASS_POLICY } from '@/lib/workflows/action-target'
import { listAtlasWorkflowCatalog } from '@/lib/atlas/workflow-catalog'

describe('Atlas workflow catalog — read-only discovery', () => {
  it('describes every canonical kind once without inventing entries', () => {
    const catalog = listAtlasWorkflowCatalog()
    expect(catalog.map((item) => item.actionKind)).toEqual(Object.keys(ACTION_REGISTRY).sort())
    expect(new Set(catalog.map((item) => item.actionKind)).size).toBe(catalog.length)
  })

  it('derives classification, policy and placements only from authority registries', () => {
    for (const entry of listAtlasWorkflowCatalog()) {
      const canonical = ACTION_REGISTRY[entry.actionKind]
      expect(entry.actionClass).toBe(canonical.action_class)
      expect(entry.requiresHumanAuthorization).toBe(
        ACTION_CLASS_POLICY[canonical.action_class].requiresAuthorization,
      )
      expect(entry.declaredPlacements).toEqual(
        canonical.placements.map((p) => ({ defKey: p.def_key, state: p.state })),
      )
      expect(entry.dispatchEligibility).toBe(
        canonical.executor_family === 'read_only_observation' ||
          (canonical.executor_family === 'governed_effect' &&
            isGovernedEffectEnabled(entry.actionKind))
          ? 'executor_eligible'
          : 'declared_only',
      )
      expect(entry.operationalStatus).toBe('not_verified')
    }
  })

  it('does not expose execution, credentials, secrets, or enablement methods', async () => {
    const module = await import('@/lib/atlas/workflow-catalog')
    expect(Object.keys(module)).toEqual(['listAtlasWorkflowCatalog'])
  })
})
