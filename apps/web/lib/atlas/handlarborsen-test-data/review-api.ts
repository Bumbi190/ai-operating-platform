import 'server-only'
import {resolveCleanupOperator} from './authority'
import {dispatchApprovedCleanup,reconcileCleanup} from './service'
import {cleanupRpc} from './review-store'
import {decodeReviewView} from './stream-effect'
import {HANDLARBORSEN_PROJECT_ID,exactKeys,isObject,isUuid} from './contracts'
const headers={'cache-control':'private, no-store'}
const response=(status:number,value:unknown)=>Response.json(value,{status,headers})
async function bodyOf(request:Request):Promise<unknown>{
 const reader=request.body?.getReader();if(!reader)throw Error('body')
 let timer:ReturnType<typeof setTimeout>|undefined,size=0;const chunks:Uint8Array[]=[]
 try{
  const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{void reader.cancel();reject(Error('body'))},10000)})
  while(true){const {done,value}=await Promise.race([reader.read(),deadline]);if(done)break;size+=value.length;if(size>8192)throw Error('body');chunks.push(value)}
  const bytes=new Uint8Array(size);let offset=0;for(const v of chunks){bytes.set(v,offset);offset+=v.length}
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes))
 }finally{if(timer)clearTimeout(timer);void reader.cancel().catch(()=>{})}
}
export async function cleanupReviewApi(request:Request,packageId:string):Promise<Response>{
 if(!isUuid(packageId))return response(400,{status:'invalid_request'})
 const write=request.method==='POST'
 if(!write&&request.method!=='GET')return response(405,{status:'invalid_request'})
 if(write&&request.headers.get('origin')!==new URL(request.url).origin)return response(403,{status:'denied'})
 let raw:unknown
 try{raw=write?await bodyOf(request):Object.fromEntries(new URL(request.url).searchParams)}
 catch{return response(400,{status:'invalid_request'})}
 if(!isObject(raw)||!exactKeys(raw,write?['conversationId','reviewRef','decision']:['conversationId'])||!isUuid(raw.conversationId)||
 (write&&(!isUuid(raw.reviewRef)||!['approve','reject'].includes(String(raw.decision)))))return response(400,{status:'invalid_request'})
 const scope={projectId:HANDLARBORSEN_PROJECT_ID,conversationId:raw.conversationId}
 const auth=await resolveCleanupOperator(scope)
 if(!auth.ok)return response(auth.reason==='unauthenticated'?401:403,{status:'denied'})
 if(write&&process.env.ATLAS_TEST_DATA_MUTATIONS_ENABLED!=='true')return response(503,{status:'disabled'})
 try{
  const args={p_user_id:auth.principal.userId,p_project_id:scope.projectId,p_conversation_id:scope.conversationId,p_package_id:packageId}
  const value=await cleanupRpc(write?'handlarborsen_test_data_decide_review':'handlarborsen_test_data_read_review',{...args,...(write?{p_review_ref:raw.reviewRef,p_decision:raw.decision}:{})})
  const view=decodeReviewView(value)
  if(!view)return response(409,{status:'needs_new_review'})
  if(view.packageView.packageId!==packageId||view.packageView.conversationId!==scope.conversationId||view.packageView.operatorBindingId!==auth.principal.operatorBindingId)return response(403,{status:'denied'})
  if(!write&&view.decisionState==='approved'&&!view.receipt&&view.executionId){
   await reconcileCleanup(packageId,scope)
   const refreshed=decodeReviewView(await cleanupRpc('handlarborsen_test_data_read_review',args))
   return response(200,refreshed??view)
  }
  if(write&&raw.decision==='approve'&&view.decisionState==='approved'){
   // Durable approval/outbox already committed. This work has no microphone abort signal.
   await dispatchApprovedCleanup(packageId,scope)
   const refreshed=decodeReviewView(await cleanupRpc('handlarborsen_test_data_read_review',args))
   return response(200,refreshed??view)
  }
  return response(200,view)
 }catch{return response(503,{status:'unavailable'})}
}
