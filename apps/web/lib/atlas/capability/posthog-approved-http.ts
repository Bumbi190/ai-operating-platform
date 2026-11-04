import 'server-only'
import { prepareApprovedPosthogRead, readApprovedPosthogDashboards } from './posthog-approved-read'

const STATUS: Record<string,number> = {
  posthog_unauthorized:401, posthog_invalid_project:400, posthog_project_forbidden:403,
  posthog_read_not_authorized:403, posthog_review_stale:409, posthog_not_configured:503,
  posthog_approved_read_disabled:503, posthog_read_reservation_failed:503,
  posthog_read_rate_limited:429, posthog_read_audit_failed:503, posthog_read_failed:502,
}
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}})
function failure(error:unknown) {
  const code=error instanceof Error && Object.hasOwn(STATUS,error.message)?error.message:'posthog_request_failed'
  return json({error:code},STATUS[code]??500)
}
export async function smallJson(request:Request):Promise<unknown> {
  if(!request.body)throw new Error()
  const reader=request.body.getReader()
  const signal=AbortSignal.timeout(3000)
  const cancel=()=>{void reader.cancel().catch(()=>{})}
  signal.addEventListener('abort',cancel,{once:true})
  const chunks:Uint8Array[]=[]
  let size=0
  let finished=false
  try {
    while(true){
      signal.throwIfAborted()
      const part=await reader.read()
      signal.throwIfAborted()
      if(part.done){finished=true;break}
      size+=part.value.byteLength
      if(size>4096)throw new Error()
      chunks.push(part.value)
    }
    const bytes=new Uint8Array(size)
    let offset=0
    for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}
    return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))
  }finally{
    signal.removeEventListener('abort',cancel)
    if(!finished)cancel()
    reader.releaseLock()
  }
}
export async function approvedPosthogGET(request:Request) {
  try{return json(await prepareApprovedPosthogRead({projectId:new URL(request.url).searchParams.get('projectId')}))}
  catch(error){return failure(error)}
}
export async function approvedPosthogPOST(request:Request) {
  if(request.headers.get('origin')!==new URL(request.url).origin)return json({error:'posthog_origin_denied'},403)
  if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')return json({error:'posthog_json_required'},415)
  let input:unknown
  try{input=await smallJson(request)}catch{return json({error:'posthog_invalid_json'},400)}
  try{return json(await readApprovedPosthogDashboards(input))}
  catch(error){return failure(error)}
}
