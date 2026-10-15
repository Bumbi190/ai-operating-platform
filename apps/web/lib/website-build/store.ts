import 'server-only'
import type { createAdminClient } from '@/lib/supabase/admin'
import { assertWebsiteArtifact } from './artifact'
import type { BuildFeedback, BuildPrincipal, BuildRef, BuildSessionView, BuildSnapshot, CreateBuildInput, FeedbackInput, FeedbackInterpretation, PreviewRevision, WebsiteArtifact, WriterRef } from './types'
import { WEBSITE_BUILD_LIMITS } from './types'
type Db = ReturnType<typeof createAdminClient>
export class WebsiteBuildError extends Error {
  constructor(readonly code: string, readonly status = 400, message = code) { super(message); this.name = 'WebsiteBuildError' }
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function validateBuildUuid(value: unknown): asserts value is string { if (typeof value !== 'string' || !UUID.test(value)) throw new WebsiteBuildError('INVALID_IDENTIFIER') }
function validateKey(key: unknown): asserts key is string { if (typeof key !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(key)) throw new WebsiteBuildError('INVALID_IDEMPOTENCY_KEY') }
function allowed(principal: BuildPrincipal, ref: BuildRef): void {
  validateBuildUuid(principal.userId); validateBuildUuid(ref.projectId); validateBuildUuid(ref.sessionId)
  if (!principal.allowedProjectIds.includes(ref.projectId)) throw new WebsiteBuildError('NOT_FOUND', 404)
}
function writerRef(writer: WriterRef): void {
  for (const id of [writer.projectId, writer.sessionId, writer.runId, writer.claimId]) validateBuildUuid(id)
  if (!Number.isSafeInteger(writer.generation) || writer.generation < 1) throw new WebsiteBuildError('INVALID_GENERATION')
}
async function rpc<T>(db: Db, name: string, args: Record<string, unknown>): Promise<T> {
  // Only this boundary adapts JSONB RPC arguments; request handlers never cast a DB.
  const invoke = db as unknown as { rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { code?: string; message?: string } | null }> }
  for(let attempt=0;attempt<4;attempt++){
    const { data, error } = await invoke.rpc(name, args)
    // Retry only a lock that prevented this RPC from acquiring its writer row.
    // Never replay a provider call, a stale claim, or an ambiguous transport failure.
    if(error?.code==='40001'&&error.message?.includes('WEBSITE_WRITER_BUSY')&&attempt<3){
      await new Promise(resolve=>setTimeout(resolve,25*(attempt+1)))
      continue
    }
    if (error) {
      const code = error.code === '23505' ? 'CONFLICT' : error.code === 'P0002' || error.code === '42501' ? 'NOT_FOUND' : error.code === '40001' ? 'FENCED' : error.code === '57014' ? 'CANCELLED' : error.code === '55000' ? 'CONTROL_PENDING' : 'DATABASE_ERROR'
      const status = code === 'CONFLICT' ? 409 : code === 'NOT_FOUND' ? 404 : code === 'FENCED' || code === 'CONTROL_PENDING' ? 409 : code === 'DATABASE_ERROR' ? 503 : 409
      throw new WebsiteBuildError(code, status, error.message || code)
    }
    if (data === null || data === undefined) throw new WebsiteBuildError('DATABASE_ERROR', 503)
    return data as T
  }
  throw new WebsiteBuildError('DATABASE_ERROR',503)
}
export async function createBuildSession(db: Db, principal: BuildPrincipal, input: CreateBuildInput): Promise<BuildSessionView> {
  allowed(principal,{projectId:input.projectId,sessionId:input.projectId})
  if(!('planId' in input))throw new WebsiteBuildError('PLAN_REVIEW_REQUIRED',409)
  if(Object.keys(input).some(key=>!['projectId','planId','revisionId','sha256','decisionId'].includes(key)))throw new WebsiteBuildError('INVALID_BODY')
  const {startApprovedWebsitePlan}=await import('./planning/store')
  return startApprovedWebsitePlan(db,principal,input)
}
export async function readBuildSession(db: Db, principal: BuildPrincipal, ref: BuildRef): Promise<BuildSessionView> {
  allowed(principal, ref); return rpc(db, 'website_build_view', { p_principal: principal, p_ref: ref })
}
export async function appendBuildFeedback(db: Db, principal: BuildPrincipal, ref: BuildRef, input: FeedbackInput): Promise<BuildFeedback> {
  allowed(principal, ref); validateKey(input.idempotencyKey)
  if (typeof input.text !== 'string' || !input.text.trim() || input.text.length > WEBSITE_BUILD_LIMITS.feedbackChars || !['text', 'voice'].includes(input.inputSource)) throw new WebsiteBuildError('INVALID_FEEDBACK')
  if (input.viewedRevisionId !== null) validateBuildUuid(input.viewedRevisionId)
  return rpc(db, 'website_build_append_feedback', { p_principal: principal, p_ref: ref, p_input: input })
}
export async function requestBuildControl(db: Db, principal: BuildPrincipal, ref: BuildRef, action: 'pause' | 'resume' | 'cancel', idempotencyKey: string): Promise<BuildSessionView> {
  allowed(principal, ref); validateKey(idempotencyKey)
  if (!['pause', 'resume', 'cancel'].includes(action)) throw new WebsiteBuildError('INVALID_CONTROL')
  return rpc(db, 'website_build_control', { p_principal: principal, p_ref: ref, p_input: { action, idempotencyKey } })
}
export async function readBuildArtifact(db: Db, principal: BuildPrincipal, ref: BuildRef, revisionId: string): Promise<WebsiteArtifact> {
  allowed(principal, ref); validateBuildUuid(revisionId)
  const artifact = await rpc<WebsiteArtifact>(db, 'website_build_read_artifact', { p_principal: principal, p_ref: ref, p_revision_id: revisionId })
  assertWebsiteArtifact(artifact); return artifact
}
export async function loadBuildSnapshot(db: Db, writer: WriterRef): Promise<BuildSnapshot> { writerRef(writer); return rpc(db, 'website_build_snapshot', { p_writer: writer }) }
export async function setBuildStage(db: Db, writer: WriterRef, status: 'interpreting' | 'building' | 'validating'): Promise<void> { writerRef(writer); await rpc(db, 'website_build_set_stage', { p_writer: writer, p_status: status }) }
export async function recordBuildInterpretation(db: Db, writer: WriterRef, interpretation: FeedbackInterpretation): Promise<void> { writerRef(writer); await rpc(db, 'website_build_record_interpretation', { p_writer: writer, p_interpretation: interpretation }) }
export async function saveBuildCandidate(db: Db, writer: WriterRef, artifact: WebsiteArtifact): Promise<void> { writerRef(writer); assertWebsiteArtifact(artifact); await rpc(db, 'website_build_save_candidate', { p_writer: writer, p_artifact: artifact }) }
export async function parkBuildSession(db: Db, writer: WriterRef): Promise<void> { writerRef(writer); await rpc(db, 'website_build_park', { p_writer: writer }) }
export async function commitBuildRevision(db: Db, writer: WriterRef, artifact: WebsiteArtifact): Promise<PreviewRevision> { writerRef(writer); assertWebsiteArtifact(artifact); return rpc(db, 'website_build_commit_revision', { p_writer: writer, p_artifact: artifact }) }
