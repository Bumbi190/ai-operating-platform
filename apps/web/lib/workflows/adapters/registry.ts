/**
 * lib/workflows/adapters/registry.ts — which adapter serves which definition.
 *
 * Keyed by `def_key`, so an adapter is reached through the workflow it belongs
 * to and never by a caller naming it. A definition with no adapter simply has
 * nothing machine-verifiable, which is a normal state and not an error.
 */

import type { WorkflowAdapter } from './types'
import { familjeStundenAdapter } from './familje-stunden'

const ADAPTERS: WorkflowAdapter[] = [familjeStundenAdapter]

export function findAdapter(defKey: string): WorkflowAdapter | null {
  return ADAPTERS.find(a => a.defKey === defKey) ?? null
}

export function registeredAdapters(): readonly WorkflowAdapter[] {
  return ADAPTERS
}
