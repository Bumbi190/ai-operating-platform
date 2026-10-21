import 'server-only'
import {createHash,createHmac,randomUUID} from 'node:crypto'
import {isVerifiedCleanupOperator,type VerifiedCleanupOperator} from './authority'
import {
 HANDLARBORSEN_PROJECT_ID,HANDLARBORSEN_TEST_DATA_URL,HANDLARBORSEN_TEST_DATA_PATH,
 canonicalCleanupJson,decodeIntegrationRequest,decodeInventoryView,decodePreparationResult,decodeReceiptView,
 exactKeys,isObject,type IntegrationResponse,type PackageView,
} from './contracts'

export function signCleanupEnvelope(body:Record<string,unknown>,keyId:string,key:string,signedAt:string){
 const canonical=canonicalCleanupJson(body)
 const payload=isObject(body.payload)?body.payload:{}
 const executionId=body.action==='execute'||body.action==='receipt'?String(payload.executionId):''
 const message=['POST',HANDLARBORSEN_TEST_DATA_PATH,createHash('sha256').update(canonical).digest('hex'),keyId,String(body.operatorBindingId),String(body.requestId),executionId,signedAt].join('\n')
 return {body:canonical,headers:{'content-type':'application/json','x-atlas-key-id':keyId,'x-atlas-request-id':String(body.requestId),'x-atlas-signed-at':signedAt,'x-atlas-signature':createHmac('sha256',key).update(message).digest('hex')}}
}
function configuredKey(execute:boolean):string|null{
 const read=process.env.HANDLARBORSEN_TEST_DATA_READ_KEY,write=process.env.HANDLARBORSEN_TEST_DATA_EXECUTE_KEY
 const key=execute?write:read
 if(!key||key.length<32||read===write||[process.env.HANDLARBORSEN_METRICS_TOKEN,process.env.CRON_SECRET].filter(Boolean).includes(key))return null
 return key
}
function boundPackage(p:PackageView,principal:VerifiedCleanupOperator):boolean{
 return p.projectId===principal.projectId&&p.conversationId===principal.conversationId&&p.operatorBindingId===principal.operatorBindingId
}
async function boundedJson(response:Response,signal:AbortSignal):Promise<unknown>{
 if(Number(response.headers.get('content-length'))>65536)throw Error('response_limit')
 const reader=response.body?.getReader();if(!reader)throw Error('empty_response')
 let size=0;const chunks:Uint8Array[]=[]
 const cancel=()=>{void reader.cancel().catch(()=>{})};signal.addEventListener('abort',cancel,{once:true})
 try{
  while(true){if(signal.aborted)throw Error('deadline');const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>65536)throw Error('response_limit');chunks.push(value)}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))
 }finally{signal.removeEventListener('abort',cancel);void reader.cancel().catch(()=>{})}
}
export async function callHandlarborsenTestData(input:unknown,principal:VerifiedCleanupOperator):Promise<IntegrationResponse>{
 if(!isVerifiedCleanupOperator(principal)||principal.projectId!==HANDLARBORSEN_PROJECT_ID)return {status:'denied'}
 const command=decodeIntegrationRequest(input);if(!command)return {status:'denied'}
 const execute=command.action==='execute'
 if(execute&&process.env.ATLAS_TEST_DATA_MUTATIONS_ENABLED!=='true')return {status:'disabled'}
 if(command.action==='prepare'&&!principal.allowedOperations.includes(command.payload.operation))return {status:'denied'}
 if(execute){
  const p=command.payload.approvedPackage
  if(!boundPackage(p,principal)||!principal.allowedOperations.includes(p.operation))return {status:'denied'}
  if(Date.parse(p.expiresAt)<=Date.now())return {status:'needs_new_review'}
 }
 const key=configuredKey(execute);if(!key)return {status:'unavailable'}
 const uncertain=():IntegrationResponse=>command.action==='execute'?{status:'unknown',executionId:command.payload.executionId}:{status:'unavailable'}
 const requestId=randomUUID(),body={schemaVersion:1,requestId,projectId:principal.projectId,operatorBindingId:principal.operatorBindingId,omniraUserId:principal.userId,conversationId:principal.conversationId,...command}
 const signed=signCleanupEnvelope(body,execute?'execute-v1':'read-v1',key,String(Date.now()))
 const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined
 const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('deadline'))},10000)})
 try{
  const response=await Promise.race([fetch(HANDLARBORSEN_TEST_DATA_URL,{method:'POST',redirect:'error',cache:'no-store',...signed,signal:controller.signal}),deadline])
  const data=await Promise.race([boundedJson(response,controller.signal),deadline])
  if(response.status!==200){
   if(isObject(data)&&exactKeys(data,['status'])){
    if(response.status===409&&data.status==='needs_new_review')return {status:'needs_new_review'}
    if(response.status===503&&data.status==='mutations_disabled')return {status:'disabled'}
    if(response.status===401&&data.status==='unauthorized'||response.status===403&&data.status==='forbidden')return {status:'denied'}
    if(response.status===503&&data.status==='unconfigured')return {status:'unavailable'}
   }
   return uncertain()
  }
  if(!isObject(data)||!exactKeys(data,['schemaVersion','status','action','requestId','data'])||data.schemaVersion!==1||data.status!=='ok'||data.action!==command.action||data.requestId!==requestId)return uncertain()
  if(command.action==='inventory'){const view=decodeInventoryView(data.data);return view?{status:'ok',action:'inventory',data:view}:uncertain()}
  if(command.action==='prepare'){
   const view=decodePreparationResult(data.data)
   if(!view)return uncertain()
   if(view.status==='nothing_to_do')return command.payload.organisationIds.length===0?{status:'ok',action:'prepare',data:view}:uncertain()
   if(!boundPackage(view,principal)||view.operation!==command.payload.operation||canonicalCleanupJson(view.organisationIds)!==canonicalCleanupJson(command.payload.organisationIds))return uncertain()
   return {status:'ok',action:'prepare',data:view}
  }
  if(data.data===null)return command.action==='receipt'?{status:'ok',action:'receipt',data:null}:uncertain()
  const receipt=decodeReceiptView(data.data)
  if(!receipt||receipt.executionId!==command.payload.executionId)return uncertain()
  if(command.action==='execute'&&(receipt.packageId!==command.payload.packageId||receipt.operation!==command.payload.approvedPackage.operation||canonicalCleanupJson(receipt.counts)!==canonicalCleanupJson(command.payload.approvedPackage.counts)))return uncertain()
  return {status:'ok',action:command.action,data:receipt}
 }catch{return uncertain()}finally{if(timer)clearTimeout(timer);controller.abort()}
}
