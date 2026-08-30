/**
 * lib/atlas/knowledge/projection/eligibility.ts — may this note leave the machine?
 *
 * Functional core: pure, no I/O. Given a parsed note, decide whether it is
 * REMOTELY PUBLISHABLE and, when it is not, say exactly why.
 *
 * ── THE POLICY IS LOCKED, AND IT LIVES IN THE VAULT ──────────────────────────
 * This module implements Publication Policy v1, owner-approved and documented in
 * `Knowledge/Omnira-Vault/VAULT_POLICY.md` §6 (vault commit a2a9ae4). That
 * document is the authority; this file is its implementation. Where the two
 * disagree, the vault is right and this file is the bug.
 *
 * ── FAIL CLOSED, ALWAYS ──────────────────────────────────────────────────────
 * Every unknown resolves to ineligible. A missing classification does not become
 * `internal`; a missing scope does not become `platform`, and never becomes
 * project scope merely because `project:` happens to be present; an unrecognized
 * status does not become `approved`. The asymmetry is deliberate: an
 * under-published vault is an inconvenience, an over-published one is a leak
 * that cannot be recalled.
 */

import type { ParsedKnowledgeDocument } from '../document'
import { DEFAULT_EXCLUDED_FOLDERS, topFolderOf } from '../policy'
import { scanForSecretShapes, type SecretFinding } from './secret-scan'

/**
 * Publication Policy v1 §6.1. Exactly four values, no default, nothing inferred
 * from content — the owner assigns classification, a reader never guesses it.
 *
 * `prohibited` is deliberately absent (§6.2). Classification describes
 * sensitivity and transport intent; genuinely forbidden material is the hard
 * secret gate's job, and a note cannot make a secret safe by declaring a
 * classification. A note declaring `prohibited` is therefore unrecognized.
 */
export const PUBLICATION_CLASSIFICATIONS = [
  'public', 'internal', 'confidential', 'local_only',
] as const

export type PublicationClassification = (typeof PUBLICATION_CLASSIFICATIONS)[number]

/**
 * What may leave the machine in transport v1.
 *
 * `public` is here because it describes non-sensitive CONTENT — not a public
 * channel. Transport stays private regardless (§6.1).
 *
 * `confidential` is recognized and deliberately absent: it stays local until an
 * explicit security-hardening decision authorizes remote confidential knowledge
 * with a constrained reader. That is staging, not an oversight, which is why it
 * gets its own reason code rather than being lumped in with bad metadata.
 *
 * `local_only` is absent by definition.
 */
export const REMOTELY_PUBLISHABLE_CLASSIFICATIONS: readonly PublicationClassification[] = [
  'public', 'internal',
] as const

/** Publication Policy v1 §6.3. Explicit values only. */
export const PUBLICATION_SCOPES = ['platform', 'project'] as const
export type PublicationScopeKind = (typeof PUBLICATION_SCOPES)[number]

/** Why a note may not be published remotely. One code per distinct operator action. */
export type IneligibilityReason =
  | 'status_not_approved'
  | 'folder_excluded'
  | 'type_missing_or_unrecognized'
  | 'canonical_pointer_missing'
  | 'source_of_truth_unrecognized'
  | 'classification_missing'
  | 'classification_unrecognized'
  /** Recognized and deliberately blocked in transport v1 — not bad metadata. */
  | 'classification_confidential_remote_blocked'
  | 'classification_local_only'
  | 'scope_missing'
  | 'scope_unrecognized'
  /** scope: platform alongside a project — an ambiguous model, refused. */
  | 'platform_scope_project_conflict'
  /** scope: project with no project slug at all. */
  | 'project_scope_missing'
  /** No canonical project mapping was supplied to this evaluation at all. */
  | 'project_scope_mapping_unavailable'
  /** A mapping was supplied and this slug is absent from it. */
  | 'project_scope_unmapped'
  /** The slug maps, but to something that is not a canonical project id. */
  | 'project_scope_mapping_invalid'
  | 'secret_detected'

export interface EligibilityInput {
  doc: ParsedKnowledgeDocument
  /** Raw frontmatter values for fields the Phase-1 parser does not model. */
  rawFrontMatter: Record<string, string>
  /**
   * Canonical project-slug → project-id map.
   *
   * The canonical source of project identity is `public.projects` (`slug` UNIQUE,
   * `id` uuid PK) — the same table `getAllowedProjectIds` scopes against and the
   * app routes on at `/projects/[slug]`. It is supplied to this evaluator rather
   * than read by it, so the pure core keeps no database dependency and, more
   * importantly, CANNOT INVENT PROJECT IDENTITY.
   *
   * `undefined` means no mapping was available to this evaluation — reported as
   * `project_scope_mapping_unavailable`, which is a different statement from
   * "this slug is not a project". A supplied map is a TRUSTED INPUT: it does not
   * prove database membership, it only bounds what this evaluation will accept.
   * Lookups are own-property only and every value is shape-validated.
   */
  projectScopeMap?: Record<string, string>
  /** Full note text, for the secret scan. Never retained on the result. */
  content: string
}

/** A resolved scope. `projectId` is present exactly when kind is 'project'. */
export type ResolvedScope =
  | { kind: 'platform' }
  | { kind: 'project'; projectId: string }

export interface EligibilityResult {
  eligible: boolean
  /** Empty when eligible. Deterministically ordered. */
  reasons: IneligibilityReason[]
  classification: PublicationClassification | null
  /** Present only when scope resolved explicitly. */
  scope: ResolvedScope | null
  /** Pattern names only — never a matched value. */
  secretFindings: SecretFinding[]
}

const REASON_ORDER: readonly IneligibilityReason[] = [
  'folder_excluded',
  'status_not_approved',
  'type_missing_or_unrecognized',
  'canonical_pointer_missing',
  'source_of_truth_unrecognized',
  'classification_missing',
  'classification_unrecognized',
  'classification_confidential_remote_blocked',
  'classification_local_only',
  'scope_missing',
  'scope_unrecognized',
  'platform_scope_project_conflict',
  'project_scope_missing',
  'project_scope_mapping_unavailable',
  'project_scope_unmapped',
  'project_scope_mapping_invalid',
  'secret_detected',
]

/**
 * Canonical project ids are `public.projects.id` — a uuid primary key, with
 * `slug` UNIQUE alongside it. Shape is validated, never repaired.
 */
const CANONICAL_PROJECT_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isCanonicalProjectId(value: unknown): value is string {
  return typeof value === 'string' && CANONICAL_PROJECT_ID_RE.test(value.trim())
}

function isPublicationClassification(v: unknown): v is PublicationClassification {
  return typeof v === 'string' && (PUBLICATION_CLASSIFICATIONS as readonly string[]).includes(v)
}

/**
 * Evaluate one note. Collects ALL failing reasons rather than short-circuiting,
 * so an operator fixing a note sees every blocker in one pass instead of
 * discovering them one publication attempt at a time.
 */
export function evaluateEligibility(input: EligibilityInput): EligibilityResult {
  const { doc, rawFrontMatter, projectScopeMap, content } = input
  const reasons = new Set<IneligibilityReason>()

  // §6.6 — Inbox is uncurated capture, Archive is superseded material.
  if ((DEFAULT_EXCLUDED_FOLDERS as readonly string[]).includes(topFolderOf(doc.path))) {
    reasons.add('folder_excluded')
  }

  // §6.5 — editorial approval, separate from classification and scope.
  if (doc.status !== 'approved') reasons.add('status_not_approved')

  // A note whose type could not be trusted cannot be classified downstream.
  if (doc.type === null) reasons.add('type_missing_or_unrecognized')

  // Phase-1 repository pointer contract, carried forward verbatim.
  if (doc.declaredSourceOfTruth === 'repository' && !doc.canonicalPath) {
    reasons.add('canonical_pointer_missing')
  }

  // Declared-but-unrecognized trust metadata fails closed. Absence stays
  // different from garbage: a note that declares nothing speaks for itself.
  if (rawFrontMatter.source_of_truth !== undefined && doc.declaredSourceOfTruth === null) {
    reasons.add('source_of_truth_unrecognized')
  }

  // ── §6.1 classification ────────────────────────────────────────────────────
  const declaredClassification = rawFrontMatter.classification?.trim() || null
  let classification: PublicationClassification | null = null
  if (declaredClassification === null) {
    reasons.add('classification_missing')
  } else if (!isPublicationClassification(declaredClassification)) {
    // Includes `prohibited`, which is not a classification (§6.2).
    reasons.add('classification_unrecognized')
  } else {
    classification = declaredClassification
    if (!REMOTELY_PUBLISHABLE_CLASSIFICATIONS.includes(classification)) {
      // Distinct codes: policy staging and "never remote" are different answers
      // to the operator, and neither is a metadata error.
      reasons.add(classification === 'confidential'
        ? 'classification_confidential_remote_blocked'
        : 'classification_local_only')
    }
  }

  // ── §6.3 / §6.4 scope — explicit, never inferred ──────────────────────────
  let scope: ResolvedScope | null = null
  const declaredScope = rawFrontMatter.scope?.trim() || null
  const project = doc.project

  if (declaredScope === null) {
    // A missing scope is a missing scope, even when `project:` is present. The
    // old inference (absent scope + mapped project → project scope) is gone: it
    // gave a note a scope it never asked for.
    reasons.add('scope_missing')
  } else if (declaredScope === 'platform') {
    if (project) {
      // Platform knowledge is shared Omnira/Atlas material. The owner removed
      // the legacy `project: omnira` label from platform notes precisely so the
      // model has one meaning; silently ignoring a leftover `project:` would
      // reintroduce the ambiguity instead of surfacing it.
      reasons.add('platform_scope_project_conflict')
    } else {
      scope = { kind: 'platform' }
    }
  } else if (declaredScope === 'project') {
    if (!project) reasons.add('project_scope_missing')
    else if (projectScopeMap === undefined) {
      // "No registry was consulted" is not the same claim as "this slug is not a
      // project", and reporting the second when only the first is known would
      // lie to the operator. Both fail closed; they say different things.
      reasons.add('project_scope_mapping_unavailable')
    } else if (!Object.prototype.hasOwnProperty.call(projectScopeMap, project)) {
      // OWN properties only. A plain object inherits __proto__, constructor,
      // toString and friends, all of which are truthy — so `map[slug]` would
      // hand back Object.prototype for `project: __proto__` and resolve a scope
      // out of thin air. Identity must come from an entry someone put there.
      reasons.add('project_scope_unmapped')
    } else {
      const projectId = projectScopeMap[project]
      // The canonical registry is public.projects: `id` is a uuid primary key.
      // A mapped value that is not one is a broken map, not a project — repair
      // is the operator's job, never this evaluator's.
      if (isCanonicalProjectId(projectId)) scope = { kind: 'project', projectId }
      else reasons.add('project_scope_mapping_invalid')
    }
  } else {
    reasons.add('scope_unrecognized')
  }

  // Hard secret gate. Values are never returned or logged.
  const secretFindings = scanForSecretShapes(content)
  if (secretFindings.length > 0) reasons.add('secret_detected')

  const ordered = REASON_ORDER.filter((r) => reasons.has(r))
  return {
    eligible: ordered.length === 0,
    reasons: ordered,
    classification,
    scope,
    secretFindings,
  }
}
