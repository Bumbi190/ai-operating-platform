/**
 * Operator-only publication. Never import from request-time modules.
 * The original eligibility/snapshot pipeline remains the publication authority.
 */
import type { KnowledgeProjectionSource } from '@/lib/atlas/knowledge/projection/source'
import { evaluateEligibility } from '@/lib/atlas/knowledge/projection/eligibility'
import { buildKnowledgeSnapshot, type SnapshotDocumentInput } from '@/lib/atlas/knowledge/projection/snapshot'
import { parseCorpus, knowledgeRoot, type PublishedCorpus } from './corpus'
import { requestJson, type OpenVikingConfig } from './client'

export function prepareCorpus(source: KnowledgeProjectionSource, project: { projectId: string; projectSlug: string }) {
  const listing = source.listAll()
  if (listing.unreadable.length) throw new Error('Publication source is unreadable')
  const inputs: SnapshotDocumentInput[] = []
  for (const candidate of listing.candidates) {
    if (!candidate.eligibility.eligible || candidate.eligibility.scope?.kind !== 'project' ||
      candidate.eligibility.scope.projectId !== project.projectId) continue
    const doc = source.readDocument(candidate.path)
    if (!doc || doc.contentHash !== candidate.contentHash) throw new Error('Publication source changed')
    const eligibility = evaluateEligibility({
      doc, rawFrontMatter: doc.rawFrontMatter,
      projectScopeMap: { [project.projectSlug]: project.projectId },
      content: [doc.path, doc.body, ...Object.values(doc.rawFrontMatter)].join('\n'),
    })
    if (!eligibility.eligible || eligibility.scope?.kind !== 'project' ||
      eligibility.scope.projectId !== project.projectId || !doc.type || !eligibility.classification) {
      throw new Error('Publication source changed or is no longer eligible')
    }
    inputs.push({
      path: doc.path, title: doc.title, type: doc.type,
      classification: eligibility.classification, scope: eligibility.scope,
      sourceOfTruth: doc.sourceOfTruth, canonicalPath: doc.canonicalPath, content: doc.body,
    })
  }
  const snapshot = buildKnowledgeSnapshot(inputs)
  const artifact = { projectId: project.projectId, projectSlug: project.projectSlug,
    manifest: snapshot.manifest, documentsJsonl: snapshot.documentsJsonl }
  if (!parseCorpus(artifact)) throw new Error('Publication exceeds runtime corpus contract')
  return artifact
}
function resultOf(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || !('status' in value) || value.status !== 'ok' ||
    !('result' in value) || !value.result || typeof value.result !== 'object' || Array.isArray(value.result)) {
    throw new Error('Invalid OpenViking receipt')
  }
  return value.result as Record<string, unknown>
}
function processingFailed(value: unknown, depth = 0): boolean {
  if (value === null || typeof value !== 'object') return false
  if (depth > 8) return true
  if (Array.isArray(value)) return value.some((entry) => processingFailed(entry, depth + 1))
  const report = value as Record<string, unknown>
  if (['failed', 'cancelled', 'canceled'].includes(String(report.status))) return true
  for (const field of ['error_count', 'failed_count']) {
    if (typeof report[field] === 'number' && report[field] > 0) return true
  }
  if (typeof report.error === 'string' && report.error.trim()) return true
  if (Array.isArray(report.errors) && report.errors.length) return true
  return Object.values(report).some((entry) => processingFailed(entry, depth + 1))
}
function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new Error('Deadline exceeded')); return }
    const abort = () => { clearTimeout(timer); reject(new Error('Deadline exceeded')) }
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve() }, ms)
    signal.addEventListener('abort', abort, { once: true })
  })
}
export async function synchronizeCorpus(args: {
  config: OpenVikingConfig; corpus: PublishedCorpus; previous?: PublishedCorpus;
  deadlineMs?: number; pollIntervalMs?: number; signal?: AbortSignal;
  processingMode?: 'vectors_only' | 'semantic_and_vectors'
}): Promise<{ snapshotId: string; documents: number; ready: true }> {
  const controller = new AbortController()
  const abort = () => controller.abort()
  if (args.signal?.aborted) controller.abort()
  else args.signal?.addEventListener('abort', abort, { once: true })
  const timer = setTimeout(abort, Math.max(1, Math.min(args.deadlineMs ?? 120_000, 600_000)))
  try {
    if (args.previous && args.previous.projectId !== args.corpus.projectId) throw new Error('Project mismatch')
    const root = knowledgeRoot(args.corpus)
    for (const doc of args.corpus.documents) {
      const form = new FormData()
      form.append('file', new Blob([doc.content], { type: 'text/markdown' }), doc.id + '.md')
      const uploaded = resultOf(await requestJson(args.config, '/api/v1/resources/temp_upload',
        { method: 'POST', body: form }, controller.signal))
      if (typeof uploaded.temp_file_id !== 'string' || !uploaded.temp_file_id) throw new Error('Missing upload receipt')
      const destination = root + '/' + doc.id + '.md'
      const accepted = resultOf(await requestJson(args.config, '/api/v1/resources', {
        method: 'POST', body: JSON.stringify({
          temp_file_id: uploaded.temp_file_id, to: destination, create_parent: true,
          args: { parse_mode: 'no_split' },
          processing_mode: args.processingMode ?? 'semantic_and_vectors',
        }),
      }, controller.signal))
      if (accepted.root_uri !== destination || typeof accepted.task_id !== 'string' ||
        !/^[a-zA-Z0-9_-]{1,128}$/.test(accepted.task_id)) throw new Error('Missing ingestion receipt')
      while (true) {
        const task = resultOf(await requestJson(args.config, '/api/v1/tasks/' + accepted.task_id, {}, controller.signal))
        if (task.status === 'completed') {
          if (processingFailed(task)) throw new Error('Ingestion failed')
          break
        }
        if (!['pending', 'queued', 'processing', 'running'].includes(String(task.status))) throw new Error('Ingestion failed')
        await pause(Math.max(1, Math.min(args.pollIntervalMs ?? 250, 1000)), controller.signal)
      }
    }
    if (args.previous && args.previous.snapshotId !== args.corpus.snapshotId) {
      const oldRoot = knowledgeRoot(args.previous)
      const deleted = resultOf(await requestJson(args.config,
        '/api/v1/fs?uri=' + encodeURIComponent(oldRoot) + '&recursive=true',
        { method: 'DELETE' }, controller.signal))
      if (deleted.uri !== oldRoot && deleted.uri !== oldRoot + '/') throw new Error('Missing deletion receipt')
    }
    return { snapshotId: args.corpus.snapshotId, documents: args.corpus.documents.length, ready: true }
  } catch {
    throw new Error('OpenViking synchronization failed')
  } finally {
    clearTimeout(timer)
    args.signal?.removeEventListener('abort', abort)
  }
}
