import 'server-only'
import { resolveProjectAccess } from '@/lib/auth/project-access'
import { createAdminClient } from '@/lib/supabase/admin'
import {exportWebsiteProject} from './project-export'
import { appendBuildFeedback, createBuildSession, readBuildArtifact, readBuildSession, requestBuildControl, WebsiteBuildError } from './store'
import { assertSameOrigin } from '@/lib/atlas/executive/http'
import type { CreateBuildInput, FeedbackInput } from './types'

const planMessages:Record<string,string>={PLAN_REVIEW_REQUIRED:'Planera hemsidan med Atlas och granska planen innan bygget startar.',PLAN_STALE:'Planen har ändrats. Granska den aktuella versionen.',BUILD_AGENT_REQUIRED:'Välj en byggagent för projektet i inställningarna.',PROJECT_LOCATION_LOCKED:'Projektets plats är redan bunden. En ändrad standardmapp flyttar inte projektet.',PLAN_CONTAINS_SECRET:'Lägg nycklar i den skyddade inställningen hos tjänsten.',PLAN_TOO_LARGE:'Planen behöver kortas innan den kan byggas.'}
const headers = { 'cache-control': 'private, no-store' }
export function buildErrorResponse(error: unknown): Response {
  const known = error instanceof WebsiteBuildError
  const code = known ? error.code : 'BUILD_UNAVAILABLE'
  const message = planMessages[code] ?? (code === 'NOT_FOUND' ? 'Bygget eller projektet kunde inte hittas.' : code === 'CONFLICT' ? 'Förfrågan krockar med ett tidigare kvitto.' : code === 'CONTROL_PENDING' || code === 'FENCED' ? 'Byggets läge har ändrats. Uppdatera och försök igen.' : known && error.status < 500 ? 'Kontrollera förfrågan och försök igen.' : 'Byggtjänsten kunde inte svara. Ditt sparade bygge finns kvar.')
  return Response.json({ error: message, code }, { status: known ? error.status : 503, headers })
}

/** Bound reads before JSON parsing; no provider or long running work in routes. */
export async function readWebsiteBuildBody(request: Request): Promise<Record<string, unknown>> {
  const limit = 65_536
  if (Number(request.headers.get('content-length')) > limit) throw new WebsiteBuildError('BODY_TOO_LARGE', 413)
  const reader = request.body?.getReader()
  if (!reader) throw new WebsiteBuildError('INVALID_BODY')
  const chunks: Uint8Array[] = []; let size = 0
  try {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > limit) { await reader.cancel(); throw new WebsiteBuildError('BODY_TOO_LARGE', 413) }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  const bytes = new Uint8Array(size); let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  try {
    const body: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw Error()
    return body as Record<string, unknown>
  } catch { throw new WebsiteBuildError('INVALID_BODY') }
}

export async function websiteBuildApi(action: 'create' | 'get' | 'feedback' | 'control' | 'artifact' | 'export', request: Request, params: { sessionId?: string; revisionId?: string }): Promise<Response> {
  const access = await resolveProjectAccess()
  if (!access.ok) { access.response.headers.set('cache-control', headers['cache-control']); return access.response }
  let body:Record<string,unknown>={}
  try {
    if(['create','feedback','control'].includes(action)){const denied=assertSameOrigin(request);if(denied){denied.headers.set('cache-control',headers['cache-control']);return denied}}
    body = ['create', 'feedback', 'control'].includes(action) ? await readWebsiteBuildBody(request) : {}
    const db = createAdminClient()
    const ref = { projectId: (body.projectId ?? new URL(request.url).searchParams.get('projectId')) as string, sessionId: params.sessionId as string }
    if (action === 'create') return Response.json(await createBuildSession(db, access, body as unknown as CreateBuildInput), { status: 201, headers })
    if (action === 'get') return Response.json(await readBuildSession(db, access, ref), { headers })
    if (action === 'feedback') return Response.json(await appendBuildFeedback(db, access, ref, body as unknown as FeedbackInput), { headers })
    if (action === 'control') return Response.json(await requestBuildControl(db, access, ref, body.action as 'pause' | 'resume' | 'cancel', body.idempotencyKey as string), { headers })
    const artifact = await readBuildArtifact(db, access, ref, params.revisionId as string)
    if (action === 'artifact') return Response.json(artifact, { headers })
    const bytes = await exportWebsiteProject(db,access,ref,params.revisionId as string,artifact)
    return new Response(new Uint8Array(bytes), { headers: { ...headers, 'content-type': 'application/zip', 'content-disposition': `attachment; filename="website-${params.revisionId}.zip"` } })
  } catch (error) {
    const response=buildErrorResponse(error)
    if(error instanceof WebsiteBuildError&&error.code==='PLAN_REVIEW_REQUIRED'&&typeof body.conversationId==='string'&&access.allowedProjectIds.includes(body.projectId as string)){
      const {data}=await createAdminClient().from('conversations').select('id').eq('id',body.conversationId).eq('user_id',access.userId).eq('project_id',body.projectId as string).maybeSingle()
      if(data)return Response.json({...await response.json(),conversationUrl:'/chat/'+data.id},{status:response.status,headers})
    }
    return response
  }
}