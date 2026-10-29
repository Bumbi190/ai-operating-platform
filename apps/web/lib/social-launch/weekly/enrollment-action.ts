/** Pure owner opt-in request shape. Only an authenticated operator route uses it. */
import {FAMILY_WEEKLY_PROJECT_ID} from './auto-preparation'
import {
 WEEKLY_CONSENT_MAX_CALLS_PER_WEEK,
 WEEKLY_CONSENT_MAX_COMPLETION_TOKENS,
} from './enrollment'

export const WEEKLY_OPT_IN_DURATION_DAYS=89
const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i

export type WeeklyConsentAction={projectId:string;operation:'enable'|'revoke';confirmed?:boolean}
export type WeeklyConsentInsert={
 project_id:string;owner_id:string;action:'enable'|'revoke';
 valid_until:string|null;
 max_completion_tokens:1800;max_calls_per_week:1;
 can_schedule:false;can_publish:false
}
export function isWeeklyEnrollmentRequest(raw:unknown):raw is WeeklyConsentAction{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return false
 const value=raw as Record<string,unknown>
 const keys=Object.keys(value).sort()
 if(value.projectId!==FAMILY_WEEKLY_PROJECT_ID)return false
 if(value.operation==='enable'){
  return keys.join(',')==='confirmed,operation,projectId'&&value.confirmed===true
 }
 if(value.operation==='revoke'){
  return keys.join(',')==='operation,projectId'
 }
 return false
}
export function prepareWeeklyOwnerConsentEvent(
 raw:unknown,ownerId:string,now:string,
):WeeklyConsentInsert|null{
 if(!isWeeklyEnrollmentRequest(raw)||!UUID.test(ownerId)||typeof now!=='string'||
 !/(Z|[+-]\d\d:\d\d)$/.test(now)||!Number.isFinite(Date.parse(now)))return null
 const until=raw.operation==='enable'
  ? new Date(Date.parse(now)+WEEKLY_OPT_IN_DURATION_DAYS*86400000).toISOString()
  : null
 return {project_id:FAMILY_WEEKLY_PROJECT_ID,owner_id:ownerId,
  action:raw.operation,valid_until:until,
  max_completion_tokens:WEEKLY_CONSENT_MAX_COMPLETION_TOKENS,
  max_calls_per_week:WEEKLY_CONSENT_MAX_CALLS_PER_WEEK,
  can_schedule:false,can_publish:false}
}
