/**
 * Runtime readers for publication artifacts. No vault or operator-source imports.
 * Project and platform envelopes remain distinct and fail closed on mixed scopes.
 */
import { sha256 } from '@/lib/architecture-knowledge/hash'
import { knowledgeIdFor } from '@/lib/atlas/knowledge/document'
import { isExcludedPath, isKnowledgeType, isSourceOfTruth } from '@/lib/atlas/knowledge/policy'
import type { KnowledgeType, KnowledgeSourceOfTruth } from '@/lib/atlas/knowledge/types'

export interface PublishedDocument {
  id: string; path: string; title: string; type: KnowledgeType
  classification: 'public' | 'internal'; content: string
  sourceOfTruth: KnowledgeSourceOfTruth; canonicalPath: string | null
}
export interface PublishedCorpus {
  projectId: string; projectSlug: string; snapshotId: string; documents: PublishedDocument[]
}
export interface PublishedPlatformCorpus {
  scope: 'platform'; snapshotId: string; documents: PublishedDocument[]
}
export type PublishedKnowledgeCorpus = PublishedCorpus | PublishedPlatformCorpus
export const PROJECT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const HASH = /^[0-9a-f]{64}$/
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
function relativePath(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 512 &&
    !/[:\\\u0000-\u001f?#]/.test(value) && !value.startsWith('/') &&
    value.split('/').every((part) => part !== '' && part !== '.' && part !== '..')
}
export function knowledgeRoot(corpus: PublishedKnowledgeCorpus): string {
  const scope = 'projectId' in corpus ? 'projects/' + corpus.projectId : 'platform'
  return 'viking://resources/omnira/' + scope + '/knowledge/' + corpus.snapshotId
}
function readDocuments(input: Record<string, unknown>, acceptsScope: (scope: Record<string, unknown>) => boolean) {
  if (!object(input.manifest) || typeof input.documentsJsonl !== 'string' ||
    Buffer.byteLength(input.documentsJsonl, 'utf8') > 2_000_000) return null
  const manifest = input.manifest
  const bytes = input.documentsJsonl
  if (manifest.schema_version !== 'knowledge-projection-v1' ||
    typeof manifest.documents_hash !== 'string' || !HASH.test(manifest.documents_hash) ||
    typeof manifest.snapshot_id !== 'string' || !HASH.test(manifest.snapshot_id) ||
    !Number.isInteger(manifest.document_count) || Number(manifest.document_count) < 0 ||
    Number(manifest.document_count) > 128 || sha256(bytes) !== manifest.documents_hash) return null
  const identity = JSON.stringify({
    document_count: manifest.document_count, documents_hash: manifest.documents_hash,
    schema_version: manifest.schema_version,
  })
  if (sha256(identity) !== manifest.snapshot_id) return null
  if (bytes !== '' && (!bytes.endsWith('\n') || bytes.includes('\r'))) return null
  const rows: unknown[] = bytes === '' ? [] : bytes.slice(0, -1).split('\n').map(line => JSON.parse(line))
  if (rows.length !== manifest.document_count) return null
  const ids = new Set<string>(), paths = new Set<string>()
  const documents: PublishedDocument[] = []
  for (const row of rows) {
    if (!object(row) || !relativePath(row.path) || isExcludedPath(row.path) ||
      typeof row.id !== 'string' || row.id !== knowledgeIdFor(row.path) ||
      typeof row.title !== 'string' || row.title.length > 240 ||
      !isKnowledgeType(row.type) || !isSourceOfTruth(row.source_of_truth) ||
      !['public', 'internal'].includes(String(row.classification)) ||
      !object(row.scope) || !acceptsScope(row.scope) ||
      typeof row.content !== 'string' || row.content.length > 40_000 ||
      Object.keys(row).some(key => !['id', 'path', 'title', 'type', 'classification', 'scope', 'source_of_truth', 'canonical_path', 'content'].includes(key))) return null
    if (row.source_of_truth === 'repository' ? !relativePath(row.canonical_path) : row.canonical_path !== undefined) return null
    const folded = row.path.toLowerCase()
    if (ids.has(row.id) || paths.has(folded)) return null
    ids.add(row.id); paths.add(folded)
    documents.push({
      id: row.id, path: row.path, title: row.title, type: row.type,
      classification: row.classification as 'public' | 'internal',
      content: row.content, sourceOfTruth: row.source_of_truth as KnowledgeSourceOfTruth,
      canonicalPath: typeof row.canonical_path === 'string' ? row.canonical_path : null,
    })
  }
  return { snapshotId: manifest.snapshot_id, documents }
}
/** Hash/count/scope validation is repeated at read time. */
export function parseCorpus(input: unknown): PublishedCorpus | null {
  try {
    if (!object(input) || typeof input.projectId !== 'string' || !PROJECT_ID.test(input.projectId) ||
      typeof input.projectSlug !== 'string' || !/^[a-z0-9][a-z0-9-]{0,79}$/.test(input.projectSlug) ||
      'scope' in input) return null
    const result = readDocuments(input, scope => scope.kind === 'project' && scope.projectId === input.projectId &&
      Object.keys(scope).every(key => ['kind', 'projectId'].includes(key)))
    return result ? { projectId: input.projectId, projectSlug: input.projectSlug, ...result } : null
  } catch { return null }
}
export function parsePlatformCorpus(input: unknown): PublishedPlatformCorpus | null {
  try {
    if (!object(input) || !object(input.scope) || input.scope.kind !== 'platform' ||
      Object.keys(input.scope).some(key => key !== 'kind') ||
      Object.keys(input).some(key => !['scope', 'manifest', 'documentsJsonl', 'sourceVaultCommit'].includes(key))) return null
    const result = readDocuments(input, scope => scope.kind === 'platform' && Object.keys(scope).every(key => key === 'kind'))
    return result ? { scope: 'platform', ...result } : null
  } catch { return null }
}
