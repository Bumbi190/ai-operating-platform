/**
 * Nova Source Curator P0: deterministic, operator-only review preparation.
 *
 * NO I/O, network, publishing, M4, OpenViking, database, model invocation,
 * owner attestation, or modification of an Obsidian note. Callers must
 * independently authorize the operator and pin the repo tree/commit before
 * supplying source bytes. Hash consistency here is NOT GitHub authentication.
 *
 * SOURCE CONTENT IS UNTRUSTED DATA. Output never includes source bodies,
 * original quotes, customer mail, proposed instructions, or draft text.
 */
import { createHash } from 'node:crypto'
import { parseKnowledgeDocument } from '../knowledge/document'
import { evaluateEligibility } from '../knowledge/projection/eligibility'
import { containsSecretShape, scanForSecretShapes } from '../knowledge/projection/secret-scan'

export const NOVA_CURATOR_SCHEMA = 'nova-source-curator-p0-v1' as const
const PINNED_REPO = 'Bumbi190/ai-operating-platform'
const PINNED_REPO_ID = 1244338545
const HEX40 = /^[a-f0-9]{40}$/
const HEX64 = /^[a-f0-9]{64}$/
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/
const IDENT = /^[a-z0-9][a-z0-9_-]{2,79}$/
const MAX_SOURCES = 16
const MAX_CLAIMS = 40
const MAX_ORIGINAL = 128_000
const MAX_DRAFT = 24_000

export type NovaClaimTime = 'historical' | 'current' | 'planned' | 'unknown'
export type NovaClassProposal = 'public' | 'internal' | 'confidential' | 'local_only'

/** Must come from an independently authorized server/operator, not the LLM. */
export interface NovaTrustedReviewScope {
  projectId: string
  projectSlug: string
  repositoryFullName: string
  repositoryId: number
  pinnedCommitSha: string
}

export interface NovaCuratorClaimInput {
  id: string
  /** For local comparison only. Never serialized to the output report. */
  statement: string
  /** Exact source quote, NOT a model claim of semantic truth. */
  exactQuote: string
  line: number
  time: NovaClaimTime
  /** Named company/person, if the claim hinges on a specific identity. */
  subjectName?: string | null
}

export interface NovaCuratorDocumentInput {
  id: string
  draftPath: string
  draftMarkdown: string
  canonicalPath: string
  originalText: string
  /** From the trusted pinned Git tree, never obtained from LLM prose. */
  expectedGitBlobSha: string
  expectedSourceSha256: string
  sourceCommitSha: string
  repositoryId: number
  projectId: string
  classificationProposal?: NovaClassProposal | null
  claims: NovaCuratorClaimInput[]
}

export interface NovaCuratorClaimResult {
  id: string
  line: number
  /** Exact string match, NOT proof of factual accuracy. */
  literalEvidenceMatched: boolean
  namedSubjectAnchored: boolean
  time: NovaClaimTime
  reasonCodes: string[]
  /** Set only when source identity, bytes and quote are locally consistent. */
  immutableSourceUrl: string | null
}

export interface NovaCuratorDocumentResult {
  id: string
  canonicalPath: string | null
  expectedGitBlobSha: string | null
  sourceBytesMatchExpectedDigests: boolean
  /** Independent repo/tree authorization is a separate external gate. */
  repositoryTreeVerifiedByThisFunction: false
  editorialStatus: string | null
  existingClassification: string | null
  /** Never applied to the note; may be displayed as an untrusted proposal. */
  proposedClassification: NovaClassProposal | null
  ownerClassificationChosenByThisFunction: false
  publicationEligibleByThisFunction: false
  reviewReady: boolean
  policyReasonCodes: string[]
  reasonCodes: string[]
  sourceSecretPatternCount: number
  draftSecretPatternCount: number
  claims: NovaCuratorClaimResult[]
}

export interface NovaCuratorReport {
  schemaVersion: typeof NOVA_CURATOR_SCHEMA
  /** Scope checks are not equivalent to a fresh authenticated user session. */
  identityCheckedAgainstTrustedInput: boolean
  repositoryTreeIdentityIndependentlyVerified: false
  readyForOwnerReview: boolean
  ownerApproved: false
  classificationApproved: false
  sourcePublicationAuthorized: false
  indexingAuthorized: false
  runtimeActivationAuthorized: false
  modelExecutionAuthorized: false
  anyExternalWorkPerformed: false
  sourceCount: number
  literalEvidenceMatches: number
  evidenceNeedsReview: number
  historicalClaims: number
  currentClaimsWithoutLiveProof: number
  reasonCodes: string[]
  documents: NovaCuratorDocumentResult[]
}

function uniqueSorted(values: string[]): string[] { return [...new Set(values)].sort() }
function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}
function exactFields(value: Record<string, unknown>, required: string[], optional: string[] = []): boolean {
  const keys = Object.keys(value)
  return required.every(k => Object.hasOwn(value, k)) &&
    keys.every(k => required.includes(k) || optional.includes(k))
}
function validSourcePath(path: unknown): path is string {
  return typeof path === 'string' && path.length <= 220 &&
    /^docs\/[A-Za-z0-9_./-]+\.md$/.test(path) &&
    !path.includes('..') && !path.includes('//') &&
    !containsSecretShape(path) &&
    !path.split('/').some(segment => segment.startsWith('.'))
}
function validDraftPath(path: unknown, slug: string): path is string {
  return typeof path === 'string' &&
    path.startsWith('30 Projects/' + slug + '/') &&
    path.length <= 220 && !path.includes('..') &&
    !path.includes('//') && !path.includes('\\') &&
    !containsSecretShape(path) &&
    /^[A-Za-z0-9_. /-]+\.md$/.test(path)
}
function stringBound(value: unknown, max: number, min = 1): value is string {
  return typeof value === 'string' &&
    value.length >= min && value.length <= max && !value.includes('\0')
}
function sha256(value: Buffer): string {
  return createHash('sha256').update(value).digest('hex')
}
function gitBlobSha(value: Buffer): string {
  const header = Buffer.from('blob ' + value.length + '\0', 'utf8')
  return createHash('sha1').update(header).update(value).digest('hex')
}
function validClaim(value: unknown): value is NovaCuratorClaimInput {
  if (!record(value) || !exactFields(value,
      ['id', 'statement', 'exactQuote', 'line', 'time'], ['subjectName'])) return false
  return typeof value.id === 'string' && IDENT.test(value.id) &&
    !containsSecretShape(value.id) &&
    stringBound(value.statement, 600, 8) &&
    stringBound(value.exactQuote, 300, 8) &&
    !value.exactQuote.includes('\n') && !value.exactQuote.includes('\r') &&
    Number.isInteger(value.line) && (value.line as number) >= 1 &&
    (value.line as number) <= 10_000 &&
    ['historical', 'current', 'planned', 'unknown'].includes(String(value.time)) &&
    (value.subjectName === undefined || value.subjectName === null ||
      stringBound(value.subjectName, 120, 2))
}
function validDocument(value: unknown, slug: string): value is NovaCuratorDocumentInput {
  if (!record(value) || !exactFields(value,
      ['id', 'draftPath', 'draftMarkdown', 'canonicalPath', 'originalText',
        'expectedGitBlobSha', 'expectedSourceSha256', 'sourceCommitSha',
        'repositoryId', 'projectId', 'claims'], ['classificationProposal'])) return false
  return typeof value.id === 'string' && IDENT.test(value.id) &&
    !containsSecretShape(value.id) && validDraftPath(value.draftPath, slug) &&
    validSourcePath(value.canonicalPath) &&
    stringBound(value.draftMarkdown, MAX_DRAFT) &&
    Buffer.byteLength(value.draftMarkdown, 'utf8') <= MAX_DRAFT &&
    stringBound(value.originalText, MAX_ORIGINAL) &&
    Buffer.byteLength(value.originalText, 'utf8') <= MAX_ORIGINAL &&
    typeof value.expectedGitBlobSha === 'string' && HEX40.test(value.expectedGitBlobSha) &&
    typeof value.expectedSourceSha256 === 'string' && HEX64.test(value.expectedSourceSha256) &&
    typeof value.sourceCommitSha === 'string' && HEX40.test(value.sourceCommitSha) &&
    Number.isSafeInteger(value.repositoryId) &&
    typeof value.projectId === 'string' && UUID.test(value.projectId) &&
    (value.classificationProposal === undefined ||
      value.classificationProposal === null ||
      ['public', 'internal', 'confidential', 'local_only'].includes(String(value.classificationProposal))) &&
    Array.isArray(value.claims) && value.claims.length >= 1 &&
    value.claims.length <= MAX_CLAIMS && value.claims.every(validClaim) &&
    new Set(value.claims.map(c => c.id)).size === value.claims.length
}
function validScope(scope: unknown): scope is NovaTrustedReviewScope {
  return record(scope) && exactFields(scope,
    ['projectId', 'projectSlug', 'repositoryFullName', 'repositoryId', 'pinnedCommitSha']) &&
    typeof scope.projectId === 'string' && UUID.test(scope.projectId) &&
    typeof scope.projectSlug === 'string' && IDENT.test(scope.projectSlug) &&
    scope.repositoryFullName === PINNED_REPO && scope.repositoryId === PINNED_REPO_ID &&
    typeof scope.pinnedCommitSha === 'string' && HEX40.test(scope.pinnedCommitSha)
}
function blockedReport(codes: string[]): NovaCuratorReport {
  return {
    schemaVersion: NOVA_CURATOR_SCHEMA,
    identityCheckedAgainstTrustedInput: false,
    repositoryTreeIdentityIndependentlyVerified: false,
    readyForOwnerReview: false,
    ownerApproved: false, classificationApproved: false,
    sourcePublicationAuthorized: false, indexingAuthorized: false,
    runtimeActivationAuthorized: false, modelExecutionAuthorized: false,
    anyExternalWorkPerformed: false,
    sourceCount: 0, literalEvidenceMatches: 0, evidenceNeedsReview: 0,
    historicalClaims: 0, currentClaimsWithoutLiveProof: 0,
    reasonCodes: uniqueSorted(codes), documents: [],
  }
}

/**
 * Deterministic comparison of PRIVATE in-memory source bytes against supplied
 * hashes and exact line anchors. A trusted adapter must separately check the
 * actual Git tree/repo ID, current project authorization, revocation and owner
 * scope. This is REVIEW PREPARATION, not an approval or indexer input.
 */
export function prepareNovaSourceReview(
  raw: unknown, trustedScope: unknown,
): NovaCuratorReport {
  if (!validScope(trustedScope)) return blockedReport(['trusted_scope_invalid_or_unapproved_repository'])
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > MAX_SOURCES ||
    !raw.every(value => validDocument(value, trustedScope.projectSlug))) {
    return blockedReport(['source_input_invalid_or_unbounded'])
  }
  const candidates: NovaCuratorDocumentInput[] = raw
  const sourceIds = candidates.map(c => c.id)
  const paths = candidates.map(c => c.canonicalPath.toLowerCase())
  const draftPaths = candidates.map(c => c.draftPath.toLowerCase())
  if (new Set(sourceIds).size !== sourceIds.length ||
      new Set(paths).size !== paths.length ||
      new Set(draftPaths).size !== draftPaths.length) return blockedReport(['duplicate_source_or_path'])

  const report = blockedReport([])
  report.identityCheckedAgainstTrustedInput = true
  report.sourceCount = candidates.length

  for (const source of candidates) {
    const codes: string[] = []
    if (source.repositoryId !== trustedScope.repositoryId ||
        source.projectId !== trustedScope.projectId ||
        source.sourceCommitSha !== trustedScope.pinnedCommitSha) {
      codes.push('source_scope_or_revision_mismatch')
    }

    const originalBytes = Buffer.from(source.originalText, 'utf8')
    const matchedDigests =
      sha256(originalBytes) === source.expectedSourceSha256 &&
      gitBlobSha(originalBytes) === source.expectedGitBlobSha
    if (!matchedDigests) codes.push('source_hash_mismatch')

    const parsed = parseKnowledgeDocument(source.draftMarkdown, source.draftPath)
    const verdict = evaluateEligibility({
      doc: parsed,
      rawFrontMatter: parsed.rawFrontMatter,
      projectScopeMap: { [trustedScope.projectSlug]: trustedScope.projectId },
      content: [parsed.path, parsed.body, ...Object.values(parsed.rawFrontMatter)].join('\n'),
    })
    if (parsed.canonicalPath !== source.canonicalPath) codes.push('canonical_pointer_mismatch')
    if (parsed.project !== trustedScope.projectSlug || verdict.scope?.kind !== 'project' ||
        verdict.scope.projectId !== trustedScope.projectId) {
      codes.push('draft_project_scope_mismatch')
    }

    const sourceSecretFindings = scanForSecretShapes(source.canonicalPath + '\n' + source.originalText)
    const draftSecretFindings = scanForSecretShapes(source.draftPath + '\n' + source.draftMarkdown)
    const sourceSecretCount = sourceSecretFindings.reduce((sum, finding) => sum + finding.count, 0)
    const draftSecretCount = draftSecretFindings.reduce((sum, finding) => sum + finding.count, 0)
    if (sourceSecretCount || draftSecretCount) codes.push('secret_like_pattern_requires_human_review')
    if (verdict.reasons.length) codes.push('editorial_or_publication_policy_blocked')

    const exactLines = source.originalText.replace(/\r\n?/g, '\n').split('\n')
    const quoteResults: NovaCuratorClaimResult[] = source.claims.map(claim => {
      const issues: string[] = []
      const lineText = exactLines[claim.line - 1] ?? ''
      const matched = lineText.includes(claim.exactQuote)
      if (!matched || !matchedDigests) issues.push('exact_quote_not_verified')
      const subjectAnchored = !claim.subjectName ||
        claim.exactQuote.toLocaleLowerCase('sv-SE')
          .includes(claim.subjectName.toLocaleLowerCase('sv-SE'))
      if (!subjectAnchored) issues.push('named_entity_not_in_evidence')
      if (claim.time === 'current') issues.push('current_status_requires_fresh_independent_source')
      else if (claim.time === 'planned') issues.push('plan_is_not_production_execution')
      else if (claim.time === 'unknown') issues.push('temporal_scope_unknown')

      const canLink = matched && matchedDigests && subjectAnchored &&
        !codes.includes('source_scope_or_revision_mismatch')
      return {
        id: claim.id,
        line: claim.line,
        literalEvidenceMatched: matched && matchedDigests,
        namedSubjectAnchored: !!subjectAnchored,
        time: claim.time,
        reasonCodes: uniqueSorted(issues),
        immutableSourceUrl: canLink
          ? 'https://github.com/' + PINNED_REPO + '/blob/' +
            trustedScope.pinnedCommitSha + '/' + source.canonicalPath + '#L' + claim.line
          : null,
      }
    })
    for (const result of quoteResults) {
      if (result.literalEvidenceMatched) report.literalEvidenceMatches++
      if (result.reasonCodes.length) report.evidenceNeedsReview++
      if (result.time === 'historical') report.historicalClaims++
      if (result.time === 'current') report.currentClaimsWithoutLiveProof++
    }

    const structuralGood = codes.every(code =>
      code === 'editorial_or_publication_policy_blocked' ||
      code === 'secret_like_pattern_requires_human_review'
    ) && quoteResults.every(c => c.literalEvidenceMatched && c.namedSubjectAnchored)
    if (!structuralGood) codes.push('source_review_requires_repair')
    report.documents.push({
      id: source.id, canonicalPath: source.canonicalPath,
      expectedGitBlobSha: source.expectedGitBlobSha,
      sourceBytesMatchExpectedDigests: matchedDigests,
      repositoryTreeVerifiedByThisFunction: false,
      editorialStatus: parsed.status,
      existingClassification: verdict.classification,
      proposedClassification: source.classificationProposal ?? null,
      ownerClassificationChosenByThisFunction: false,
      publicationEligibleByThisFunction: false,
      reviewReady: structuralGood,
      policyReasonCodes: verdict.reasons,
      reasonCodes: uniqueSorted(codes),
      sourceSecretPatternCount: sourceSecretCount,
      draftSecretPatternCount: draftSecretCount,
      claims: quoteResults,
    })
  }

  report.readyForOwnerReview = report.documents.every(doc => doc.reviewReady)
  report.reasonCodes = uniqueSorted([
    'owner_decision_required',
    'repository_identity_requires_separate_verification',
    'no_approval_or_publication_authority',
    ...report.documents.flatMap(d => d.reasonCodes),
  ])
  return report
}
