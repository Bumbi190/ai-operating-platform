/**
 * Familje-Stunden scheduled weekly draft preparation: fail-closed entry gate.
 *
 * This is pure planning, NOT the paid generator or any background dispatch.
 * Its result must never be treated as operator approval to write, publish,
 * generate images, or change an approved social schedule.
 *
 * Intended cadence: first Sunday 2027-01-03 at 15:00 Europe/Stockholm, then
 * every Sunday in that one-hour local window. The following Monday is the
 * draft target. Source facts, content and user identity are not copied here.
 */
import type {WeeklyPlan} from './types'

export const FAMILY_WEEKLY_PROJECT_ID='77cda551-57c9-4dc0-b019-1bb6438777f7'
export const FAMILY_WEEKLY_FIRST_PREPARATION='2027-01-03'
export const FAMILY_WEEKLY_LOCAL_HOUR=15

const swedishClock=new Intl.DateTimeFormat('en-GB',{
 timeZone:'Europe/Stockholm',weekday:'short',year:'numeric',month:'2-digit',
 day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'
})

export type WeeklyAutoWindow =
 | {status:'scheduled_window';weekStart:string;localDate:string}
 | {status:'not_due';reason:'before_start'|'wrong_weekday'|'outside_review_hour'|'invalid_clock'}

export function findWeeklyAutomaticWindow(now:string):WeeklyAutoWindow{
 const utc=Date.parse(now)
 if(!Number.isFinite(utc)||typeof now!=='string'||!/(?:Z|[+-][0-9]{2}:[0-9]{2})$/.test(now)){
  return {status:'not_due',reason:'invalid_clock'}
 }
 const local=Object.fromEntries(swedishClock.formatToParts(new Date(utc)).map(p=>[p.type,p.value]))
 const day=local.year+'-'+local.month+'-'+local.day
 if(day<FAMILY_WEEKLY_FIRST_PREPARATION)return {status:'not_due',reason:'before_start'}
 if(local.weekday!=='Sun')return {status:'not_due',reason:'wrong_weekday'}
 if(Number(local.hour)!==FAMILY_WEEKLY_LOCAL_HOUR)return {status:'not_due',reason:'outside_review_hour'}
 const target=new Date(Date.parse(day+'T12:00:00.000Z')+86400000).toISOString().slice(0,10)
 if(new Date(target+'T12:00:00.000Z').getUTCDay()!==1)return {status:'not_due',reason:'invalid_clock'}
 return {status:'scheduled_window',localDate:day,weekStart:target}
}

export type WeeklyAutoReadiness =
 | {status:'not_due';reason:Extract<WeeklyAutoWindow,{status:'not_due'}>['reason']}
 | {status:'not_enabled'}
 | {status:'already_prepared';weekStart:string}
 | {status:'nothing_to_prepare';weekStart:string}
 | {status:'review_required';weekStart:string;reasons:string[]}
 | {status:'ready_to_prepare_drafts';weekStart:string;slotKeys:string[];captionCount:number}

/** Minimal typed evidence returned by the existing owner-scoped weekly reader. */
export interface WeeklyAutoEvidence{
 project:{id:string}
 plan:WeeklyPlan
 preparation:unknown
 assets:readonly {id:string;description?:string}[]
 profile:{sha256:string;profile:{description:string}}|null
 sourceReferences:readonly string[]
 missing:readonly string[]
}

/**
 * The owner must separately opt in through a persistently authorised workflow
 * before ANY background generator invokes the existing social_weekly_save.
 * No default project principal, model key or synthetic conversation is allowed.
 */
export function evaluateAutomaticWeeklyPreparation(input:{
 now:string
 projectId:string
 ownerOptIn:boolean
 evidence:WeeklyAutoEvidence|null
}):WeeklyAutoReadiness{
 const window=findWeeklyAutomaticWindow(input.now)
 if(window.status!=='scheduled_window')return window
 if(input.projectId!==FAMILY_WEEKLY_PROJECT_ID||input.ownerOptIn!==true)return {status:'not_enabled'}
 const {weekStart}=window
 const e=input.evidence
 if(!e||e.project?.id!==FAMILY_WEEKLY_PROJECT_ID||e.plan?.weekStart!==weekStart){
  return {status:'review_required',weekStart,reasons:['verified_weekly_context_missing']}
 }
 if(e.preparation!==null&&e.preparation!==undefined)return {status:'already_prepared',weekStart}
 const slots=e.plan.slots.filter(s=>s.kind==='ordinary')
 if(e.plan.slots.length!==slots.length)return {status:'review_required',weekStart,reasons:['unexpected_monthly_slot']}
 if(!slots.length){
  if(e.missing.length)return {status:'review_required',weekStart,reasons:[...new Set(e.missing)]}
  return {status:'nothing_to_prepare',weekStart}
 }
 const reasons=[...e.missing]
 if(!e.profile?.profile?.description?.trim())reasons.push('project_facts_missing')
 if(!/^([a-f0-9]{64})$/.test(e.profile?.sha256??''))reasons.push('profile_provenance_missing')
 if(!e.sourceReferences?.includes('profile:'+(e.profile?.sha256??'')))reasons.push('source_reference_missing')
 if(!e.assets?.some(a=>typeof a.id==='string'&&a.id&&typeof a.description==='string'&&a.description.trim())){
  reasons.push('described_image_missing')
 }
 if(slots.length>2||slots.some(s=>s.kind!=='ordinary'||!s.key||Date.parse(s.scheduledAt)<=Date.parse(input.now))){
  reasons.push('unexpected_week_slots')
 }
 if(reasons.length)return {status:'review_required',weekStart,reasons:[...new Set(reasons)]}
 return {status:'ready_to_prepare_drafts',weekStart,slotKeys:slots.map(s=>s.key),captionCount:slots.length*2}
}
