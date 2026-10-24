import 'server-only'
import {NextResponse} from 'next/server'
import {resolvePlatformOperator} from '@/lib/auth/platform-operator'
import {resolveProjectAccess,assertProjectAllowed} from '@/lib/auth/project-access'
import {HiggsfieldError} from './types'
import {HIGGSFIELD_CALLBACK_PATH} from './config'
export function json(value:unknown,status=200){return NextResponse.json(value,{status,headers:{'Cache-Control':'no-store'}})}
export function refusal(error:unknown){
 const code=error instanceof HiggsfieldError?error.code:'provider_unavailable'
 // Stage values are a closed list authored by Omnira; never serialize raw
 // provider/SDK messages, OAuth fields or unknown exception properties.
 const safeStages=['connect','list_tools','tool_schema','balance','model','quote','consistency']
 const stage=error instanceof HiggsfieldError&&error.stage&&safeStages.includes(error.stage)?error.stage:null
 return json({ok:false,error:code,...(stage?{stage}:{})},code==='access_denied'?403:code==='state_invalid'?400:503)
}
export async function authorize() {
 const operator=await resolvePlatformOperator()
 if(!operator.ok)return {ok:false as const,response:json({ok:false,error:'access_denied'},operator.reason==='unauthenticated'?401:403)}
 const access=await resolveProjectAccess()
 if(!access.ok)return {ok:false as const,response:access.response}
 if(access.userId!==operator.userId)return {ok:false as const,response:json({ok:false,error:'access_denied'},403)}
 return {ok:true as const,actorId:operator.userId,allows:(p:string)=>assertProjectAllowed(p,access.allowedProjectIds)}
}
export function callbackUri():URL {
 try {
  const url=new URL(process.env.HIGGSFIELD_OAUTH_REDIRECT_URI??'')
  const local=process.env.NODE_ENV==='development'&&['localhost','127.0.0.1'].includes(url.hostname)
  if((url.protocol!=='https:'&&!(local&&url.protocol==='http:'))||url.username||url.password||url.search||url.hash||url.pathname!==HIGGSFIELD_CALLBACK_PATH)throw Error()
  return url
 }catch{throw new HiggsfieldError('not_configured')}
}
export async function selectedProject(request:Request,allows:(p:string)=>boolean,mutation:boolean):Promise<string|NextResponse> {
 if(mutation) {
  let origin:string
  try {origin=callbackUri().origin}catch(e){return refusal(e)}
  if(request.headers.get('origin')!==origin)return json({ok:false,error:'access_denied'},403)
 }
 let value:unknown
 if(mutation){
  try {const body=await request.json();if(!body||Array.isArray(body)||typeof body!=='object'||Object.keys(body).some(k=>k!=='project_id'))return json({ok:false,error:'invalid_request'},400);value=body.project_id}
  catch{return json({ok:false,error:'invalid_request'},400)}
 }else value=new URL(request.url).searchParams.get('project_id')
 if(typeof value!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value))return json({ok:false,error:'invalid_request'},400)
 if(!allows(value))return json({ok:false,error:'access_denied'},403)
 return value
}
