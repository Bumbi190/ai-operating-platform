/**
 * In-app owner review notices. Only a session/RLS SELECT is allowed here.
 * No message bodies, email addresses, social provider identifiers or dispatch.
 */
import 'server-only'
import {FAMILY_WEEKLY_PROJECT_ID} from './auto-preparation'

const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i
export type WeeklyReviewNoticeView={
 preparationId:string;weekStart:string;draftCount:2|4;createdAt:string;
 workspaceUrl:'https://app.omniraos.se/projects/familje-stunden/social#content'
}
export type WeeklyReviewList={
 available:boolean;notices:WeeklyReviewNoticeView[]
}
export interface WeeklyReviewReadPort {
 list:(projectId:string,ownerId:string)=>Promise<unknown>
}
const REVIEW_URL='https://app.omniraos.se/projects/familje-stunden/social#content' as const

export async function readRecentWeeklyReviewNotices(
 port:WeeklyReviewReadPort,ownerId:string,projectId:string
):Promise<WeeklyReviewList>{
 if(!UUID.test(ownerId)||projectId!==FAMILY_WEEKLY_PROJECT_ID){
  return {available:false,notices:[]}
 }
 try{
  const data=await port.list(projectId,ownerId)
  if(!Array.isArray(data)||data.length>5)return {available:false,notices:[]}
  const result:WeeklyReviewNoticeView[]=[]
  for(const raw of data){
   if(!raw||typeof raw!=='object'||Array.isArray(raw))return {available:false,notices:[]}
   const row=raw as Record<string,unknown>
   if(row.project_id!==projectId||row.owner_id!==ownerId||
    typeof row.preparation_id!=='string'||!UUID.test(row.preparation_id)||
    typeof row.week_start!=='string'||!/^20\d\d-\d\d-\d\d$/.test(row.week_start)||
    ![2,4].includes(row.draft_count as number)||
    row.state!=='awaiting_review'||row.can_publish!==false||row.can_schedule!==false||
    typeof row.created_at!=='string'||!Number.isFinite(Date.parse(row.created_at))){
    return {available:false,notices:[]}
   }
   result.push({
    preparationId:row.preparation_id,weekStart:row.week_start,
    draftCount:row.draft_count as 2|4,createdAt:row.created_at,workspaceUrl:REVIEW_URL,
   })
  }
  return {available:true,notices:result}
 }catch{return {available:false,notices:[]}}
}
