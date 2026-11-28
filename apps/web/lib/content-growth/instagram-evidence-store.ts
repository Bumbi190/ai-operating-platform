/**
 * Unmounted local evidence-to-store boundary. No real DB client or rollout switch.
 * Accepts the already captured, unverified session snapshot, not provider data,
 * user input, request body or a credential. The caller must retain the identical
 * envelope for replay. Local acquisition IDs are not proven provider event IDs.
 * Writes are sequential and may be partially committed: never claim atomic batch.
 */
import 'server-only'
import { createHash } from 'node:crypto'
import type { createLocalInstagramEvidenceSession } from './instagram-evidence-hooks'
import { TARGET_COMPARISON_AGE_HOURS } from './instagram-experiments'

type Snapshot = ReturnType<ReturnType<typeof createLocalInstagramEvidenceSession>['snapshot']>
type Publication = Snapshot['publications'][number]
type Measurement = Snapshot['measurements'][number]
type Scope = Pick<Publication,'projectId'|'bindingId'|'accountId'|'platform'>
type LocalTarget = Readonly<Scope & { batchId:string; owner:string; startMs:number; endMs:number }>
export type LocalEvidenceWrite = Readonly<{
  target: LocalTarget
  candidate: Publication | Measurement
}>
type Write = (command:LocalEvidenceWrite)=>Promise<unknown>
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)&&v!=='00000000-0000-0000-0000-000000000000'
const ident=(v:unknown):v is string=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v)
const time=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0
const metric=(v:unknown)=>v===null||time(v)
const same=(a:Scope,b:Scope)=>!!a&&a.platform==='instagram'&&a.projectId===b.projectId&&a.bindingId===b.bindingId&&a.accountId===b.accountId
const windowValid=(lo:number,hi:number,max:number)=>time(lo)&&time(hi)&&hi>=lo&&hi-lo<=max
const H=3600000
const minimum=TARGET_COMPARISON_AGE_HOURS*H,maximum=(TARGET_COMPARISON_AGE_HOURS+6)*H
const safeFields=(s:Scope)=>({projectId:s.projectId,bindingId:s.bindingId,accountId:s.accountId,platform:'instagram' as const})

/** Validate all candidates before issuing the first write, copy named fields only.
 * This is structural consistency, not an authorization or provenance proof.
 * No new IDs are minted, and no candidate is promoted to a verified observation. */
function prepare(target:LocalTarget,snapshot:Snapshot):readonly LocalEvidenceWrite[] {
  if (!target||target.platform!=='instagram'||!uuid(target.projectId)||!uuid(target.bindingId)||
      !ident(target.accountId)||!ident(target.batchId)||!ident(target.owner)||
      !time(target.startMs)||!time(target.endMs)||target.endMs<=target.startMs||
      !snapshot||snapshot.mode!=='local_unverified_only'||snapshot.halted!==false||snapshot.authorizesPilot!==false||
      !Array.isArray(snapshot.publications)||snapshot.publications.length>200||
      !Array.isArray(snapshot.measurements)||snapshot.measurements.length>800) throw Error('Invalid local evidence envelope')
  const t:LocalTarget=Object.freeze({...safeFields(target),batchId:target.batchId,owner:target.owner,startMs:target.startMs,endMs:target.endMs})
  const byId=new Map<string,Publication>(), scripts=new Set<string>(), media=new Set<string>(),ids=new Set<string>()
  const commands:LocalEvidenceWrite[]=[]
  for(const p of snapshot.publications as readonly Publication[]){
    if(!same(p,t)||p.kind!=='publication_interval_candidate'||p.evidence!=='unverified_local_interval'||
      !uuid(p.acquisitionId)||ids.has(p.acquisitionId)||!uuid(p.scriptId)||scripts.has(p.scriptId)||
      !ident(p.mediaId)||media.has(p.mediaId)||!windowValid(p.startMs,p.endMs,120000)||
      p.startMs<t.startMs||p.endMs>=t.endMs)throw Error('Invalid local publication candidate')
    const clean:Publication=Object.freeze({...safeFields(t),kind:p.kind,evidence:p.evidence,
      scriptId:p.scriptId,mediaId:p.mediaId,acquisitionId:p.acquisitionId,startMs:p.startMs,endMs:p.endMs})
    ids.add(p.acquisitionId);scripts.add(p.scriptId);media.add(p.mediaId);byId.set(p.acquisitionId,clean)
    commands.push(Object.freeze({target:t,candidate:clean}))
  }
  for(const m of snapshot.measurements as readonly Measurement[]){
    if(!same(m,t)||m.kind!=='measurement_interval_candidate'||m.evidence!=='unverified_local_interval'||
      m.providerFreshness!=='unknown'||m.requiresTrustedSource!==true||!uuid(m.acquisitionId)||ids.has(m.acquisitionId)||
      !uuid(m.publicationAcquisitionId)||!windowValid(m.requestStartMs,m.responseEndMs,60000)||
      ![m.views,m.reach,m.saves,m.shares].every(metric))throw Error('Invalid local measurement candidate')
    const p=byId.get(m.publicationAcquisitionId)
    if(!p||p.scriptId!==m.scriptId||p.mediaId!==m.mediaId||
      m.lowerAgeMs!==m.requestStartMs-p.endMs||m.upperAgeMs!==m.responseEndMs-p.startMs||
      m.lowerAgeMs<minimum||m.upperAgeMs>maximum)throw Error('Inconsistent local measurement linkage')
    const clean:Measurement=Object.freeze({...safeFields(t),kind:m.kind,evidence:m.evidence,
      scriptId:m.scriptId,mediaId:m.mediaId,publicationAcquisitionId:m.publicationAcquisitionId,acquisitionId:m.acquisitionId,
      requestStartMs:m.requestStartMs,responseEndMs:m.responseEndMs,lowerAgeMs:m.lowerAgeMs,upperAgeMs:m.upperAgeMs,
      views:m.views,reach:m.reach,saves:m.saves,shares:m.shares,providerFreshness:'unknown',requiresTrustedSource:true})
    ids.add(m.acquisitionId);commands.push(Object.freeze({target:t,candidate:clean}))
  }
  return Object.freeze(commands)
}
const closedStatuses=new Set(['denied_scope','publication_missing','invalid_interval','outside_window','invalid_metrics','conflict','capacity','after_cutoff','halted','sealed'])
export async function flushLocalInstagramEvidence(target:LocalTarget,snapshot:Snapshot,write:Write) {
  let commands:readonly LocalEvidenceWrite[]
  let retained=0,replayed=0
  const result=(status:'complete_unverified'|'invalid_envelope'|'stopped'|'uncertain',reason:string|null)=>({
    status,reason,retained,replayed,requiresTrustedSource:true as const,authorizesPilot:false as const,
  })
  try{commands=prepare(target,snapshot)}catch{return result('invalid_envelope','invalid_envelope')}
  for(const command of commands){
    let reply:unknown
    try{reply=await write(command)}catch{return result('uncertain','transport_error')}
    if(reply==='retained_unverified'){retained++;continue}
    if(reply==='replay'){replayed++;continue}
    if(typeof reply==='string'&&closedStatuses.has(reply))return result('stopped',reply)
    return result('uncertain','unexpected_reply')
  }
  return result('complete_unverified',null)
}

/** Local-only atomic outbox handoff. Uses original capture IDs (not provider event
 * IDs), one complete validated envelope and one injected enqueue call.
 * Caller must retain the same envelope across uncertain transport outcomes.
 * No session factory activation, credentials, SQL, background work or retry. */
export type LocalEvidenceEnvelope = Readonly<{target:LocalTarget;snapshot:Snapshot}>
export type LocalEvidenceQueueCommand = Readonly<{
  eventKey:string; envelope:LocalEvidenceEnvelope
}>
type Queue = (command:LocalEvidenceQueueCommand)=>Promise<unknown>

export function prepareLocalInstagramEvidenceQueue(target:LocalTarget,snapshot:Snapshot):LocalEvidenceQueueCommand {
  const commands=prepare(target,snapshot)
  if(!commands.length)throw Error('Empty local evidence envelope')
  const t=commands[0].target
  const publications:Publication[]=[], measurements:Measurement[]=[]
  for(const {candidate:c} of commands){
    // The reviewed SQL accepts lowercase UUIDs only; no ID rewriting.
    if(c.acquisitionId!==c.acquisitionId.toLowerCase()||c.scriptId!==c.scriptId.toLowerCase())
      throw Error('Noncanonical local evidence ID')
    if(c.kind==='publication_interval_candidate')publications.push(c)
    else measurements.push(c)
  }
  const byId=(a:Publication|Measurement,b:Publication|Measurement)=>a.acquisitionId<b.acquisitionId?-1:a.acquisitionId>b.acquisitionId?1:0
  publications.sort(byId);measurements.sort(byId)
  const envelope:LocalEvidenceEnvelope=Object.freeze({target:t,snapshot:Object.freeze({
    mode:'local_unverified_only',halted:false,publications:Object.freeze(publications),
    measurements:Object.freeze(measurements),authorizesPilot:false,
  })})
  // The database additionally enforces its own JSONB size limit.
  if(Buffer.byteLength(JSON.stringify(envelope),'utf8')>65536)throw Error('Local evidence envelope too large')
  // Include scope and original capture IDs, not metrics. Different contents for
  // identical identities must conflict in the outbox, never overwrite a job.
  const eventKey=createHash('sha256').update(JSON.stringify([
    'local-ig-envelope-v1',t.batchId,t.projectId,t.bindingId,t.accountId,
    publications.map(p=>p.acquisitionId),measurements.map(m=>m.acquisitionId),
  ])).digest('hex')
  return Object.freeze({eventKey,envelope})
}

const queueRefusals=new Set(['denied_scope','invalid_payload','batch_closed','after_cutoff','capacity','conflict'])
/** Revalidate an immutable retry envelope before handing it to the local queue.
 * A queue receipt is NOT delivery, verified measurement or authorization. */
export async function enqueueLocalInstagramEvidence(command:LocalEvidenceQueueCommand,enqueue:Queue){
  const result=(status:'queued_unverified'|'replayed_unverified'|'invalid_envelope'|'stopped'|'uncertain',reason:string|null)=>({
    status,reason,requiresTrustedSource:true as const,authorizesPilot:false as const,
  })
  let clean:LocalEvidenceQueueCommand
  try{
    clean=prepareLocalInstagramEvidenceQueue(command.envelope.target,command.envelope.snapshot)
    if(clean.eventKey!==command.eventKey)return result('invalid_envelope','invalid_envelope')
  }catch{return result('invalid_envelope','invalid_envelope')}
  let reply:unknown
  try{reply=await enqueue(clean)}catch{return result('uncertain','transport_error')}
  if(reply==='queued')return result('queued_unverified',null)
  if(reply==='replay')return result('replayed_unverified',null)
  if(typeof reply==='string'&&queueRefusals.has(reply))return result('stopped',reply)
  return result('uncertain','unexpected_reply')
}
