/**
 * Read-only Atlas discovery view over Omnira's authoritative action registry.
 * This module never enables, dispatches, authorizes or persists an action.
 */
import {
  ACTION_REGISTRY,
  isGovernedEffectEnabled,
  type ActionKind,
} from '@/lib/workflows/action-registry'
import { ACTION_CLASS_POLICY } from '@/lib/workflows/action-target'

export interface WorkflowCatalogEntry {
  readonly actionKind: ActionKind
  readonly description: string
  readonly actionClass: keyof typeof ACTION_CLASS_POLICY
  readonly executorFamily: string
  readonly declaredPlacements: readonly { readonly defKey: string; readonly state: string }[]
  readonly requiresHumanAuthorization: boolean
  readonly dispatchEligibility: 'declared_only' | 'executor_eligible'
  readonly operationalStatus: 'not_verified'
}

/**
 * An eligibility label is not a statement that the feature is deployed, enabled,
 * authorized, registered in DB, or safe to run in the present environment.
 */
export function listAtlasWorkflowCatalog(): readonly WorkflowCatalogEntry[] {
  return (Object.keys(ACTION_REGISTRY) as ActionKind[])
    .sort()
    .map((actionKind) => {
      const item = ACTION_REGISTRY[actionKind]
      const eligible =
        item.executor_family === 'read_only_observation' ||
        (item.executor_family === 'governed_effect' && isGovernedEffectEnabled(actionKind))
      return {
        actionKind,
        description: item.description,
        actionClass: item.action_class,
        executorFamily: item.executor_family,
        declaredPlacements: item.placements.map((placement) => ({
          defKey: placement.def_key,
          state: placement.state,
        })),
        requiresHumanAuthorization: ACTION_CLASS_POLICY[item.action_class].requiresAuthorization,
        dispatchEligibility: eligible ? 'executor_eligible' : 'declared_only',
        operationalStatus: 'not_verified',
      }
    })
}
