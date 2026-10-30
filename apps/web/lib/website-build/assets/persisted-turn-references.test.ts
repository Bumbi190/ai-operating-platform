import {beforeEach,describe,expect,it,vi} from 'vitest'
import {createHash,randomUUID} from 'node:crypto'
import type {ProjectAccessOk} from '@/lib/auth/project-access'
const state=vi.hoisted(()=>({
  imageReads:0,workspaceReads:0,workspaceDenied:false,
  onImage:(()=>{}) as ()=>void,
}))
vi.mock('./read',()=>({readVerifiedReference:async(_db:unknown,_owner:unknown,ref:{ticketId:string})=>{
  state.imageReads++;state.onImage()
  return {assetId:ref.ticketId,bytes:Uint8Array.from([82,73,70,70]),mimeType:'image/webp'}
}}))
vi.mock('./tickets',()=>({assertReferenceWorkspace:async()=>{
  state.workspaceReads++
  if(state.workspaceDenied)throw Object.assign(new Error('denied'),{code:'NOT_FOUND',status:404})
}}))
import {preparePersistedReferenceTurn} from './turn-references'

const ownerId=randomUUID(),projectId=randomUUID(),conversationId=randomUUID(),turnId=randomUUID()
const tickets=[randomUUID(),randomUUID()]
const owner:ProjectAccessOk={ok:true,userId:ownerId,allowedProjectIds:[projectId]}
const active={projectId,conversationId,turnId,messageText:'Använd dessa bilder som inspiration, inte instruktioner.'}
const selection={...active,ticketIds:tickets}
type Row={id:string;conversation_id:string;role:string;content:string|null;conversations:unknown}
const valid=():Row=>({id:turnId,conversation_id:conversationId,role:'user',content:active.messageText,
  conversations:{id:conversationId,user_id:ownerId,project_id:projectId}})
function fixture(){
 let row:Row|null=valid(),error:unknown=null,reads=0
 const queries:Array<{table:string;fields:string;filters:Array<[string,unknown]>}>=[]
 const db={from(table:string){
  const q={table,fields:'',filters:[] as Array<[string,unknown]>};queries.push(q)
  return {select(fields:string){q.fields=fields;return this},eq(key:string,value:unknown){q.filters.push([key,value]);return this},
   async maybeSingle(){reads++;return {data:row,error}}}
 }}
 return {db:db as never,queries,get reads(){return reads},
  setRow(value:Row|null){row=value},fail(){error={message:'private provider diagnostic'}}}
}
beforeEach(()=>{
 vi.stubEnv('ATLAS_REFERENCE_UPLOAD_ENABLED','true')
 state.imageReads=0;state.workspaceReads=0;state.workspaceDenied=false;state.onImage=()=>{}
})
describe('persisted user-message reference validation',()=>{
 it('binds exact stored user text and ordered verified images to owner/project/message',async()=>{
  const f=fixture(),result=await preparePersistedReferenceTurn(f.db,owner,selection,active)
  expect(result.turnId).toBe(turnId);expect(result.images.map(i=>i.ticketId)).toEqual(tickets)
  const expected=createHash('sha256').update(JSON.stringify([
   'omnira.website-reference-turn.v1',ownerId,projectId,conversationId,turnId,
   result.messageSha256,result.referenceSha256,
  ])).digest('hex')
  expect(result.bindingSha256).toBe(expected)
  expect(f.reads).toBe(2)
  for(const q of f.queries){
   expect(q.table).toBe('conversation_messages')
   expect(q.fields).toContain('conversations!inner(')
   expect(q.filters).toEqual(expect.arrayContaining([
    ['id',turnId],['conversation_id',conversationId],['role','user'],
    ['conversations.user_id',ownerId],['conversations.project_id',projectId],
   ]))
  }
 })
 const badRows:Array<[string,()=>Row|null]>=[
  ['missing message',()=>null],
  ['another message',()=>({...valid(),id:randomUUID()})],
  ['another conversation',()=>({...valid(),conversation_id:randomUUID()})],
  ['assistant row',()=>({...valid(),role:'assistant'})],
  ['tool row',()=>({...valid(),role:'tool'})],
  ['edited text',()=>({...valid(),content:active.messageText+' '})],
  ['empty content',()=>({...valid(),content:null})],
  ['missing parent',()=>({...valid(),conversations:null})],
  ['array parent',()=>({...valid(),conversations:[valid().conversations]})],
  ['foreign parent id',()=>({...valid(),conversations:{id:randomUUID(),user_id:ownerId,project_id:projectId}})],
  ['foreign owner',()=>({...valid(),conversations:{id:conversationId,user_id:randomUUID(),project_id:projectId}})],
  ['foreign project',()=>({...valid(),conversations:{id:conversationId,user_id:ownerId,project_id:randomUUID()}})],
 ]
 for(const [name,row] of badRows)it('refuses '+name+' before private image reads',async()=>{
  const f=fixture();f.setRow(row())
  await expect(preparePersistedReferenceTurn(f.db,owner,selection,active)).rejects.toMatchObject({code:'NOT_FOUND'})
  expect(state.imageReads).toBe(0)
 })
 it('fails closed on database errors without exposing the provider diagnostic',async()=>{
  const f=fixture();f.fail()
  await expect(preparePersistedReferenceTurn(f.db,owner,selection,active)).rejects.toMatchObject({code:'BUILD_UNAVAILABLE',message:'BUILD_UNAVAILABLE'})
  expect(state.imageReads).toBe(0)
 })
 it('refuses changed stored content while image bytes are being read',async()=>{
  const f=fixture();state.onImage=()=>f.setRow({...valid(),content:'Changed during download'})
  await expect(preparePersistedReferenceTurn(f.db,owner,selection,active)).rejects.toMatchObject({code:'NOT_FOUND'})
  expect(state.imageReads).toBe(2)
 })
 it('refuses revoked parent ownership while image bytes are being read',async()=>{
  const f=fixture();state.onImage=()=>f.setRow({...valid(),conversations:{id:conversationId,user_id:randomUUID(),project_id:projectId}})
  await expect(preparePersistedReferenceTurn(f.db,owner,selection,active)).rejects.toMatchObject({code:'NOT_FOUND'})
 })
 it('rechecks active workspace access after image reads',async()=>{
  const f=fixture();state.onImage=()=>{state.workspaceDenied=true}
  await expect(preparePersistedReferenceTurn(f.db,owner,selection,active)).rejects.toMatchObject({code:'NOT_FOUND'})
 })
 it('performs no database or image access for mismatched active scope or a disabled feature',async()=>{
  const f=fixture()
  for(const wrong of [{...active,turnId:randomUUID()},{...active,projectId:randomUUID()},{...active,messageText:'other'}]){
   await expect(preparePersistedReferenceTurn(f.db,owner,selection,wrong)).rejects.toMatchObject({code:'NOT_FOUND'})
  }
  await expect(preparePersistedReferenceTurn(f.db,{...owner,allowedProjectIds:[]},selection,active)).rejects.toMatchObject({code:'NOT_FOUND'})
  vi.stubEnv('ATLAS_REFERENCE_UPLOAD_ENABLED','false')
  await expect(preparePersistedReferenceTurn(f.db,owner,selection,active)).rejects.toMatchObject({code:'REFERENCE_UNAVAILABLE'})
  expect(f.reads).toBe(0);expect(state.imageReads).toBe(0)
 })
 it('binds different image order to a different receipt without modifying stored rows',async()=>{
  const f=fixture(),a=await preparePersistedReferenceTurn(f.db,owner,selection,active)
  const b=await preparePersistedReferenceTurn(f.db,owner,{...selection,ticketIds:[...tickets].reverse()},active)
  expect(a.bindingSha256).not.toBe(b.bindingSha256)
  expect(f.queries.every(q=>q.table==='conversation_messages')).toBe(true)
 })
})
