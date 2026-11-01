import 'server-only'
import type { createAdminClient } from '@/lib/supabase/admin'
import { WebsiteBuildError } from '../store'
import { STAGING_BUCKET } from './tickets'

type Db = ReturnType<typeof createAdminClient>
type Ticket = {
  id: string
  project_id: string
  conversation_id: string
  object_path: string
  state: 'issued' | 'processing' | 'ready' | 'rejected'
  updated_at: string
  expires_at: string
  asset_id: string | null
  staging_cleaned_at: string | null
}
export type SweepOutcome =
  | 'recovered' | 'expired' | 'staging_removed' | 'manual_review' | 'not_stale'
  | 'changed_concurrently'

export const CLAIM_STALE_MS = 15 * 60_000
export const SIGNED_TOKEN_GRACE_MS = 60 * 60_000
export const MAX_SWEEP_ROWS = 20
const CANONICAL_BUCKET = 'media-assets-private'
const HEX_UUID = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i
const table = (db: Db, name: string) => (db as unknown as {from: (name: string) => any}).from(name)
const expected = (t: Ticket) => ({
  prefix: `website/references/${t.project_id}/${t.conversation_id}`,
  filename: `${t.id}.webp`,
})
const trusted = (t: Ticket) =>
  [t.id,t.project_id,t.conversation_id].every(id => HEX_UUID.test(id)) &&
  /^incoming\/[0-9a-f-]+\/[0-9a-f-]+\/[0-9a-f-]+\.(png|jpg|webp)$/.test(t.object_path) &&
  t.object_path.startsWith(`incoming/${t.project_id}/${t.conversation_id}/${t.id}.`)

export function sweepEligibility(t: Ticket, nowMs: number): 'none'|'stale_processing'|'expired_upload' {
  if (!trusted(t) || !Number.isFinite(nowMs) || t.staging_cleaned_at) return 'none'
  const expires = Date.parse(t.expires_at)
  const changed = Date.parse(t.updated_at)
  if (!Number.isFinite(expires) || !Number.isFinite(changed)) return 'none'
  if (t.state === 'processing') return nowMs - changed > CLAIM_STALE_MS ? 'stale_processing':'none'
  return nowMs > expires + SIGNED_TOKEN_GRACE_MS ? 'expired_upload':'none'
}

async function transition(db: Db, t: Ticket, next: 'ready'|'rejected', assetId?: string) {
  const body = next === 'ready' ? {state:next,asset_id:assetId} : {state:next}
  const {data,error}=await table(db,'website_build_reference_tickets').update(body)
    .eq('id',t.id).eq('project_id',t.project_id).eq('state',t.state)
    .eq('updated_at',t.updated_at).select('id').maybeSingle()
  if (error) throw new WebsiteBuildError('BUILD_UNAVAILABLE',503)
  return Boolean(data)
}
async function removeStaging(db: Db,t:Ticket) {
  const {error}=await db.storage.from(STAGING_BUCKET).remove([t.object_path])
  if(error) throw new WebsiteBuildError('BUILD_UNAVAILABLE',503)
}
async function markStagingClean(db:Db,t:Ticket) {
  const {error}=await table(db,'website_build_reference_tickets')
    .update({staging_cleaned_at:new Date().toISOString()})
    .eq('id',t.id).eq('project_id',t.project_id)
    .in('state',['ready','rejected']).is('staging_cleaned_at',null)
  if(error)throw new WebsiteBuildError('BUILD_UNAVAILABLE',503)
}

/**
 * Internal maintenance primitive, not exposed via HTTP. Intended only for a
 * future authenticated operator/worker with a fixed project scope and rate cap.
 *
 * Fail closed on incomplete canonical evidence: never retry a model request,
 * never create a second Asset, never delete a possible orphan canonical file.
 */
export async function reconcileReferenceTicket(db:Db,t:Ticket,nowMs=Date.now()):Promise<SweepOutcome> {
  const classification=sweepEligibility(t,nowMs)
  if(classification==='none')return 'not_stale'
  const tdb=table(db,'website_build_reference_tickets')
  // Re-read exact current state, not just a previously selected stale snapshot.
  const read=await tdb.select('id,project_id,conversation_id,object_path,state,updated_at,expires_at,asset_id,staging_cleaned_at')
    .eq('id',t.id).eq('project_id',t.project_id).maybeSingle()
  if(read.error)throw new WebsiteBuildError('BUILD_UNAVAILABLE',503)
  const fresh=read.data as Ticket|null
  if(!fresh || fresh.updated_at!==t.updated_at || fresh.state!==t.state ||
      !trusted(fresh) || fresh.object_path!==t.object_path)return 'changed_concurrently'
  if(classification==='expired_upload'){
    // Never delete an active upload token's bytes (Supabase tokens last 2h).
    if(fresh.state==='issued'){
      if(!await transition(db,fresh,'rejected'))return 'changed_concurrently'
    }
    await removeStaging(db,fresh)
    await markStagingClean(db,fresh)
    return fresh.state==='issued'?'expired':'staging_removed'
  }

  // A crashed finalizer may have admitted a canonical Asset but failed before
  // the ticket receipt. Bind it only after exact project/path/provenance proof.
  const {prefix,filename}=expected(fresh)
  const asset=await table(db,'assets').select('id,project_id,storage_bucket,storage_path,visibility')
    .eq('project_id',fresh.project_id).eq('storage_bucket',CANONICAL_BUCKET)
    .eq('storage_path',prefix+'/'+filename).maybeSingle()
  if(asset.error)throw new WebsiteBuildError('BUILD_UNAVAILABLE',503)
  if(asset.data){
    const found=asset.data as {id:string;project_id:string;storage_bucket:string;storage_path:string;visibility:string}
    const provenance=await table(db,'asset_provenance').select('asset_id,source,provider_metadata')
      .eq('asset_id',found.id).maybeSingle()
    if(provenance.error)throw new WebsiteBuildError('BUILD_UNAVAILABLE',503)
    if(found.visibility!=='internal' || found.project_id!==fresh.project_id ||
        !provenance.data || provenance.data.source!=='uploaded' ||
        provenance.data.provider_metadata?.purpose!=='atlas-website-reference' ||
        provenance.data.provider_metadata?.ticketId!==fresh.id)
      return 'manual_review'
    if(!await transition(db,fresh,'ready',found.id))return 'changed_concurrently'
    // Cleaning staging is best-effort after durable receipt, never the reverse.
    const cleanup=await db.storage.from(STAGING_BUCKET).remove([fresh.object_path]).catch(()=>null)
    if(cleanup && !cleanup.error) await markStagingClean(db,fresh)
    return 'recovered'
  }

  // Even without an Asset row, a crash may have uploaded canonical bytes.
  // Inspect the exact path before rejecting: do not erase or overwrite orphans.
  const listed=await db.storage.from(CANONICAL_BUCKET).list(prefix,{limit:100,search:filename})
  if(listed.error || !Array.isArray(listed.data))throw new WebsiteBuildError('BUILD_UNAVAILABLE',503)
  if(listed.data.some((item:{name:string})=>item.name===filename))return 'manual_review'
  if(!await transition(db,fresh,'rejected'))return 'changed_concurrently'
  await removeStaging(db,fresh)
  await markStagingClean(db,fresh)
  return 'expired'
}

/** Strictly capped scan for one chosen project; no global unscoped sweeps. */
export async function sweepReferenceProject(db:Db,projectId:string,nowMs=Date.now()):
  Promise<Array<{ticketId:string;outcome:SweepOutcome}>> {
  if(!HEX_UUID.test(projectId))throw new WebsiteBuildError('INVALID_BODY',400)
  const {data,error}=await table(db,'website_build_reference_tickets')
    .select('id,project_id,conversation_id,object_path,state,updated_at,expires_at,asset_id,staging_cleaned_at')
    .eq('project_id',projectId).is('staging_cleaned_at',null)
    .in('state',['issued','processing','rejected','ready'])
    .order('updated_at',{ascending:true}).limit(MAX_SWEEP_ROWS)
  if(error)throw new WebsiteBuildError('BUILD_UNAVAILABLE',503)
  const results:Array<{ticketId:string;outcome:SweepOutcome}>=[]
  for(const t of (data??[]) as Ticket[]){
    if(sweepEligibility(t,nowMs)==='none')continue
    const outcome=await reconcileReferenceTicket(db,t,nowMs)
    results.push({ticketId:t.id,outcome})
  }
  return results
}
