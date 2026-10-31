import 'server-only'
import {resolveProjectAccess} from '@/lib/auth/project-access'
import {createAdminClient} from '@/lib/supabase/admin'
import {salesEnabled} from '@/lib/sales/feature'
import {readReplyDrafts} from '@/lib/sales/replies/store'
export const dynamic='force-dynamic'
const privateHeaders={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}
/** Private editorial metadata only. A reminder creates no send authority. */
export async function GET(){
 const access=await resolveProjectAccess()
 if(!access.ok)return new Response(null,{status:404,headers:privateHeaders})
 const projects=[...new Set(access.allowedProjectIds)].filter(projectId=>salesEnabled(projectId))
 if(!projects.length)return new Response(null,{status:404,headers:privateHeaders})
 try{
  const db=createAdminClient(),approvalIds=new Set<string>();let mayHaveMore=false
  for(const projectId of projects){
   const model=await readReplyDrafts(db,access,{projectId})
   mayHaveMore ||= model.jobs.length>=50
   const jobs=new Map(model.jobs.map(job=>[job.id,job]))
   for(const draft of model.drafts){const job=jobs.get(draft.jobId)
    if(job&&draft.current&&draft.status==='pending'&&draft.approvalId&&draft.questions.length===0&&job.sourceCurrent&&!job.newerIncoming&&!['failed','cancelled','reconciling'].includes(job.status))approvalIds.add(draft.approvalId)
   }
  }
  return Response.json({state:'ok',pendingCount:approvalIds.size,approvalIds:[...approvalIds],mayHaveMore},{headers:privateHeaders})
 }catch{return Response.json({state:'unavailable'},{status:503,headers:privateHeaders})}
}
