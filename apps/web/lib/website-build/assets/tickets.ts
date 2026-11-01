import 'server-only'
import { randomUUID } from 'node:crypto'
import { assertProjectAllowed } from '@/lib/atlas/isolation'
import type { ProjectAccessOk } from '@/lib/auth/project-access'
import type { createAdminClient } from '@/lib/supabase/admin'
import { WebsiteBuildError } from '../store'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' } as const
type SupportedMime = keyof typeof TYPES
export const STAGING_BUCKET = 'atlas-reference-staging'
export const SIGNED_UPLOAD_LIFETIME_SECONDS = 7200

export type TicketInput = {
  projectId: string
  conversationId: string
  draftId: string
  slot: number
  mimeType: SupportedMime
}
export type SignedReferenceTicket = {
  ticketId: string
  bucket: typeof STAGING_BUCKET
  path: string
  token: string
  mimeType: SupportedMime
  expiresAt: string
}

/** No client-provided owner/path, slot is bounded by a DB unique constraint. */
export function parseTicketInput(raw: Record<string, unknown>): TicketInput {
  if (Object.keys(raw).sort().join(',') !== 'conversationId,draftId,mimeType,projectId,slot')
    throw new WebsiteBuildError('INVALID_BODY', 400)
  for (const id of [raw.projectId, raw.conversationId, raw.draftId])
    if (typeof id !== 'string' || !UUID.test(id)) throw new WebsiteBuildError('INVALID_BODY', 400)
  if (!Number.isInteger(raw.slot) || (raw.slot as number) < 0 || (raw.slot as number) > 3)
    throw new WebsiteBuildError('INVALID_BODY', 400)
  if (typeof raw.mimeType !== 'string' || !Object.hasOwn(TYPES, raw.mimeType))
    throw new WebsiteBuildError('INVALID_BODY', 400)
  return raw as TicketInput
}

type Db = ReturnType<typeof createAdminClient>
type TicketRow = {
  id: string; owner_id: string; project_id: string; conversation_id: string
  draft_id: string; slot: number; mime_type: SupportedMime; object_path: string
  state: string; issued_at: string; expires_at: string
}
const ticketFields = 'id,owner_id,project_id,conversation_id,draft_id,slot,mime_type,object_path,state,issued_at,expires_at'
function trustedTicket(row: TicketRow | null, p: ProjectAccessOk, input: TicketInput): TicketRow {
  if (!row ||
      row.owner_id !== p.userId || row.project_id !== input.projectId ||
      row.conversation_id !== input.conversationId || row.draft_id !== input.draftId ||
      row.slot !== input.slot || row.mime_type !== input.mimeType ||
      row.object_path !== stagingPath(input.projectId, input.conversationId, row.id, input.mimeType))
    throw new WebsiteBuildError('CONFLICT',409)
  if (row.state !== 'issued' || Date.parse(row.expires_at) <= Date.now())
    throw new WebsiteBuildError('CONFLICT',409)
  return row
}
export function stagingPath(projectId: string, conversationId: string, id: string, mime: SupportedMime): string {
  return `incoming/${projectId}/${conversationId}/${id}.${TYPES[mime]}`
}

/** Server-owned admission only; tokens never grant read access to the staging bucket. */
export async function issueReferenceTicket(db: Db, p: ProjectAccessOk, input: TicketInput): Promise<SignedReferenceTicket> {
  await assertReferenceWorkspace(db,p,input.projectId,input.conversationId)
  const table = (db as unknown as { from: (name: string) => any }).from('website_build_reference_tickets')
  const lookup = async (): Promise<TicketRow|null> => {
    const {data,error} = await table.select(ticketFields)
      .eq('owner_id',p.userId).eq('conversation_id',input.conversationId)
      .eq('draft_id',input.draftId).eq('slot',input.slot).maybeSingle()
    if (error) throw new WebsiteBuildError('BUILD_UNAVAILABLE',503)
    return (data as TicketRow | null)
  }
  let ticket = await lookup()
  if (!ticket) {
    const id = randomUUID(),issuedAt = new Date()
    const row = {
      id,owner_id:p.userId,project_id:input.projectId,conversation_id:input.conversationId,
      draft_id:input.draftId,slot:input.slot,mime_type:input.mimeType,
      object_path:stagingPath(input.projectId,input.conversationId,id,input.mimeType),
      issued_at:issuedAt.toISOString(),
      expires_at:new Date(issuedAt.getTime()+SIGNED_UPLOAD_LIFETIME_SECONDS*1000).toISOString(),
    }
    const inserted = await table.insert(row).select(ticketFields).single()
    if (inserted.error && inserted.error.code !== '23505') {
      if(inserted.error.code==='P0001' && inserted.error.message?.includes('ATLAS_REFERENCE_RATE_LIMIT'))
        throw new WebsiteBuildError('REFERENCE_RATE_LIMIT',429)
      throw new WebsiteBuildError('BUILD_UNAVAILABLE',503)
    }
    ticket = inserted.data as TicketRow|null
    if (!ticket) ticket = await lookup()
  }
  const t = trustedTicket(ticket,p,input)
  // A signed upload capability is bearer-only and valid for two hours. Supabase
  // enforces path and private-bucket restrictions; do not expose the service key.
  const {data,error} = await db.storage.from(STAGING_BUCKET).createSignedUploadUrl(t.object_path)
  if (error || !data?.token) throw new WebsiteBuildError('BUILD_UNAVAILABLE',503)
  return {
    ticketId:t.id,bucket:STAGING_BUCKET,path:t.object_path,
    token:data.token,mimeType:input.mimeType,expiresAt:t.expires_at,
  }
}

/** Shared authorization gate for issuance AND completion; no stored ticket grants scope. */
export async function assertReferenceWorkspace(
  db: Db,p: ProjectAccessOk,projectId: string,conversationId: string,
): Promise<void> {
  if (!assertProjectAllowed(projectId,p.allowedProjectIds))
    throw new WebsiteBuildError('NOT_FOUND',404)
  const privateQuery = db as unknown as { from: (name: string) => any }
  const [{data:project,error:projectError},{data:conversation,error:conversationError},{data:lifecycle,error:lifeError}] = await Promise.all([
    db.from('projects').select('id').eq('id',projectId).eq('owner_id',p.userId).eq('execution_paused',false).maybeSingle(),
    db.from('conversations').select('id').eq('id',conversationId).eq('user_id',p.userId).eq('project_id',projectId).maybeSingle(),
    privateQuery.from('project_lifecycle').select('state').eq('project_id',projectId).eq('owner_id',p.userId).maybeSingle(),
  ])
  if (projectError || conversationError || lifeError) throw new WebsiteBuildError('BUILD_UNAVAILABLE',503)
  if (!project || !conversation || (lifecycle && lifecycle.state !== 'active'))
    throw new WebsiteBuildError('NOT_FOUND',404)
}
