/**
 * GET /api/social-weekly-automation/cron
 * Protected future SUNDAY ENQUEUE only. NO Vercel/pg_cron schedule installed.
 * Both independent feature flags default OFF, so deploying this route alone
 * does not create runs, call AI, save drafts or publish.
 */
import 'server-only'
import {timingSafeEqual} from 'node:crypto'
import {createAdminClient} from '@/lib/supabase/admin'
import {enqueueFamilyWeeklyRun,familyWeeklyEnqueueEnabled} from '@/lib/social-launch/weekly/run-creator'
import {familyWeeklyRuntimeEnabled} from '@/lib/social-launch/weekly/enrollment'
import {familyWeeklyEnqueuePort} from '@/lib/social-launch/weekly/run-creator-db'

export const dynamic='force-dynamic'
export const runtime='nodejs'
export const maxDuration=30
const headers={'cache-control':'private, no-store','x-content-type-options':'nosniff'}

function hasValidCronBearer(request:Request,secret:string|undefined):boolean{
 if(!secret||secret.length<16)return false
 const raw=request.headers.get('authorization')??''
 const expected='Bearer '+secret
 const supplied=Buffer.from(raw,'utf8'),reference=Buffer.from(expected,'utf8')
 return supplied.length===reference.length&&timingSafeEqual(supplied,reference)
}
export async function GET(request:Request):Promise<Response>{
 if(!hasValidCronBearer(request,process.env.CRON_SECRET)){
  return Response.json({status:'unauthorized'},{status:401,headers})
 }
 const url=new URL(request.url)
 if([...url.searchParams.keys()].length||request.headers.has('x-week-start')){
  return Response.json({status:'invalid'},{status:400,headers})
 }
 if(!familyWeeklyRuntimeEnabled()||!familyWeeklyEnqueueEnabled()){
  return Response.json({status:'disabled',queued:false},{status:503,headers})
 }
 try{
  const db=createAdminClient()
  const result=await enqueueFamilyWeeklyRun(
   familyWeeklyEnqueuePort(db),new Date().toISOString(),
   {runtimeEnabled:true,enqueueEnabled:true},
  )
  return Response.json(result,{
   status:result.status==='queued'?202:result.status==='unavailable'?503:200,
   headers,
  })
 }catch{
  return Response.json({status:'unavailable',queued:false},{status:503,headers})
 }
}
