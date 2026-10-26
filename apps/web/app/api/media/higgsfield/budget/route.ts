import {authorize,json,selectedProject} from '@/lib/media/higgsfield/http'
import {readHiggsfieldDailyBudget} from '@/lib/media/higgsfield/daily-budget'
export const dynamic='force-dynamic'

/** Operator-only, project-authorized status read; never quotes or generates. */
export async function GET(request:Request){
 const access=await authorize()
 if(!access.ok)return access.response
 const project=await selectedProject(request,access.allows,false)
 if(typeof project!=='string')return project
 try{
  const snapshot=await readHiggsfieldDailyBudget()
  return json({ok:true,...snapshot})
 }catch{
  return json({ok:false,error:'budget_unavailable'},503)
 }
}
