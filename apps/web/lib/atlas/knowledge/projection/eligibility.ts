/**
 * lib/atlas/knowledge/projection/eligibility.ts — may this note leave the machine?
 *
 * Functional core: pure, no I/O. Given a parsed note, decide whether it is
 * REMOTELY PUBLISHABLE and, when it is not, say exactly why.
 *
 * ── FAIL CLOSED, ALWAYS ──────────────────────────────────────────────────────
 * Every unknown resolves to ineligible. A missing classification does not become
 * `internal`; an unmapped project does not become `platform`; an unrecognized
 * status does not become `approved`. The asymmetry is deliberate: an
 * under-published vault is an inconvenience, an over-published one is a leak
 * that cannot be recalled.
 *
 * ── WHAT SLICE 1 DELIBERATELY DOES NOT DECIDE ────────────────────────────────
 * The vault's frontmatter contract does not yet carry `classification` or an
 * explicit publication `scope`, and VAULT_POLICY.md has not been amended. This
 * module therefore treats both as PENDING POLICY (see PENDING_POLICY_DECISIONS)
 * and reports their absence rather than inventing values. Real vault notes are
 * expected to come back ineligible today. That is the correct answer, not a bug.
 */

import type { ParsedKnowledgeDocument } from '../document'
import { DEFAULT_EXCLUDED_FOLDERS, topFolderOf } from '../policy'
import { scanForSecretShapes, type SecretFinding } from './secret-scan'

/**
 * PROVISIONAL. Not owner-approved, not in VAULT_POLICY.md, and not final.
 *
 * The Phase-2 design proposed public/internal/confidential/local_only, while the
 * existing architecture-knowledge vocabulary also carries `prohibited`. That
 * inconsistency is unresolved, so `prohibited` is deliberately NOT recognized
 * here: a note declaring it reports `classification_unrecognized`, which is
 * fail-closed and surfaces the open decision instead of silently picking a side.
 *
 * Slice 2 locks the real vocabulary with owner approval.
 */
export const PROVISIONAL_CLASSIFICATIONS = [
  'public', 'internal', 'confidential', 'local_only',
] as const

export type ProvisionalClassification = (typeof PROVISIONAL_CLASSIFICATIONS)[number]

/** The subset that may leave the machine. `local_only` never does — that is its meaning. */
export const REMOTELY_PUBLISHABLE_CLASSIFICATIONS: readonly ProvisionalClassification[] = [
  'public', 'internal', 'confidential',
] as const

/** Surfaced in the operator report so the open questions stay visible. */
export const PENDING_POLICY_DECISIONS: readonly string[] = [
  'classification vocabulary is PROVISIONAL and not yet in VAULT_POLICY.md (Slice 2)',
  '"prohibited" appears in the architecture-knowledge vocabulary but not in the ' +
    'Phase-2 proposal — unresolved, so it is treated as unrecognized',
  'publication scope (explicit platform / project slug → project id map) is not yet ' +
    'part of the vault frontmatter contract (Slice 2)',
] as const

/** Why a note may not be published remotely. One code per distinct operator action. */
export type IneligibilityReason =
  | 'status_not_approved'
  | 'folder_excluded'
  | 'type_missing_or_unrecognized'
  | 'canonical_pointer_missing'
  | 'classification_missing'
  | 'classification_unrecognized'
  | 'classification_local_only'
  | 'scope_missing'
  | 'project_scope_unmapped'
  | 'secret_detected'

export interface EligibilityInput {
  doc: ParsedKnowledgeDocument
  /** Raw frontmatter values for fields the Phase-1 parser does not model yet. */
  rawFrontMatter: Record<string, string>
  /** Declared project-slug → project-id map. Empty in Slice 1 — Slice 2 owns it. */
  projectScopeMap?: Record<string, string>
  /** Full note text, for the secret scan. Never retained on the result. */
  content: string
}

export interface ResolvedScope {
  kind: 'platform' | 'project'
  projectId?: string
}

export interface EligibilityResult {
  eligible: boolean
  /** Empty when eligible. Deterministically ordered. */
  reasons: IneligibilityReason[]
  classification: ProvisionalClassification | null
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
  'classification_missing',
  'classification_unrecognized',
  'classification_local_only',
  'scope_missing',
  'project_scope_unmapped',
  'secret_detected',
]

function isProvisionalClassification(v: unknown): v is ProvisionalClassification {
  return typeof v === 'string' && (PROVISIONAL_CLASSIFICATIONS as readonly string[]).includes(v)
}

/**
 * Evaluate one note. Collects ALL failing reasons rather than short-circuiting,
 * so an operator fixing a note sees every blocker in one pass instead of
 * discovering them one publication attempt at a time.
 */
export function evaluateEligibility(input: EligibilityInput): EligibilityResult {
  const { doc, rawFrontMatter, projectScopeMap = {}, content } = input
  const reasons = new Set<IneligibilityReason>()

  // Editorial folder policy. Inbox is unreviewed capture, Archive is superseded.
  if ((DEFAULT_EXCLUDED_FOLDERS as readonly string[]).includes(topFolderOf(doc.path))) {
    reasons.add('folder_excluded')
  }

  // Editorial approval. reviewed/draft/archived/unrecognized all fail.
  if (doc.status !== 'approved') reasons.add('status_not_approved')

  // A note whose type could not be trusted cannot be classified downstream.
  if (doc.type === null) reasons.add('type_missing_or_unrecognized')

  // Phase-1 repository pointer contract, carried forward verbatim.
  if (doc.declaredSourceOfTruth === 'repository' && !doc.canonicalPath) {
    reasons.add('canonical_pointer_missing')
  }

  // Classification — PENDING POLICY. Absence is never publishable.
  const declaredClassification = rawFrontMatter.classification?.trim() || null
  let classification: ProvisionalClassification | null = null
  if (declaredClassification === null) {
    reasons.add('classification_missing')
  } else if (!isProvisionalClassification(declaredClassification)) {
    reasons.add('classification_unrecognized')
  } else {
    classification = declaredClassification
    if (!REMOTELY_PUBLISHABLE_CLASSIFICATIONS.includes(classification)) {
      // local_only: omitted from any remote projection by definition.
      reasons.add('classification_local_only')
    }
  }

  // Scope — PENDING POLICY. Never inferred, never defaulted to platform.
  let scope: ResolvedScope | null = null
  const declaredScope = rawFrontMatter.scope?.trim() || null
  if (declaredScope === 'platform') {
    scope = { kind: 'platform' }
  } else if (doc.project) {
    const projectId = projectScopeMap[doc.project]
    if (projectId) scope = { kind: 'project', projectId }
    else reasons.add('project_scope_unmapped')
  } else {
    reasons.add('scope_missing')
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
