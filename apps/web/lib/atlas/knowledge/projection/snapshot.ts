/**
 * lib/atlas/knowledge/projection/snapshot.ts — the immutable snapshot contract.
 *
 * Pure and local. No filesystem, no vault, no network, no Supabase, no upload,
 * no pointer. Given already-validated document inputs, produce the exact bytes
 * of `documents.jsonl` and `knowledge-manifest.json` and the identity derived
 * from them. Slice 3B feeds this from a commit-pinned vault; Slice 3C uploads
 * what it produces. Neither of those exists yet, and nothing here reaches toward
 * them.
 *
 * ── MODEL B: IDENTITY IS PROJECTED BYTES, NOTHING ELSE ───────────────────────
 *   snapshot_id = sha256(canonicalCompactJson({
 *     schema_version, document_count, documents_hash
 *   }))
 *
 * `publisher_version`, `vault_git_commit`, `published_at` and the operator are
 * PUBLICATION PROVENANCE and live on the publication event, never here. The
 * reason is one property: same content, same id. A publisher change that alters
 * serialized bytes changes `documents_hash` and therefore the id by
 * construction; a publisher change that produces identical bytes must not
 * manufacture a new content identity and force a pointless re-upload.
 *
 * `schema_version` stays in identity where `publisher_version` does not, because
 * it declares how the bytes are to be INTERPRETED: a purely semantic schema
 * change could leave `documents_hash` untouched while changing what the snapshot
 * asserts. `document_count` is, honestly, redundant for tamper detection —
 * anything that adds, removes or alters a record already moves `documents_hash`.
 * It is kept as a cheap independent cross-check that fails before a large file
 * is hashed, not because it catches something the hash misses.
 *
 * ── THE RECORD IS BUILT FIELD BY FIELD, RECURSIVELY ──────────────────────────
 * No spreading, no `JSON.stringify(candidate)`, and that discipline does NOT
 * stop at the top level: `scope` is reconstructed from its own validated parts
 * too. Passing the caller's scope object straight through would publish whatever
 * else happened to be hanging off it, which is the same defect one level down.
 */

import { sha256 } from '@/lib/architecture-knowledge/hash'
import { knowledgeIdFor } from '../document'
import { isKnowledgeType, isSourceOfTruth } from '../policy'
import type { KnowledgeSourceOfTruth, KnowledgeType } from '../types'
import { canonicalCompactJson, canonicalPrettyJson, utf8Bytes } from './canonical-json'
import { checkCanonicalPath, checkVaultRelativePath } from './canonical-path'
import {
  isCanonicalProjectId, PUBLICATION_CLASSIFICATIONS, REMOTELY_PUBLISHABLE_CLASSIFICATIONS,
  type PublicationClassification, type ResolvedScope,
} from './eligibility'

/**
 * Interpretation contract for the bytes, and part of snapshot identity. Bumping
 * it is a deliberate decision with its own review, never a side effect.
 */
export const KNOWLEDGE_SNAPSHOT_SCHEMA_VERSION = 'knowledge-projection-v1'

/** Why a snapshot could not be built. One code per distinct operator action. */
export type SnapshotBuildReason =
  | 'path_invalid'
  | 'title_invalid'
  | 'content_invalid'
  | 'type_unrecognized'
  | 'classification_unrecognized'
  | 'classification_not_remotely_publishable'
  | 'scope_invalid'
  | 'source_of_truth_unrecognized'
  | 'canonical_pointer_missing'
  | 'canonical_pointer_malformed'
  | 'canonical_pointer_unexpected'
  | 'duplicate_source_path'
  | 'document_id_collision'
  | 'path_case_collision'
  | 'source_bom_present'
  | 'source_encoding_invalid'

/** Raised instead of publishing something questionable. Never swallowed. */
export class SnapshotBuildError extends Error {
  readonly reason: SnapshotBuildReason
  /** Vault-relative path of the offending document, when one is identifiable. */
  readonly documentPath: string | null

  constructor(reason: SnapshotBuildReason, message: string, documentPath: string | null = null) {
    super(message)
    this.name = 'SnapshotBuildError'
    this.reason = reason
    this.documentPath = documentPath
  }
}

/**
 * What the builder needs about one publishable note. Deliberately NOT
 * `ProjectionCandidate`: that type carries diagnostics, raw frontmatter, mtimes
 * and a declared-vs-trusted split, none of which may reach a snapshot. Taking a
 * narrow input makes over-serialization a compile error rather than a review
 * catch.
 */
export interface SnapshotDocumentInput {
  /** Vault-relative source path. Also the sole input to `id`. */
  path: string
  title: string
  type: KnowledgeType
  classification: PublicationClassification
  scope: ResolvedScope
  /** The TRUSTED classification, after Phase 1's pointer contract. */
  sourceOfTruth: KnowledgeSourceOfTruth
  /** Required exactly when sourceOfTruth is 'repository'; absent otherwise. */
  canonicalPath?: string | null
  /** Frontmatter-free, LF-normalized body. */
  content: string
}

/**
 * Exactly what leaves the machine. Nine fields, one of them conditional.
 *
 * `status` is deliberately ABSENT. Every record in a snapshot is necessarily
 * `approved`, so the field would be a constant carrying no information — and
 * worse, shipping it invites a reader to branch on it and create a second,
 * weaker approval gate beside the real one. Presence in `documents.jsonl` IS the
 * approval statement.
 *
 * `classification` IS shipped even though the publisher already gated on it, so
 * the reader can enforce its own remote-permitted subset independently. That
 * duplication is the point: it catches a publisher bug at read time.
 */
export interface RemoteKnowledgeRecord {
  id: string
  path: string
  title: string
  type: KnowledgeType
  classification: PublicationClassification
  scope: ResolvedScope
  source_of_truth: KnowledgeSourceOfTruth
  /** Present exactly when source_of_truth is 'repository'. Provenance only. */
  canonical_path?: string
  content: string
}

export interface KnowledgeSnapshotManifest {
  document_count: number
  documents_hash: string
  schema_version: string
  snapshot_id: string
}

export interface KnowledgeSnapshot {
  records: RemoteKnowledgeRecord[]
  /** Exact bytes (as a UTF-8 string) of documents.jsonl. */
  documentsJsonl: string
  documentsHash: string
  /** Exact compact bytes hashed into snapshot_id. No terminal newline. */
  identityPreimage: string
  snapshotId: string
  manifest: KnowledgeSnapshotManifest
  /** Exact bytes (as a UTF-8 string) of knowledge-manifest.json. */
  manifestJson: string
}

/** `isSourceOfTruth` returns boolean, not a predicate. Narrow without touching Phase 1. */
function isKnownSourceOfTruth(value: unknown): value is KnowledgeSourceOfTruth {
  return isSourceOfTruth(value)
}

function isPublicationClassification(value: unknown): value is PublicationClassification {
  return typeof value === 'string' &&
    (PUBLICATION_CLASSIFICATIONS as readonly string[]).includes(value)
}

/**
 * Byte-stable document order, mirroring the comparator Slice 1 already pinned in
 * projection/source.ts: plain code-unit comparison on the vault-relative path,
 * independent of locale and of filesystem enumeration order. Document order is
 * part of documents.jsonl and therefore part of snapshot identity, so it is
 * reused rather than reinvented — a `localeCompare` here would make the snapshot
 * id depend on the machine's ICU data.
 */
export function compareDocumentPath(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * Reject duplicate and colliding documents.
 *
 * Exported separately because a genuine 64-bit id collision cannot be produced
 * on demand, so the guard has to be testable with a crafted input rather than
 * only through the builder.
 *
 * `id` is `sha256(path).slice(0, 16)` — 64 bits, path-derived. Same path always
 * gives the same id; DIFFERENT paths may theoretically collide. That implication
 * runs one way only, so both are checked.
 *
 * Case folding uses `toLowerCase()`, never `toLocaleLowerCase()`, which would
 * reintroduce the locale dependence this whole module exists to remove. It
 * catches case variants, NOT Unicode normalization variants (NFC vs NFD) — a
 * real filesystem's equivalence rules are broader, and proving that belongs with
 * the real-vault work, not here.
 */
export function assertNoCollisions(entries: ReadonlyArray<{ id: string; path: string }>): void {
  // Map/Set only. An object keyed by a source-controlled path would resolve
  // `__proto__`, `constructor` and `toString` against Object.prototype and
  // report collisions that do not exist — the defect already fixed once in the
  // eligibility evaluator.
  const seenPaths = new Set<string>()
  const idOwner = new Map<string, string>()
  const foldedOwner = new Map<string, string>()

  for (const entry of entries) {
    if (seenPaths.has(entry.path)) {
      throw new SnapshotBuildError(
        'duplicate_source_path', `duplicate source path: ${entry.path}`, entry.path,
      )
    }
    seenPaths.add(entry.path)

    const idHolder = idOwner.get(entry.id)
    if (idHolder !== undefined) {
      throw new SnapshotBuildError(
        'document_id_collision',
        `document id ${entry.id} is shared by different paths: ${idHolder} and ${entry.path}`,
        entry.path,
      )
    }
    idOwner.set(entry.id, entry.path)

    const folded = entry.path.toLowerCase()
    const foldedHolder = foldedOwner.get(folded)
    if (foldedHolder !== undefined) {
      throw new SnapshotBuildError(
        'path_case_collision',
        `paths differ only by case and would be conflated by a case-insensitive reader: ` +
          `${foldedHolder} and ${entry.path}`,
        entry.path,
      )
    }
    foldedOwner.set(folded, entry.path)
  }
}

/** Build one remote record, field by explicit field. Throws on anything unfit. */
export function buildRemoteRecord(input: SnapshotDocumentInput): RemoteKnowledgeRecord {
  const pathCheck = checkVaultRelativePath(input.path)
  if (!pathCheck.valid) {
    // The value is never echoed — a bad path is exactly the shape of thing that
    // turns out to contain something sensitive. Only the rule names come back.
    throw new SnapshotBuildError(
      'path_invalid', `document path is not vault-relative: ${pathCheck.violations.join(', ')}`,
    )
  }
  const path: string = input.path
  if (typeof input.title !== 'string') {
    throw new SnapshotBuildError('title_invalid', 'title must be a string', path)
  }
  if (typeof input.content !== 'string') {
    throw new SnapshotBuildError('content_invalid', 'content must be a string', path)
  }
  if (!isKnowledgeType(input.type)) {
    throw new SnapshotBuildError('type_unrecognized', 'type is outside the vocabulary', path)
  }

  if (!isPublicationClassification(input.classification)) {
    throw new SnapshotBuildError(
      'classification_unrecognized', 'classification is outside Publication Policy v1', path,
    )
  }
  // Defence in depth. The eligibility evaluator already refuses these, and the
  // builder must not DEPEND on having been called correctly — a publisher bug
  // upstream must fail here rather than ship confidential material.
  if (!REMOTELY_PUBLISHABLE_CLASSIFICATIONS.includes(input.classification)) {
    throw new SnapshotBuildError(
      'classification_not_remotely_publishable',
      `classification ${input.classification} may not be published remotely in v1`, path,
    )
  }

  if (!isKnownSourceOfTruth(input.sourceOfTruth)) {
    throw new SnapshotBuildError(
      'source_of_truth_unrecognized', 'source_of_truth is outside the vocabulary', path,
    )
  }

  // Reconstructed, never passed through: the caller's object may carry fields
  // that have no business in a published snapshot.
  const rawScope = input.scope
  let scope: ResolvedScope
  if (rawScope !== null && typeof rawScope === 'object' && rawScope.kind === 'platform') {
    scope = { kind: 'platform' }
  } else if (rawScope !== null && typeof rawScope === 'object' && rawScope.kind === 'project') {
    if (!isCanonicalProjectId(rawScope.projectId)) {
      throw new SnapshotBuildError(
        'scope_invalid', 'project scope requires a canonical project id', path,
      )
    }
    scope = { kind: 'project', projectId: rawScope.projectId }
  } else {
    throw new SnapshotBuildError('scope_invalid', 'scope must be platform or project', path)
  }

  // ── the repository pointer contract ────────────────────────────────────────
  // undefined and null both mean "not declared". Any string, including '', is a
  // declaration and is judged on its own terms.
  const declaredPointer = input.canonicalPath ?? null
  const record: RemoteKnowledgeRecord = {
    id: knowledgeIdFor(path),
    path,
    title: input.title,
    type: input.type,
    classification: input.classification,
    scope,
    source_of_truth: input.sourceOfTruth,
    content: input.content,
  }

  if (input.sourceOfTruth === 'repository') {
    if (declaredPointer === null) {
      throw new SnapshotBuildError(
        'canonical_pointer_missing',
        'source_of_truth: repository requires a canonical_path', path,
      )
    }
    const check = checkCanonicalPath(declaredPointer)
    if (!check.valid) {
      // The value itself is never echoed: a malformed pointer is exactly the
      // shape of thing that turns out to contain something sensitive.
      throw new SnapshotBuildError(
        'canonical_pointer_malformed',
        `canonical_path is malformed: ${check.violations.join(', ')}`, path,
      )
    }
    record.canonical_path = declaredPointer
  } else if (declaredPointer !== null) {
    // Neither silently serialized nor silently ignored. A pointer on a note that
    // does not claim repository authority is contradictory metadata, and the
    // operator has to resolve which of the two statements is wrong.
    throw new SnapshotBuildError(
      'canonical_pointer_unexpected',
      `canonical_path declared but source_of_truth is ${input.sourceOfTruth}`, path,
    )
  }

  return record
}

/**
 * Exact bytes of documents.jsonl.
 *
 * Zero records is EXACTLY zero bytes, not "\n": an empty file is unambiguous,
 * and its SHA-256 is the well-defined empty-string digest.
 *
 * One record per physical line holds for ANY content, because JSON.stringify
 * escapes U+000A and U+000D inside strings. That is the invariant JSONL rests
 * on, and it is tested rather than assumed.
 */
export function renderDocumentsJsonl(records: readonly RemoteKnowledgeRecord[]): string {
  if (records.length === 0) return ''
  return `${records.map((record) => canonicalCompactJson(record)).join('\n')}\n`
}

/** The exact compact bytes hashed into snapshot_id. No terminal newline. */
export function renderIdentityPreimage(
  schemaVersion: string, documentCount: number, documentsHash: string,
): string {
  return canonicalCompactJson({
    schema_version: schemaVersion,
    document_count: documentCount,
    documents_hash: documentsHash,
  })
}

export interface BuildSnapshotOptions {
  /** Override only for tests and a deliberate schema bump. */
  schemaVersion?: string
}

/**
 * Build a complete snapshot from validated inputs.
 *
 * Deterministic end to end: same inputs, byte-identical artifacts, regardless of
 * the order they were supplied in, the machine's locale, or the wall clock.
 * Nothing here reads a clock — there is no `created_at` in an immutable
 * snapshot, by design.
 */
export function buildKnowledgeSnapshot(
  inputs: readonly SnapshotDocumentInput[],
  options: BuildSnapshotOptions = {},
): KnowledgeSnapshot {
  const schemaVersion = options.schemaVersion ?? KNOWLEDGE_SNAPSHOT_SCHEMA_VERSION

  const records = inputs.map(buildRemoteRecord)
  records.sort((a, b) => compareDocumentPath(a.path, b.path))
  assertNoCollisions(records)

  const documentsJsonl = renderDocumentsJsonl(records)
  const documentsHash = sha256(utf8Bytes(documentsJsonl))
  const identityPreimage = renderIdentityPreimage(schemaVersion, records.length, documentsHash)
  const snapshotId = sha256(utf8Bytes(identityPreimage))

  const manifest: KnowledgeSnapshotManifest = {
    document_count: records.length,
    documents_hash: documentsHash,
    schema_version: schemaVersion,
    snapshot_id: snapshotId,
  }

  return {
    records,
    documentsJsonl,
    documentsHash,
    identityPreimage,
    snapshotId,
    manifest,
    manifestJson: canonicalPrettyJson(manifest),
  }
}

/** Recompute identity from a manifest's own fields. The manifest self-verifies. */
export function verifyManifest(
  manifest: KnowledgeSnapshotManifest, documentsJsonl: string,
): boolean {
  if (sha256(utf8Bytes(documentsJsonl)) !== manifest.documents_hash) return false
  const preimage = renderIdentityPreimage(
    manifest.schema_version, manifest.document_count, manifest.documents_hash,
  )
  return sha256(utf8Bytes(preimage)) === manifest.snapshot_id
}

// ─────────────────────────────────────────────────────────────────────────────
// LOCAL BUILD EVIDENCE — never remote
// ─────────────────────────────────────────────────────────────────────────────

const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf])

/**
 * SHA-256 of the actual file bytes, BEFORE any decoding.
 *
 * This is local build evidence — TOCTOU defence, source-drift detection,
 * deterministic-build proof — and it must never enter documents.jsonl, the
 * manifest or snapshot_id. It is derived from the whole raw note including
 * frontmatter that is deliberately not remotely serialized, so shipping it would
 * let unvalidated source material influence a remote value.
 *
 * Distinct from Phase 1's `contentHash`, which hashes the DECODED JS string
 * (`readFileSync(path, 'utf8')`) and is therefore not a raw-byte hash: for
 * non-UTF-8 input the two differ, because decoding has already replaced the
 * invalid bytes.
 */
export function sourceBytesHash(bytes: Buffer): string {
  return sha256(bytes)
}

/**
 * Strictly decode source bytes, or refuse.
 *
 * The BOM is checked on the BYTES first and on purpose: `TextDecoder` with the
 * default `ignoreBOM: false` silently strips a leading BOM, which is exactly the
 * kind of invisible transform between what was hashed and what was parsed that
 * this contract exists to prevent. Owner decision: a leading UTF-8 BOM is a hard
 * build error, not something to strip and not something to normalize away.
 *
 * Invalid UTF-8 aborts too. Node's default lossy decoding would substitute
 * U+FFFD and publish text that never existed in the source.
 */
export function decodeSourceBytes(bytes: Buffer, sourcePath: string | null = null): string {
  if (bytes.subarray(0, 3).equals(UTF8_BOM)) {
    throw new SnapshotBuildError(
      'source_bom_present',
      'source begins with a UTF-8 BOM; it is refused rather than stripped', sourcePath,
    )
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new SnapshotBuildError(
      'source_encoding_invalid', 'source is not valid UTF-8', sourcePath,
    )
  }
}
