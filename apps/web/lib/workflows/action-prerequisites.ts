import 'server-only'
import { findVendoredDefinition } from './definitions'
import { computeDefHash } from './spec'
import type { WorkflowInstance, WorkflowSpec } from './types'

/** Entry-only deferrals, never evidence passes or transition exemptions.
 * Unknown versions, definitions, states and checks retain the default gate.
 * The existing own-output exemption is applied separately by action-run.
 */
export function deferredStoryOutputChecks(
  instance: Pick<WorkflowInstance, 'def_key' | 'def_version' | 'def_hash' | 'current_state'>,
  spec: WorkflowSpec,
  actionKind: string,
): readonly string[] {
  if (instance.def_key !== 'familje-stunden.monthly-release'
      || instance.def_version !== 2 || instance.current_state !== 'content_generation') return []
  if (actionKind !== 'generate_monthly_story' && actionKind !== 'validate_monthly_story') return []
  const canonical = findVendoredDefinition(instance.def_key, 2)
  if (!canonical || instance.def_hash !== canonical.def_hash
      || computeDefHash(spec) !== canonical.def_hash) return []
  return actionKind === 'generate_monthly_story'
    ? ['story_page_count', 'story_structurally_valid']
    : ['story_page_count']
}
