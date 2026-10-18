import {localTextReceiptLink,type LocalTextReceiptLink} from './receipt'

type Storage={getItem(key:string):string|null;setItem(key:string,value:string):void;removeItem(key:string):void}
type Ports={store:Storage;now():number;randomUUID():string;createConversation():Promise<string>;send(body:{projectId:string;conversationId:string;idempotencyKey:string}):Promise<unknown>}
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v)
const unavailable=()=>Error('PILOT_STATE_UNAVAILABLE')

/** Persist the request identity before dispatch. A lost acknowledgement may only
 * reconcile that identity; expiration never authorizes a replacement inference. */
export async function queueLocalTextPilot(projectId:string,p:Ports):Promise<LocalTextReceiptLink>{
 if(!uuid(projectId))throw unavailable()
 const key='local-text-pilot-request:'+projectId
 const write=(value:unknown)=>{const encoded=JSON.stringify(value);try{p.store.setItem(key,encoded);if(p.store.getItem(key)!==encoded)throw unavailable()}catch{throw unavailable()}}
 let pending:Record<string,unknown>|null
 try{pending=JSON.parse(p.store.getItem(key)??'null')}catch{throw unavailable()}
 if(pending){
  if(pending.version===1&&pending.phase==='expired_hold')throw Error('PILOT_REQUEST_EXPIRED')
  if(pending.version!==1||pending.projectId!==projectId||!uuid(pending.conversationId)||!uuid(pending.idempotencyKey)||typeof pending.expiresAt!=='string'||!Number.isFinite(Date.parse(pending.expiresAt)))throw unavailable()
  if(Date.parse(pending.expiresAt)<=p.now()){write({version:1,phase:'expired_hold'});throw Error('PILOT_REQUEST_EXPIRED')}
 }else{
  const conversationId=await p.createConversation(),idempotencyKey=p.randomUUID()
  if(!uuid(conversationId)||!uuid(idempotencyKey))throw unavailable()
  pending={version:1,projectId,conversationId,idempotencyKey,expiresAt:new Date(p.now()+24*3600000).toISOString()}
  write(pending)
 }
 const conversationId=String(pending.conversationId),idempotencyKey=String(pending.idempotencyKey)
 const response=await p.send({projectId,conversationId,idempotencyKey})
 const raw=response&&typeof response==='object'?(response as {receipt?:unknown}).receipt:null
 const link=localTextReceiptLink(raw),expiresAt=raw&&typeof raw==='object'?(raw as {expiresAt?:unknown}).expiresAt:null
 if(!link||link.projectId!==projectId||link.conversationId!==conversationId||typeof expiresAt!=='string'||!Number.isFinite(Date.parse(expiresAt)))throw unavailable()
 const completedKey='local-text-pilot:'+projectId,completed=JSON.stringify({type:'local_text_job',...link,expiresAt})
 try{p.store.setItem(completedKey,completed);if(p.store.getItem(completedKey)!==completed)throw unavailable();p.store.removeItem(key)}catch{throw unavailable()}
 return link
}
