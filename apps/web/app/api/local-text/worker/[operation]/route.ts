import {NextResponse} from 'next/server'
import {createAdminClient} from '@/lib/supabase/admin'
import {executeWorkerRequest} from '@/lib/local-text/worker-api'
import {WORKER_OPERATIONS} from '@omnira/local-text-contract'
import type {WorkerOperation} from '@/lib/local-text/types'
export const runtime='nodejs'
export const dynamic='force-dynamic'
const headers={'Cache-Control':'no-store'}
export async function POST(request:Request,{params}:{params:{operation:string}}){
 if(process.env.ATLAS_LOCAL_TEXT_ENABLED!=='true')return NextResponse.json({error:'LOCAL_TEXT_DISABLED'},{status:503,headers})
 if(!WORKER_OPERATIONS.includes(params.operation as WorkerOperation))return NextResponse.json({error:'UNKNOWN_OPERATION'},{status:404,headers})
 try{
  const response=await executeWorkerRequest(createAdminClient(),request,params.operation as WorkerOperation)
  return NextResponse.json(response,{status:response.result.kind==='unknown'?503:200,headers})
 }catch(error){
  const reason=error instanceof Error?error.message:''
  return NextResponse.json({error:reason==='INVALID_WORKER_PAYLOAD'?'INVALID_WORKER_PAYLOAD':reason==='INVALID_WORKER_REQUEST'?'INVALID_WORKER_REQUEST':'LOCAL_TEXT_UNAVAILABLE'},{status:reason==='INVALID_WORKER_REQUEST'?403:reason==='INVALID_WORKER_PAYLOAD'?400:503,headers})
 }
}
