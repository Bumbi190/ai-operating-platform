import 'server-only'
import type {createAdminClient} from '@/lib/supabase/admin'
import type {SocialLaunchPrincipal} from '../types'
import {resolvePublicationCredential} from '../publication/credentials'
import {readSchedules,peekScheduleJobs,scheduleDispatchEnabled} from './store'
import {monthlyPlanningSlots} from './planning'
import {ScheduleError,type ScheduleItem} from './types'
import runner from './runner-verification.json'
import deployment from '../../../vercel.json'
type Db=ReturnType<typeof createAdminClient>
export type ScheduleReadiness={ready:boolean;blockers:string[];nextJobs:ScheduleItem[];dryRun:{jobId:string|null;result:string};checkedAt:string}
export type ReadinessDependencies={now:()=>string;runnerVerified:boolean;resolveCredential:typeof resolvePublicationCredential;hasUncertainReceipt:(projectId:string)=>Promise<boolean>}
export function scheduleRunnerVerified(){return runner.plan==='pro'&&runner.projectId==='prj_ZwTfAGuJBW8iCjfSzBqx0Jwjz03T'&&deployment.crons.some(c=>c.path==='/api/social-schedule-tick'&&c.schedule==='* * * * *')}
function defaults(db:Db):ReadinessDependencies{return {now:()=>new Date().toISOString(),runnerVerified:scheduleRunnerVerified(),resolveCredential:resolvePublicationCredential,hasUncertainReceipt:async projectId=>{
 const {data,error}=await (db as any).from('social_publications').select('id').eq('project_id',projectId).eq('state','uncertain').limit(1)
 if(error)throw new ScheduleError('UNAVAILABLE')
 return !!data?.length
}}}
export async function readScheduleReadiness(db:Db,principal:SocialLaunchPrincipal,input:{projectId:string},deps:ReadinessDependencies=defaults(db)):Promise<ScheduleReadiness>{
 const {projectId}=input
 if(!principal.allowedProjectIds.includes(projectId))throw new ScheduleError('NOT_FOUND')
 const view=await readSchedules(db,principal,{projectId}),now=deps.now(),at=Date.parse(now),blockers:string[]=[]
 if(!deps.runnerVerified)blockers.push('runner_unverified')
 if(!scheduleDispatchEnabled(projectId))blockers.push('dispatch_disabled')
 const approved=view.batches.filter(b=>b.status==='approved'&&b.reviewCurrent!==false)
 const nextJobs=approved.flatMap(b=>b.manifest.items.filter(i=>Date.parse(i.expiresAt)>=at&&b.jobs.some(j=>j.postId===i.postId&&['queued','waiting','claimed'].includes(j.state))))
 if(!nextJobs.length)blockers.push('no_approved_batch')
 if(view.batches.some(b=>b.status==='approved'&&b.reviewCurrent===false&&b.jobs.some(j=>['queued','waiting','claimed'].includes(j.state))))blockers.push('review_required')
 for(const channel of ['facebook','instagram'] as const){
  try{
   const binding=await deps.resolveCredential(projectId,channel)
   if(binding.projectId!==projectId||binding.channel!==channel||!binding.bindingId||!binding.accountId)throw Error()
   if(nextJobs.filter(i=>i.channel===channel).some(i=>i.bindingId!==binding.bindingId||i.accountId!==binding.accountId))blockers.push('binding_changed:'+channel)
  }catch{blockers.push('binding_unverified:'+channel)}
 }
 if(await deps.hasUncertainReceipt(projectId))blockers.push('receipt_recovery_required')
 if(view.monthlyRule?.enabled){
  const slot=monthlyPlanningSlots(now,view.batches)[0]
  const items=nextJobs.filter(i=>i.kind==='month_release'&&i.releaseCondition?.releaseMonth===slot.releaseMonth)
  const catalogs=[...new Set(items.map(i=>i.releaseCondition!.catalogSha256))]
  if(catalogs.length!==1||!['facebook','instagram'].every(c=>items.some(i=>i.channel===c)))blockers.push('monthly_content_missing:'+slot.releaseMonth)
  else if(!view.releaseEvidence.some(e=>e.releaseMonth===slot.releaseMonth&&e.catalogSha256===catalogs[0]&&Date.parse(e.verifiedAt)<=at&&Date.parse(e.verifiedAt)>=at-86400000))blockers.push('release_evidence_missing:'+slot.releaseMonth)
 }
 // This is the same pure eligibility RPC as the authenticated cron dry-run; no claim or provider execution.
 const dryRun=await peekScheduleJobs(db,[projectId])
 if(['stopped','expired','review_required','release_required'].includes(dryRun.result))blockers.push('queue_'+dryRun.result)
 return {ready:blockers.length===0,blockers:[...new Set(blockers)],nextJobs,dryRun,checkedAt:now}
}
