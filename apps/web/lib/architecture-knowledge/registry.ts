import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { knowledgeRegistryPath, findRepositoryRoot } from './paths'
import {
  KNOWLEDGE_SCHEMA_VERSION,
  type ActivationStatus,
  type CanonicalStatus,
  type KnowledgeAdapterId,
  type KnowledgeClassification,
  type KnowledgeScope,
  type KnowledgeSource,
  type KnowledgeSourceRegistry,
} from './types'

const CANONICAL_STATUSES = new Set<CanonicalStatus>(['verified', 'approved', 'candidate', 'draft', 'deprecated', 'superseded'])
const ACTIVATION_STATUSES = new Set<ActivationStatus>(['active', 'inactive'])
const CLASSIFICATIONS = new Set<KnowledgeClassification>(['public', 'internal', 'confidential', 'local_only', 'prohibited'])
const ADAPTERS = new Set<KnowledgeAdapterId>(['intelligence-fabric', 'mobile-intelligence', 'intelligence-graph', 'executive-intelligence'])
const SHA256 = /^[a-f0-9]{64}$/

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Registry field ${field} must be a non-empty string`)
  return value
}

function nullableString(value: unknown, field: string): string | null {
  if (value === null) return null
  return requiredString(value, field)
}

function validateScope(value: unknown, sourceId: string): KnowledgeScope {
  if (!value || typeof value !== 'object') throw new Error(`${sourceId}: missing scope`)
  const scope = value as Record<string, unknown>
  if (scope.kind === 'platform') return { kind: 'platform' }
  if (scope.kind === 'tenant') return { kind: 'tenant', tenantId: requiredString(scope.tenantId, `${sourceId}.scope.tenantId`) }
  if (scope.kind === 'project') {
    return {
      kind: 'project',
      projectId: requiredString(scope.projectId, `${sourceId}.scope.projectId`),
      ...(scope.tenantId ? { tenantId: requiredString(scope.tenantId, `${sourceId}.scope.tenantId`) } : {}),
    }
  }
  throw new Error(`${sourceId}: invalid scope kind`)
}

function validateSource(value: unknown): KnowledgeSource {
  if (!value || typeof value !== 'object') throw new Error('Registry source must be an object')
  const raw = value as Record<string, unknown>
  const knowledgeSourceId = requiredString(raw.knowledgeSourceId, 'knowledgeSourceId')
  const canonicalStatus = requiredString(raw.canonicalStatus, `${knowledgeSourceId}.canonicalStatus`) as CanonicalStatus
  const activationStatus = requiredString(raw.activationStatus, `${knowledgeSourceId}.activationStatus`) as ActivationStatus
  const classification = requiredString(raw.classification, `${knowledgeSourceId}.classification`) as KnowledgeClassification
  const adapter = requiredString(raw.adapter, `${knowledgeSourceId}.adapter`) as KnowledgeAdapterId
  if (!CANONICAL_STATUSES.has(canonicalStatus)) throw new Error(`${knowledgeSourceId}: invalid canonicalStatus`)
  if (!ACTIVATION_STATUSES.has(activationStatus)) throw new Error(`${knowledgeSourceId}: invalid activationStatus`)
  if (!CLASSIFICATIONS.has(classification)) throw new Error(`${knowledgeSourceId}: invalid classification`)
  if (!ADAPTERS.has(adapter)) throw new Error(`${knowledgeSourceId}: invalid adapter`)
  const sourceChecksum = requiredString(raw.sourceChecksum, `${knowledgeSourceId}.sourceChecksum`)
  if (!SHA256.test(sourceChecksum)) throw new Error(`${knowledgeSourceId}: invalid sourceChecksum`)
  if (typeof raw.current !== 'boolean') throw new Error(`${knowledgeSourceId}: current must be boolean`)

  return {
    knowledgeSourceId,
    bookId: requiredString(raw.bookId, `${knowledgeSourceId}.bookId`),
    title: requiredString(raw.title, `${knowledgeSourceId}.title`),
    version: requiredString(raw.version, `${knowledgeSourceId}.version`),
    canonicalStatus,
    activationStatus,
    current: raw.current,
    canonicalPath: requiredString(raw.canonicalPath, `${knowledgeSourceId}.canonicalPath`),
    knowledgePath: requiredString(raw.knowledgePath, `${knowledgeSourceId}.knowledgePath`),
    adapter,
    manifestPath: requiredString(raw.manifestPath, `${knowledgeSourceId}.manifestPath`),
    sourceChecksum,
    approvedAt: nullableString(raw.approvedAt, `${knowledgeSourceId}.approvedAt`),
    effectiveAt: nullableString(raw.effectiveAt, `${knowledgeSourceId}.effectiveAt`),
    supersedes: nullableString(raw.supersedes, `${knowledgeSourceId}.supersedes`),
    supersededBy: nullableString(raw.supersededBy, `${knowledgeSourceId}.supersededBy`),
    deprecatedAt: nullableString(raw.deprecatedAt, `${knowledgeSourceId}.deprecatedAt`),
    scope: validateScope(raw.scope, knowledgeSourceId),
    classification,
  }
}

export function validateKnowledgeRegistry(value: unknown, repoRoot?: string): KnowledgeSourceRegistry {
  if (!value || typeof value !== 'object') throw new Error('Knowledge registry must be an object')
  const raw = value as Record<string, unknown>
  if (raw.schemaVersion !== KNOWLEDGE_SCHEMA_VERSION) throw new Error(`Unsupported registry schemaVersion: ${String(raw.schemaVersion)}`)
  if (!Array.isArray(raw.sources) || raw.sources.length === 0) throw new Error('Knowledge registry must contain sources')
  const sources = raw.sources.map(validateSource)
  const ids = new Set<string>()
  for (const source of sources) {
    if (ids.has(source.knowledgeSourceId)) throw new Error(`Duplicate knowledgeSourceId: ${source.knowledgeSourceId}`)
    ids.add(source.knowledgeSourceId)
    if (source.activationStatus === 'active' && !['approved', 'verified'].includes(source.canonicalStatus)) {
      throw new Error(`${source.knowledgeSourceId}: candidate/draft/deprecated source cannot be active`)
    }
    if (source.activationStatus === 'active' && ['local_only', 'prohibited'].includes(source.classification)) {
      throw new Error(`${source.knowledgeSourceId}: local_only/prohibited source cannot enter the cloud artifact`)
    }
  }
  const activeCurrent = new Map<string, number>()
  for (const source of sources.filter(item => item.activationStatus === 'active' && item.current)) {
    activeCurrent.set(source.bookId, (activeCurrent.get(source.bookId) ?? 0) + 1)
  }
  for (const [bookId, count] of activeCurrent) {
    if (count !== 1) throw new Error(`${bookId}: expected exactly one current active version, received ${count}`)
  }
  if (repoRoot) {
    for (const source of sources) {
      for (const path of [source.canonicalPath, source.knowledgePath, source.manifestPath]) {
        if (!path || !resolve(repoRoot, path).startsWith(resolve(repoRoot))) throw new Error(`${source.knowledgeSourceId}: invalid repository path`)
      }
    }
  }
  return { schemaVersion: KNOWLEDGE_SCHEMA_VERSION, sources }
}

export function loadKnowledgeRegistry(repoRoot = findRepositoryRoot()): KnowledgeSourceRegistry {
  const raw = JSON.parse(readFileSync(knowledgeRegistryPath(repoRoot), 'utf8')) as unknown
  return validateKnowledgeRegistry(raw, repoRoot)
}

/**
 * The single definition of "may this source appear in a built artifact?".
 *
 * Generic and book-agnostic on purpose: the builder selects sources with it and
 * the verifier re-checks every source the artifact actually carries against it,
 * so a source can never reach the artifact through a path the other side did
 * not sanction. Returns the failed reason (not a boolean) so the verifier can
 * report which eligibility rule was broken.
 */
export function artifactEligibilityFailure(source: KnowledgeSource): string | null {
  if (source.activationStatus !== 'active') return `activationStatus=${source.activationStatus}`
  if (!source.current) return 'current=false'
  if (!['approved', 'verified'].includes(source.canonicalStatus)) return `canonicalStatus=${source.canonicalStatus}`
  if (['local_only', 'prohibited'].includes(source.classification)) return `classification=${source.classification}`
  return null
}

export function isArtifactEligibleSource(source: KnowledgeSource): boolean {
  return artifactEligibilityFailure(source) === null
}

export function activeKnowledgeSources(registry: KnowledgeSourceRegistry): KnowledgeSource[] {
  return registry.sources
    .filter(isArtifactEligibleSource)
    .sort((a, b) => a.knowledgeSourceId.localeCompare(b.knowledgeSourceId))
}
