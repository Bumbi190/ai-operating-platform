/**
 * Canonical transport shapes for the Authorization HTTP surface (EI-HTTP-DTO-01).
 *
 * Authorization events ARE the authority record. The builder validates some
 * condition fields and then persists the caller's own condition objects and
 * evidence, so an unknown key would become part of an immutable, append-only
 * grant.
 *
 * `grant_with_conditions` still REQUIRES conditions — that rule belongs to the
 * domain and is untouched here. Conditions remain recorded but not
 * execution-effective in Stage 1; this file adjudicates shape only and builds
 * no policy engine.
 */
import type {
  AuthorizationCondition, AuthorizationEvidenceReference,
} from '@/lib/atlas/authorization/types'
import { f, objectOf, str, type Parser } from './canonicalize'

/**
 * `AuthorizationCondition` — conditionId, type, value, description.
 * `type` is a free string in the domain type; no vocabulary is invented here.
 */
export const condition: Parser<AuthorizationCondition> =
  objectOf<AuthorizationCondition>({
    conditionId: f(str), type: f(str), value: f(str), description: f(str),
  })

export const evidenceReference: Parser<AuthorizationEvidenceReference> =
  objectOf<AuthorizationEvidenceReference>({
    kind: f(str), ref: f(str), label: f(str), capturedAt: f(str),
  })
