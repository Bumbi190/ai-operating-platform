import {beforeEach,describe,expect,it,vi} from 'vitest'
import {createHash,randomUUID} from 'node:crypto'
import type {ProjectAccessOk} from '@/lib/auth/project-access'
const source=vi.hoisted(()=>({fail:false}))
vi.mock('./turn-references',async original=>{
 const real=await original<typeof import('./turn-references')>()
 return {...real,prepareReferenceTurn:async(_db:unknown,_p:unknown,raw:any)=>{
  if(source.fail)throw Object.assign(new Error('not found'),{code:'NOT_FOUND',status:404})
  const images=raw.ticketIds.map((ticketId:string)=>({ticketId,assetId:ticketId,mimeType:'image/webp',
    sha256:'a'.repeat(64),bytes:new Uint8Array([1,2,3])}))
  return {...raw,messageSha256:hash(raw.messageText),
    referenceSha256:hash(JSON.stringify(images.map((i:any)=>[i.ticketId,i.assetId,i.sha256]))),images}
 }}
})
import {persistReferenceUserTurn,parseReferenceUserTurn} from './persist-reference-turn'
const hash=(s:string)=>createHash('sha256').update(s).digest('hex')
const ownerId=randomUUID(),projectId=randomUUID(),conversationId=randomUUID(),messageId=randomUUID()
const owner:ProjectAccessOk={ok:true,userId:ownerId,allowedProjectIds:[projectId]}
const input={projectId,conversationId,messageText:'Använd dessa referenser.',ticketIds:[randomUUID(),randomUUID()],idempotencyKey:randomUUID()}
function receipt(args:any){
 const messageSha256=hash(args.p_message_text)
 const referenceSha256=hash(JSON.stringify(args.p_images.map((i:any)=>[i.ticketId,i.assetId,i.sha256])))
 return {messageId,projectId:args.p_project_id,conversationId:args.p_conversation_id,messageSha256,referenceSha256,
  bindingSha256:hash(JSON.stringify(['omnira.website-reference-turn.v1',ownerId,args.p_project_id,args.p_conversation_id,messageId,messageSha256,referenceSha256])),
  imageCount:args.p_images.length}
}
function fixture(){
 const calls:Array<{name:string;args:any}>=[]
 let change=(data:any)=>data,error:any=null
 const db={rpc:async(name:string,args:any)=>{calls.push({name,args});return {data:change(receipt(args)),error}}}
 return {db:db as never,calls,alter(fn:(data:any)=>any){change=fn},fail(message:string){error={message,details:'private diagnostics'}}}
}
beforeEach(()=>{vi.stubEnv('ATLAS_REFERENCE_UPLOAD_ENABLED','true');source.fail=false})
describe('atomic user-message reference persistence adapter',()=>{
 it('returns only a verified server-generated message receipt and sends no image bytes',async()=>{
  const f=fixture(),result=await persistReferenceUserTurn(f.db,owner,input)
  expect(result.messageId).toBe(messageId);expect(result.messageId).not.toBe(input.idempotencyKey)
  expect(result.imageCount).toBe(2)
  expect(Object.keys(result).sort()).toEqual(['bindingSha256','conversationId','imageCount','messageId','messageSha256','projectId','referenceSha256'])
  expect(f.calls[0].name).toBe('website_build_persist_reference_turn')
  expect(f.calls[0].args.p_owner_id).toBe(ownerId)
  expect(f.calls[0].args.p_idempotency_key).toBe(input.idempotencyKey)
  expect(Object.keys(f.calls[0].args.p_images[0]).sort()).toEqual(['assetId','mimeType','sha256','ticketId'])
 })
 it('refuses client message IDs, owner fields, storage URLs and malformed/repeated references',()=>{
  for(const bad of [{...input,turnId:messageId},{...input,ownerId},{...input,storageUrl:'https://evil.test'},
   {...input,idempotencyKey:'invalid'},{...input,ticketIds:[]},
   {...input,ticketIds:[input.ticketIds[0],input.ticketIds[0]]}]){
   expect(()=>parseReferenceUserTurn(bad)).toThrow()
  }
 })
 it('detaches and canonicalizes UUID input',()=>{
  const raw={...input,projectId:projectId.toUpperCase(),ticketIds:[...input.ticketIds]}
  const parsed=parseReferenceUserTurn(raw);raw.ticketIds.reverse()
  expect(parsed.projectId).toBe(projectId);expect(parsed.ticketIds).toEqual(input.ticketIds)
 })
 it('does not access persistence when disabled, out of project scope or image verification fails',async()=>{
  const f=fixture();vi.stubEnv('ATLAS_REFERENCE_UPLOAD_ENABLED','false')
  await expect(persistReferenceUserTurn(f.db,owner,input)).rejects.toMatchObject({code:'REFERENCE_UNAVAILABLE'})
  vi.stubEnv('ATLAS_REFERENCE_UPLOAD_ENABLED','true')
  await expect(persistReferenceUserTurn(f.db,{...owner,allowedProjectIds:[]},input)).rejects.toMatchObject({code:'NOT_FOUND'})
  source.fail=true
  await expect(persistReferenceUserTurn(f.db,owner,input)).rejects.toMatchObject({code:'NOT_FOUND'})
  expect(f.calls).toHaveLength(0)
 })
 for(const [label,alter] of [
  ['foreign project',(d:any)=>({...d,projectId:randomUUID()})],
  ['foreign conversation',(d:any)=>({...d,conversationId:randomUUID()})],
  ['invalid message ID',(d:any)=>({...d,messageId:'bad'})],
  ['wrong text hash',(d:any)=>({...d,messageSha256:'b'.repeat(64)})],
  ['wrong image order hash',(d:any)=>({...d,referenceSha256:'b'.repeat(64)})],
  ['forged binding',(d:any)=>({...d,bindingSha256:'b'.repeat(64)})],
  ['partial images',(d:any)=>({...d,imageCount:1})],
  ['unexpected authority',(d:any)=>({...d,executionAuthorized:true})],
  ['missing receipt',()=>null],
 ] as const)it('rejects '+label+' in database receipt',async()=>{
  const f=fixture();f.alter(alter)
  await expect(persistReferenceUserTurn(f.db,owner,input)).rejects.toMatchObject({code:'BUILD_UNAVAILABLE'})
 })
 for(const [message,code] of [
  ['ATLAS_REFERENCE_CONFLICT','CONFLICT'],['ATLAS_REFERENCE_NOT_FOUND','NOT_FOUND'],
  ['ATLAS_REFERENCE_INVALID','INVALID_BODY'],['secret backend details','BUILD_UNAVAILABLE'],
 ])it('maps '+message+' without leaking database diagnostics',async()=>{
  const f=fixture();f.fail(message)
  await expect(persistReferenceUserTurn(f.db,owner,input)).rejects.toMatchObject({code,message:code})
 })
})
