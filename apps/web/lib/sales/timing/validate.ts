import {SalesError} from '../types'
import {salesId} from '../validate'
import type {HistoryRevisionInput,TimingReadInput,TimingRulesInput} from './types'
const bad=():never=>{throw new SalesError('INVALID_BODY')}
function object(v:unknown,keys:string[]):Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!keys.includes(k))||keys.some(k=>!(k in v)))bad();return v as Record<string,unknown>}
function str(v:unknown,max=500):string{if(typeof v!=='string'||!v.trim()||v.length>max||/[\u0000\r\n]/.test(v))bad();return v}
function int(v:unknown,min=1,max=2147483647):number{if(typeof v!=='number'||!Number.isSafeInteger(v)||v<min||v>max)bad();return v}
function list(v:unknown,min:number,max:number):unknown[]{if(!Array.isArray(v)||v.length<min||v.length>max)bad();return v}
function choice(v:unknown,values:string[]):string{if(typeof v!=='string'||!values.includes(v))bad();return v}
function nullableId(v:unknown):string|null{return v===null?null:salesId(v)}
function unique(a:unknown[]){if(new Set(a).size!==a.length)bad()}
function instant(v:unknown):number{
 const s=str(v,40),m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,6})?(Z|[+-](\d{2}):(\d{2}))$/.exec(s);if(!m)bad()
 const [y,mo,d,h,mi,se]=m.slice(1,7).map(Number),date=new Date(Date.UTC(y,mo-1,d,h,mi,se))
 if(y<1000||date.getUTCFullYear()!==y||date.getUTCMonth()!==mo-1||date.getUTCDate()!==d||h>23||mi>59||se>59||Number(m[8]??0)>23||Number(m[9]??0)>59)bad()
 const n=Date.parse(s);if(!Number.isFinite(n))bad();return n
}
export function parseTimingRead(v:unknown):TimingReadInput{
 if(!v||typeof v!=='object'||Array.isArray(v))bad()
 const a=v as Record<string,unknown>;if(Object.keys(a).some(k=>!['projectId','contactIds'].includes(k)))bad()
 const projectId=salesId(a.projectId);if(a.contactIds===undefined)return {projectId}
 const contactIds=list(a.contactIds,1,200).map(salesId);unique(contactIds);return {projectId,contactIds}
}
export function parseTimingRules(v:unknown):TimingRulesInput{
 const a=object(v,['projectId','idempotencyKey','expectedPreviousId','minWaitSeconds','maxReminders','maxSourceAgeSeconds','confirmed'])
 if(a.confirmed!==true)bad()
 return {projectId:salesId(a.projectId),idempotencyKey:salesId(a.idempotencyKey),expectedPreviousId:nullableId(a.expectedPreviousId),minWaitSeconds:int(a.minWaitSeconds,1209600),maxReminders:int(a.maxReminders,0,1),maxSourceAgeSeconds:int(a.maxSourceAgeSeconds,1,900),confirmed:true}
}
export function parseHistoryRevision(v:unknown):HistoryRevisionInput{
 const a=object(v,['projectId','idempotencyKey','expectedPreviousId','contactId','expectedContactVersion','data','confirmed'])
 if(a.confirmed!==true)bad()
 const projectId=salesId(a.projectId),contactId=salesId(a.contactId),expectedContactVersion=int(a.expectedContactVersion)
 const d=object(a.data,['schemaVersion','contactVersions','history','olderHistoryAttestation','sources','events','correctionOf','reviewNote'])
 if(d.schemaVersion!==1)bad()
 const cvs=list(d.contactVersions,1,16).map(x=>{const c=object(x,['id','version']);return {id:salesId(c.id),version:int(c.version)}});unique(cvs.map(x=>x.id))
 if(!cvs.some(c=>c.id===contactId&&c.version===expectedContactVersion))bad()
 choice(d.history,['unknown','owner_confirmed_none','contacted'])
 if(d.olderHistoryAttestation!==null)str(d.olderHistoryAttestation)
 if(d.history==='owner_confirmed_none'&&d.olderHistoryAttestation===null)bad()
 nullableId(d.correctionOf);str(d.reviewNote)
 const sources=list(d.sources,0,8).map(x=>{
  const s=object(x,['sourceKey','channel','identityRef','scopeRef','since','through','observedAt','state','reference'])
  str(s.sourceKey);str(s.identityRef);str(s.scopeRef);str(s.reference)
  choice(s.channel,['strato_sent','strato_inbox','resend','operator']);choice(s.state,['complete','gap','failed'])
  const since=instant(s.since),through=instant(s.through),observed=instant(s.observedAt);if(since>through||through>observed)bad()
  return s
 });unique(sources.map(s=>s.sourceKey))
 const events=list(d.events,0,100).map(x=>{
  const e=object(x,['id','sourceRefs','providerRefs','occurredAt','direction','outcome','kind','invitationId','inReplyToEventId','reviewedDuplicateOf'])
  salesId(e.id);instant(e.occurredAt);choice(e.direction,['outbound','inbound']);choice(e.outcome,['accepted','delivery_unknown','failed_before_send','received','bounced','unsubscribed']);choice(e.kind,['initial','reminder','requested_reply','unclassified'])
  if((e.direction==='outbound')!==['accepted','delivery_unknown','failed_before_send'].includes(String(e.outcome)))bad()
  const refs=list(e.sourceRefs,1,8).map(x=>str(x));unique(refs);if(refs.some(k=>!sources.some(s=>s.sourceKey===k)))bad()
  const providers=list(e.providerRefs,1,8).map(x=>{const p=object(x,['sourceKey','id']);str(p.id);if(!refs.includes(str(p.sourceKey)))bad();return String(p.sourceKey)+':'+String(p.id)});unique(providers)
  nullableId(e.invitationId);nullableId(e.inReplyToEventId);nullableId(e.reviewedDuplicateOf)
  return e
 });unique(events.map(e=>e.id))
 for(const e of events)if(e.reviewedDuplicateOf!==null){const target=events.find(t=>t.id===e.reviewedDuplicateOf);if(!target||target===e||target.reviewedDuplicateOf!==null||['occurredAt','direction','outcome','kind','invitationId'].some(k=>target[k]!==e[k]))bad()}
 return {projectId,contactId,expectedContactVersion,idempotencyKey:salesId(a.idempotencyKey),expectedPreviousId:nullableId(a.expectedPreviousId),data:d as unknown as HistoryRevisionInput['data'],confirmed:true}
}
