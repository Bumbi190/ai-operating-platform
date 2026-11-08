import 'server-only'
import type {createAdminClient} from '@/lib/supabase/admin'
import type {BuildPrincipal} from '../types'
import {WebsiteBuildError, validateBuildUuid} from '../store'
import {studioKey, studioPrincipal} from '../studio/store'
import {prospectHash, validateProspectContent, prospectReadiness} from './validation'
import type {ProspectRef, ProspectRevisionRef, ProspectView, SaveProspectInput} from './types'
type Db = ReturnType<typeof createAdminClient>
async function call<T>(db: Db, name: string, principal: BuildPrincipal, input: unknown): Promise<T> {
  const result = await (db as unknown as {rpc(n: string, i: unknown): Promise<{data: unknown; error: {code?: string; message?: string} | null}>}).rpc(name,{p_principal:principal,p_input:input})
  if (result.error) {
    const error = result.error
    const code = ['PROSPECT_STALE','PROSPECT_REVIEW_INCOMPLETE','PROSPECT_DESIGN_STALE','PROJECT_INACTIVE'].find(c => error.message?.includes(c)) ?? (['P0002','42501'].includes(error.code ?? '') ? 'NOT_FOUND' : error.code === '23505' ? 'CONFLICT' : ['22023','22P02','23514'].includes(error.code ?? '') ? 'INVALID_PROSPECT' : 'BUILD_UNAVAILABLE')
    throw new WebsiteBuildError(code, code === 'NOT_FOUND' ? 404 : code === 'INVALID_PROSPECT' ? 400 : code === 'BUILD_UNAVAILABLE' ? 503 : 409)
  }
  if (result.data === null) throw new WebsiteBuildError('BUILD_UNAVAILABLE',503)
  return result.data as T
}
export async function listProspects(db: Db, p: BuildPrincipal, projectId: string): Promise<ProspectView[]> {
  studioPrincipal(p, projectId)
  const result=await call<ProspectView[]>(db,'website_prospect_list',p,{projectId})
  for(const view of result)if(prospectHash(view.content)!==view.sha256)throw new WebsiteBuildError('PROSPECT_INTEGRITY_ERROR',503)
  return result
}
export async function readProspect(db: Db, p: BuildPrincipal, ref: ProspectRef): Promise<ProspectView> {
  studioPrincipal(p,ref.projectId); validateBuildUuid(ref.prospectId)
  const view = await call<ProspectView>(db,'website_prospect_view',p,ref)
  validateProspectContent(view.content)
  if (prospectHash(view.content) !== view.sha256) throw new WebsiteBuildError('PROSPECT_INTEGRITY_ERROR',503)
  return view
}
export async function saveProspect(db: Db, p: BuildPrincipal, input: SaveProspectInput): Promise<ProspectView> {
  studioPrincipal(p,input.projectId); if (input.prospectId) validateBuildUuid(input.prospectId)
  if (input.expectedRevisionId !== null) validateBuildUuid(input.expectedRevisionId)
  studioKey(input.idempotencyKey)
  const content = validateProspectContent(input.content)
  if (content.design && content.design.projectId !== input.projectId) throw new WebsiteBuildError('INVALID_PROSPECT')
  return call(db,'website_prospect_save',p,{...input,content,canonicalContent:JSON.stringify(content),sha256:prospectHash(content)})
}
export async function approveProspect(db: Db, p: BuildPrincipal, input: ProspectRevisionRef & {idempotencyKey: string}): Promise<ProspectView> {
  const current = await readProspect(db,p,input); studioKey(input.idempotencyKey)
  if (current.revisionId !== input.revisionId || current.sha256 !== input.sha256) throw new WebsiteBuildError('PROSPECT_STALE',409)
  if (!prospectReadiness(current.content).ready) throw new WebsiteBuildError('PROSPECT_REVIEW_INCOMPLETE',409)
  return call(db,'website_prospect_approve',p,input)
}
