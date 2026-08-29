/**
 * lib/workflows/evidence-auth.ts — the scoped resolver for evidence ingestion.
 *
 * Mirrors `lib/business/leads-auth.ts`, and exists for the reason that file's
 * containment guard states: no ROUTE may import the credential primitive
 * directly. A route that reaches `requireProjectApiScope` itself can name any
 * scope it likes, so the scope string would end up scattered across handlers
 * where a typo becomes an authorization bug. Here it is named once.
 *
 * This resolver grants exactly one thing: permission to append attested workflow
 * evidence for an instance in the credential's own project. It confers no
 * transition, no approval, no authorization and no execution — those are
 * separate scopes that do not exist, and scopes are compared by exact string
 * equality with no hierarchy, so this one can never imply them.
 */

import 'server-only'

import { requireProjectApiScope, type ProjectApiAuthResult } from '@/lib/auth/project-api-credentials'

/** The only scope this resolver ever checks. */
export const WORKFLOW_EVIDENCE_WRITE_SCOPE = 'workflow.evidence.write'

/**
 * Authenticate a producer for evidence ingestion.
 *
 * Returns the same discriminated result the primitive does, so the route keeps
 * failing closed on the unauthenticated and wrong-scope paths without having to
 * know how either is detected.
 */
export async function requireEvidenceProducer(request: Request): Promise<ProjectApiAuthResult> {
  return requireProjectApiScope(request, WORKFLOW_EVIDENCE_WRITE_SCOPE)
}
