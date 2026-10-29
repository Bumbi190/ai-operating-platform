/**
 * Durable, owner-scoped, append-only Family weekly-draft consent reader.
 *
 * This is NOT a model tool and creates no owner authority. Only the current
 * project owner and the latest database-stamped event may authorize a worker.
 * No table, migration or feature flag is enabled in Production by this file.
 */
import 'server-only'
import {FAMILY_WEEKLY_PROJECT_ID} from './auto-preparation'
import type {VerifiedWeeklyEnrollment} from './auto-draft-model'

const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i
export const WEEKLY_OWNER_CONSENT_MAX_DAYS=90 as const
export const WEEKLY_CONSENT_MAX_COMPLETION_TOKENS=1800 as const
export const WEEKLY_CONSENT_MAX_CALLS_PER_WEEK=1 as const

export type ConsentEvent={
 event_id:number;project_id:string;owner_id:string;
 action:'enable'|'revoke';valid_until:string|null;created_at:string;
 max_completion_tokens:number;max_calls_per_week:number;
 can_schedule:false;can_publish:false
}
export type WeeklyConsentStatus={
 enabled:boolean;status:'not_configured'|'active'|'revoked'|'expired'|'unavailable';
 validUntil:string|null;lastUpdatedAt:string|null;eventId:number|null;canSchedule:false;canPublish:false
}
export interface WeeklyConsentReadPort {
 currentProjectOwner:(projectId:string,ownerId:string)=>Promise<boolean>
 latestEvent:(projectId:string)=>Promise<unknown>
}
const unknownConsent=(status:WeeklyConsentStatus['status']):WeeklyConsentStatus=>({
 enabled:false,status,validUntil:null,lastUpdatedAt:null,eventId:null,
 canSchedule:false,canPublish:false,
})
function secureInstant(v:unknown):number{
 if(typeof v!=='string'||v.length>60||!/(Z|[+-]\d\d:\d\d)$/.test(v))return NaN
 return Date.parse(v)
}
function isEvent(value:unknown):value is ConsentEvent{
 if(!value||typeof value!=='object'||Array.isArray(value))return false
 const v=value as Partial<ConsentEvent>
 const created=secureInstant(v.created_at),until=secureInstant(v.valid_until)
 return typeof v.event_id==='number'&&Number.isSafeInteger(v.event_id)&&v.event_id>=1&&
 UUID.test(v.project_id??'')&&UUID.test(v.owner_id??'')&&
 (v.action==='enable'||v.action==='revoke')&&Number.isFinite(created)&&
 v.max_completion_tokens===WEEKLY_CONSENT_MAX_COMPLETION_TOKENS&&
 v.max_calls_per_week===WEEKLY_CONSENT_MAX_CALLS_PER_WEEK&&
 v.can_schedule===false&&v.can_publish===false&&
 (v.action==='enable'
  ? Number.isFinite(until)&&until>created&&
    until<=created+WEEKLY_OWNER_CONSENT_MAX_DAYS*86400000
  : v.valid_until===null)
}
export function deriveWeeklyConsentStatus(
 event:unknown,projectId:string,ownerId:string,now:string
):WeeklyConsentStatus{
 if(event===null)return unknownConsent('not_configured')
 const clock=secureInstant(now)
 if(!Number.isFinite(clock)||!UUID.test(ownerId)||projectId!==FAMILY_WEEKLY_PROJECT_ID||
 !isEvent(event)||event.project_id!==projectId||event.owner_id!==ownerId){
  return unknownConsent('unavailable')
 }
 if(event.action==='revoke')return {
  ...unknownConsent('revoked'),lastUpdatedAt:event.created_at,eventId:event.event_id,
 }
 const until=secureInstant(event.valid_until)
 if(clock<secureInstant(event.created_at))return unknownConsent('unavailable')
 return {
  enabled:clock<until,status:clock<until?'active':'expired',
  validUntil:event.valid_until,lastUpdatedAt:event.created_at,eventId:event.event_id,
  canSchedule:false,canPublish:false,
 }
}

/**
 * An AdminClient port must first verify projects.owner_id equals the supplied
 * authenticated owner ID. The caller must never accept an ownerId from a model
 * or a raw external request body. Unknown DB state fails closed.
 */
export async function readWeeklyOwnerConsent(
 port:WeeklyConsentReadPort,projectId:string,ownerId:string,now:string
):Promise<WeeklyConsentStatus>{
 if(projectId!==FAMILY_WEEKLY_PROJECT_ID||!UUID.test(ownerId)||
 !Number.isFinite(secureInstant(now)))return unknownConsent('unavailable')
 try{
  if(!(await port.currentProjectOwner(projectId,ownerId)))return unknownConsent('unavailable')
  return deriveWeeklyConsentStatus(await port.latestEvent(projectId),projectId,ownerId,now)
 }catch{return unknownConsent('unavailable')}
}
export function familyWeeklyRuntimeEnabled():boolean{
 return process.env.FAMILY_WEEKLY_AUTO_DRAFTS_RUNTIME_ENABLED==='true'
}
export async function getVerifiedOwnerWeeklyEnrollment(
 port:WeeklyConsentReadPort,ownerId:string,now:string,
 runtimeEnabled=familyWeeklyRuntimeEnabled(),
):Promise<VerifiedWeeklyEnrollment|null>{
 if(!runtimeEnabled)return null
 const result=await readWeeklyOwnerConsent(port,FAMILY_WEEKLY_PROJECT_ID,ownerId,now)
 if(!result.enabled||!result.validUntil||!result.eventId)return null
 return {
  eventId:result.eventId,status:'owner_verified',projectId:FAMILY_WEEKLY_PROJECT_ID,
  ownerId,permittedOperation:'family_weekly_caption_drafts',
  validThrough:result.validUntil,
 }
}
