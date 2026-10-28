/**
 * Persistent IN-APP review receipt. NOT mail, push, social publication or cron.
 *
 * The only caller in the future is a trusted worker AFTER social_weekly_save
 * returns a verified preparationId. The DB trigger independently checks that
 * preparation, its exact owner/project/week and the editorial-only state.
 *
 * Replays may attempt the same notice, but never create duplicate records.
 */
import 'server-only'
import {FAMILY_WEEKLY_PROJECT_ID} from './auto-preparation'
import type {ReviewNotification} from './review-pipeline'

const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i
const WORKSPACE='https://app.omniraos.se/projects/familje-stunden/social#content'
export type WeeklyNoticeRecord={
 project_id:string;owner_id:string;preparation_id:string;
 week_start:string;draft_count:number;state:'awaiting_review';
 can_schedule:false;can_publish:false
}
export interface ReviewNoticeWritePort{
 currentProjectOwner:(projectId:string,ownerId:string)=>Promise<boolean>
 insertOnce:(row:WeeklyNoticeRecord)=>Promise<void>
}
export function validateReviewNoticeForOwner(
 notice:unknown,ownerId:string
):WeeklyNoticeRecord|null{
 if(!notice||typeof notice!=='object'||Array.isArray(notice)||!UUID.test(ownerId))return null
 const n=notice as Partial<ReviewNotification>
 if(n.kind!=='familje-stunden-weekly-editorial-review'||
 n.projectId!==FAMILY_WEEKLY_PROJECT_ID||
 !n.preparationId||!UUID.test(n.preparationId)||
 !n.weekStart||!/^20\d\d-\d\d-\d\d$/.test(n.weekStart)||
 !n.count||![2,4].includes(n.count)||n.workspaceUrl!==WORKSPACE||
 typeof n.message!=='string'||n.message.length>550||
 !n.message.includes('Ingenting är ännu godkänt')){
  return null
 }
 return {project_id:FAMILY_WEEKLY_PROJECT_ID,owner_id:ownerId,
  preparation_id:n.preparationId,week_start:n.weekStart,
  draft_count:n.count,state:'awaiting_review',
  can_schedule:false,can_publish:false}
}
export async function recordWeeklyReviewNotice(
 port:ReviewNoticeWritePort,ownerId:string,notice:unknown
):Promise<'recorded'|'blocked'>{
 const row=validateReviewNoticeForOwner(notice,ownerId)
 if(!row)return 'blocked'
 try{
  if(!(await port.currentProjectOwner(row.project_id,row.owner_id)))return 'blocked'
  // SQL verifies the actual saved preparation. Upsert must mean
  // ON CONFLICT (preparation_id) DO NOTHING, never DO UPDATE.
  await port.insertOnce(row)
  return 'recorded'
 }catch{return 'blocked'}
}
