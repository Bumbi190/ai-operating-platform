import {NextResponse} from 'next/server'
import {resolveProjectAccess,assertProjectAllowed} from '@/lib/auth/project-access'
import {assertSameOrigin} from '@/lib/atlas/executive/http'
import {createAdminClient} from '@/lib/supabase/admin'
import {readBoundedRequestBody} from '@/lib/local-text/identity'
import {isUuid} from '@omnira/local-text-contract'
export const runtime='nodejs'
export const dynamic='force-dynamic'
export async function POST(request:Request,{params}:{params:{id:string}}){
 const access=await resolveProjectAccess();if(!access.ok)return access.response
 if(!isUuid(params.id)||!assertProjectAllowed(params.id,access.allowedProjectIds))return NextResponse.json({error:'FORBIDDEN'},{status:403})
 const denied=assertSameOrigin(request);if(denied)return denied
 try{
  const v:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await readBoundedRequestBody(request,1024)))
  if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).sort().join(',')!=='metadataDays,payloadSeconds')throw Error('invalid')
  const policy=v as {payloadSeconds:unknown;metadataDays:unknown}
  if(!Number.isSafeInteger(policy.payloadSeconds)||Number(policy.payloadSeconds)<1||Number(policy.payloadSeconds)>86400||!Number.isSafeInteger(policy.metadataDays)||Number(policy.metadataDays)<1||Number(policy.metadataDays)>90)throw Error('invalid')
  const db=createAdminClient(),call=db.rpc.bind(db) as unknown as (name:string,args:Record<string,unknown>)=>PromiseLike<{data:unknown;error:unknown}>
  const r=await call('local_text_set_retention',{p_owner_id:access.userId,p_project_id:params.id,p_payload_seconds:policy.payloadSeconds,p_metadata_days:policy.metadataDays})
  if(r.error||!r.data||typeof r.data!=='object'||!('kind' in r.data)||r.data.kind!=='applied')return NextResponse.json({error:'RETENTION_UNAVAILABLE'},{status:503})
  return NextResponse.json({ok:true,meaning:'shorten_only',purge:'next_maintenance'},{headers:{'Cache-Control':'private, no-store'}})
 }catch{return NextResponse.json({error:'INVALID_RETENTION'},{status:400})}
}
