import {describe,it,expect} from 'vitest'
import {handleSalesTool} from '../atlas-tools'
const id=(n:number)=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const principal={userId:id(2),allowedProjectIds:[id(1)]}
const job={id:id(8),projectId:id(1),status:'awaiting_review',editorialStatus:'approved'}
const draft={id:id(9),projectId:id(1),jobId:id(8),current:true,sha256:'a'.repeat(64),status:'approved',subject:'Synthetic test',body:'Synthetic approved body',evidenceIds:[],questions:[],runId:id(12),approvalId:id(13),createdAt:'2026-10-18T00:00:00Z'}
const send={id:id(10),status:'smtp_accepted',revisionId:id(9),revisionHash:draft.sha256,serverAccepted:true,deliveryConfirmed:false}
function fixture(options:{drafts?:unknown[];preview?:unknown;previewError?:boolean}={}){
 const calls:{name:string;args:any}[]=[]
 const client={rpc:async(name:string,args:any)=>{
  calls.push({name,args})
  const data=name==='sales_validate_conversation'?true:
   name==='sales_reply_read_job'?job:
   name==='sales_reply_read_drafts'?{jobs:[job],drafts:options.drafts??[draft]}:
   name==='sales_send_preview'?(options.preview??{revisionId:draft.id,revisionHash:draft.sha256,job:send}):
   name==='sales_read_workspace'?{workspaceUrl:'/projects/handlarborsen/sales'}:null
  return {data,error:name==='sales_send_preview'&&options.previewError?{code:'XX000'}:null}
 }}
 return {calls,client:client as never}
}
const read=(x:ReturnType<typeof fixture>)=>handleSalesTool('get_sales_reply_job',{projectId:id(1),jobId:id(8)},principal,id(3),x.client,()=>true)
describe('Atlas reads exact reply and saved send lineage',()=>{
 it('reports the approved draft and accepted send using the revision rather than the preparation ID',async()=>{
  const x=fixture(),result=await read(x)
  expect(result).toMatchObject({id:job.id,editorialStatus:'approved',draft,sendStatus:{known:true,job:send},sendingEnabled:false})
  expect(x.calls.find(c=>c.name==='sales_send_preview')?.args.p_input).toEqual({projectId:id(1),revisionId:draft.id})
  expect(x.calls.some(c=>/confirm|prepare|dispatch|complete|cancel/.test(c.name))).toBe(false)
 })
 it('distinguishes a checked absent send from unavailable send evidence',async()=>{
  const x=fixture({preview:{revisionId:draft.id,revisionHash:draft.sha256,job:null}})
  expect(await read(x)).toMatchObject({sendStatus:{known:true,job:null}})
 })
 it('does not select a foreign, historical or another-job draft',async()=>{
  const x=fixture({drafts:[{...draft,id:id(20),projectId:id(99)},{...draft,id:id(21),jobId:id(77)},{...draft,id:id(22),current:false}]})
  expect(await read(x)).toMatchObject({draft:null,sendStatus:{known:false,job:null}})
  expect(x.calls.some(c=>c.name==='sales_send_preview')).toBe(false)
 })
 it('keeps only the current requested reply text in the tool result',async()=>{
  const x=fixture({drafts:[{...draft,id:id(21),jobId:id(77),body:'OTHER PRIVATE BODY'},draft]})
  const result=await read(x)
  expect(JSON.stringify(result)).not.toContain('OTHER PRIVATE BODY')
  expect(result).toMatchObject({draft:{id:draft.id},sendStatus:{job:{id:send.id}}})
 })
 it('refuses conflicting current revisions instead of choosing one',async()=>{
  const x=fixture({drafts:[draft,{...draft,id:id(21)}]})
  expect(await read(x)).toMatchObject({code:'UNAVAILABLE'})
 })
 it('does not report no send when the saved status read fails',async()=>{
  const x=fixture({previewError:true})
  const result=await read(x)
  expect(result).toMatchObject({code:'UNAVAILABLE'})
  expect(result).not.toHaveProperty('sendStatus')
 })
 it('rejects a preview for a different revision or hash',async()=>{
  for(const preview of [{revisionId:id(88),revisionHash:draft.sha256,job:send},{revisionId:draft.id,revisionHash:'b'.repeat(64),job:send}]){
   expect(await read(fixture({preview}))).toMatchObject({code:'UNAVAILABLE'})
  }
 })
 it('checks trusted conversation before any reply or send data',async()=>{
  const x=fixture()
  expect(await handleSalesTool('get_sales_reply_job',{projectId:id(1),jobId:id(8)},principal,null,x.client,()=>true)).toMatchObject({code:'NOT_FOUND'})
  expect(x.calls).toHaveLength(0)
 })
})
