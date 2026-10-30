/**
 * Atlas-facing adapter to a pinned, untrusted external reference index.
 * Pure lookup: no fetch, DB, credentials, filesystem or workflow execution.
 */
import index from './catalog-index.json'
import { searchReferences } from './catalog-search.mjs'

export interface ExternalWorkflowSearchInput {
  query?: unknown
  project?: unknown
  limit?: unknown
  /** Set by the authenticated server from the operator's actual question. */
  includeNoOpAuditExamples?: unknown
}

export function searchExternalWorkflowReferences(input: ExternalWorkflowSearchInput) {
  return searchReferences(index, input)
}
