import 'server-only'
import {randomUUID} from 'node:crypto'
import {requireCronAuth} from '@/lib/api-auth'
import {createAdminClient} from '@/lib/supabase/admin'
import {enabledScheduleProjects} from './store'
import {runScheduleTick} from './worker'
const headers={'cache-control':'private, no-store','x-content-type-options':'nosniff'}
export async function socialScheduleTickApi(request:Request){
 const auth=requireCronAuth(request);if(!auth.ok){Object.entries(headers).forEach(([k,v])=>auth.response.headers.set(k,v));return auth.response}
 if(request.method!=='GET')return Response.json({code:'INVALID_BODY'},{status:405,headers})
 const u=new URL(request.url),keys=[...u.searchParams.keys()]
 if(keys.some(k=>k!=='dryRun')||u.searchParams.getAll('dryRun').length>1||u.searchParams.has('dryRun')&&u.searchParams.get('dryRun')!=='1')return Response.json({code:'INVALID_BODY'},{status:400,headers})
 const dryRun=u.searchParams.get('dryRun')==='1'
 if(!enabledScheduleProjects().length)return Response.json({mode:dryRun?'dry_run':'execute',jobId:null,result:'disabled'},{headers})
 try{return Response.json(await runScheduleTick(createAdminClient(),{workerId:'schedule_'+randomUUID(),now:new Date().toISOString(),dryRun}),{headers})}
 catch{return Response.json({code:'UNAVAILABLE'},{status:503,headers})}
}
