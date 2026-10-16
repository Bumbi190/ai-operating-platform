import 'server-only'
import {resolveProjectAccess} from '@/lib/auth/project-access'
import {resolvePlatformOperator} from '@/lib/auth/platform-operator'
import {createAdminClient} from '@/lib/supabase/admin'
import {assertSameOrigin} from '@/lib/atlas/executive/http'
import {newOAuthState,isOAuthState,hashOAuthState} from '@/lib/media/youtube-oauth'
import {ConnectionError,type Provider} from './types'
import {providerConfig,authorizationUrl,exchangeAndDiscover,attestDestination} from './providers'
import {connectionFields,connectionId,connectionProvider,beginConnection,consumeConnection,stageConnection,readConnection,commitConnection,probeConnectionGrant,abortConnection,type ConsumedIntent} from './store'
const headers={'cache-control':'private, no-store','referrer-policy':'no-referrer'}
function errorResponse(error:unknown){const known=error instanceof ConnectionError;return Response.json({code:known?error.code:'UNAVAILABLE'},{status:known?error.status:503,headers})}
async function access(request:Request,write:boolean){
 const a=await resolveProjectAccess()
 if(!a.ok){Object.entries(headers).forEach(([k,v])=>a.response.headers.set(k,v));return {response:a.response}}
 const operator=await resolvePlatformOperator()
 if(!operator.ok||operator.userId!==a.userId||operator.actor!=='user:'+a.userId)return {response:Response.json({code:'OPERATOR_REQUIRED'},{status:!operator.ok&&operator.reason==='unauthenticated'?401:403,headers})}
 if(write){const denied=assertSameOrigin(request);if(denied){Object.entries(headers).forEach(([k,v])=>denied.headers.set(k,v));return {response:denied}}}
 return {principal:a}
}
async function body(request:Request):Promise<Record<string,unknown>>{
 const limit=16384
 if(Number(request.headers.get('content-length'))>limit)throw new ConnectionError('INVALID_BODY')
 const reader=request.body?.getReader();if(!reader)throw new ConnectionError('INVALID_BODY')
 const chunks:Uint8Array[]=[];let size=0
 try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();throw new ConnectionError('INVALID_BODY')}chunks.push(value)}}finally{reader.releaseLock()}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
 try{const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));connectionFields(value,Object.keys(value??{}));return value}catch{throw new ConnectionError('INVALID_BODY')}
}
function checkScope(projectId:unknown,allowed:string[]){connectionId(projectId);if(!allowed.includes(projectId))throw new ConnectionError('NOT_FOUND');return projectId}
function redirect(path:string){return new Response(null,{status:303,headers:{...headers,location:new URL(path,'https://app.omniraos.se').toString()}})}
async function projectPath(db:ReturnType<typeof createAdminClient>,projectId:string,userId:string){
 const {data,error}=await db.from('projects').select('slug').eq('id',projectId).eq('owner_id',userId).maybeSingle()
 if(error||!data||typeof data.slug!=='string')throw new ConnectionError('NOT_FOUND')
 return '/projects/'+encodeURIComponent(data.slug)+'/social'
}
export async function socialConnectionStart(request:Request,params:{provider:string}):Promise<Response>{
 const a=await access(request,true);if(a.response)return a.response
 try{
  if(request.method!=='POST')throw new ConnectionError('INVALID_BODY')
  connectionProvider(params.provider);const provider=params.provider,value=await body(request)
  connectionFields(value,['projectId','planRevisionId','expectedBindingId']);const projectId=checkScope(value.projectId,a.principal!.allowedProjectIds)
  if(provider==='x')throw new ConnectionError('COST_POLICY_REQUIRED')
  const config=providerConfig(provider);if(!config)throw new ConnectionError('CONFIGURATION_REQUIRED')
  const state=newOAuthState()
  await beginConnection(createAdminClient(),a.principal!,{projectId,provider,planRevisionId:value.planRevisionId as string,expectedBindingId:value.expectedBindingId as string|null,stateHash:state.stateHash,verifier:state.codeVerifier})
  return Response.json({authorizationUrl:authorizationUrl(provider,config,state.state,state.codeChallenge)},{headers})
 }catch(error){return errorResponse(error)}
}
export async function socialConnectionCallback(request:Request,params:{provider:string}):Promise<Response>{
 const a=await access(request,false)
 if(a.response)return a.response.status===401?redirect('/login'):redirect('/settings?socialConnection=OPERATOR_REQUIRED')
 const db=createAdminClient();let intent:ConsumedIntent|null=null,path='/settings'
 try{
  if(request.method!=='GET')throw new ConnectionError('INVALID_BODY')
  connectionProvider(params.provider);const provider=params.provider
  if(provider==='x')throw new ConnectionError('COST_POLICY_REQUIRED')
  const url=new URL(request.url)
  if([...url.searchParams.keys()].some(k=>!['state','code','error','error_description'].includes(k))||[...new Set(url.searchParams.keys())].some(k=>url.searchParams.getAll(k).length!==1))throw new ConnectionError('INVALID_BODY')
  const state=url.searchParams.get('state');if(!isOAuthState(state))throw new ConnectionError('INVALID_BODY')
  intent=await consumeConnection(db,a.principal!,{provider,stateHash:hashOAuthState(state)})
  path=await projectPath(db,intent.projectId,a.principal!.userId)
  if(url.searchParams.has('error'))throw new ConnectionError('PROVIDER_DENIED')
  const code=url.searchParams.get('code');if(!code||code.length>4096)throw new ConnectionError('INVALID_BODY')
  const config=providerConfig(provider);if(!config)throw new ConnectionError('CONFIGURATION_REQUIRED')
  const grant=await exchangeAndDiscover(provider,config,{code,verifier:intent.verifier})
  await stageConnection(db,a.principal!,{intentId:intent.intentId,grant})
  return redirect(path+'?connection='+encodeURIComponent(intent.intentId))
 }catch(error){
  const code=error instanceof ConnectionError?error.code:'UNAVAILABLE'
  if(intent){try{await abortConnection(db,a.principal!,{projectId:intent.projectId,intentId:intent.intentId,failureStage:code==='SCOPE_MISSING'?'scope_missing':code==='PROVIDER_DENIED'?'authorization_denied':'provider_verification'})}catch{/* no raw audit/DB text */}}
  return redirect(path+'?connectionError='+code)
 }
}
export async function socialConnectionApi(request:Request):Promise<Response>{
 const a=await access(request,request.method!=='GET');if(a.response)return a.response
 try{
  const db=createAdminClient()
  if(request.method==='GET'){
   const url=new URL(request.url)
   if([...url.searchParams.keys()].some(k=>!['projectId','intentId'].includes(k))||url.searchParams.getAll('projectId').length!==1||url.searchParams.getAll('intentId').length!==1)throw new ConnectionError('INVALID_BODY')
   return Response.json(await readConnection(db,a.principal!,{projectId:url.searchParams.get('projectId')!,intentId:url.searchParams.get('intentId')!}),{headers})
  }
  if(request.method!=='POST')throw new ConnectionError('INVALID_BODY')
  const value=await body(request);connectionFields(value,['projectId','intentId','candidateKey'])
  const input={projectId:checkScope(value.projectId,a.principal!.allowedProjectIds),intentId:value.intentId as string,candidateKey:value.candidateKey as string}
  const view=await readConnection(db,a.principal!,{projectId:input.projectId,intentId:input.intentId})
  if(view.status!=='connected'){
   const proof=await probeConnectionGrant(db,a.principal!,input),config=providerConfig(proof.provider)
   if(proof.provider==='x')throw new ConnectionError('COST_POLICY_REQUIRED')
   if(!config)throw new ConnectionError('CONFIGURATION_REQUIRED')
   await attestDestination(proof.provider,config,proof.accessToken,proof.candidate)
  }
  return Response.json(await commitConnection(db,a.principal!,input),{headers})
 }catch(error){return errorResponse(error)}
}
