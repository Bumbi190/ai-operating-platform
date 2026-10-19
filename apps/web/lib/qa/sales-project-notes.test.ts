import {describe,it,expect,vi} from 'vitest'
import {handleSalesTool} from '@/lib/sales/atlas-tools'

const projectId='10000000-0000-4000-8000-000000000001'
const other='10000000-0000-4000-8000-000000000002'
const conversation='50000000-0000-4000-8000-000000000001'
const principal={userId:'20000000-0000-4000-8000-000000000001',allowedProjectIds:[projectId]}
const noteKey='dealer.sales.correspondence_20261019'
const body='Ett redan skickat svar med 12 månaders pilot. '+ 'Återkoppling är viktig. '.repeat(30)
const row={id:'60000000-0000-4000-8000-000000000001',project_id:projectId,key:noteKey,value:JSON.stringify({outgoing:{body},offer:{months:12},status:'interested_owner_replied_waiting'}),source:'owner-report',updated_at:'2026-10-19T11:11:14Z'}

function setup(rows:Record<string,unknown>[]=[row],options:{foreignConversation?:boolean;readError?:boolean}={}){
 let reads=0
 const rpc=vi.fn(async(name:string)=>name==='sales_validate_conversation'
  ? {data:options.foreignConversation?null:true,error:options.foreignConversation?{code:'P0002'}:null}
  : {data:null,error:{code:'P0002'}})
 const db={rpc,from(table:string){
  if(table!=='memories')throw Error('Unexpected table')
  reads++
  let filtered=rows
  const query={select(columns:string){if(columns!=='id,key,value,source,updated_at')throw Error('Unexpected columns');return query},
   eq(key:string,value:unknown){filtered=filtered.filter(r=>r[key]===value);return query},
   async maybeSingle(){return {data:filtered[0]??null,error:options.readError?{code:'unavailable'}:null}}}
  return query
 }}
 const run=(input:Record<string,unknown>={projectId,noteKey},p=principal,c:string|null=conversation,enabled=true)=>handleSalesTool('get_sales_project_note',input,p,c,db as never,()=>enabled)
 return {run,rpc,reads:()=>reads}
}

describe('complete read-only sales project notes',()=>{
 it('returns the entire saved reply beyond the list-preview limit with its provenance',async()=>{
  const {run}=setup();const result=await run() as {note:{value:string;key:string;source:string};contentTruncated:boolean;customerSendingEnabled:boolean}
  expect(result.note?.value).toBe(row.value)
  expect(JSON.parse(result.note.value).outgoing.body).toBe(body)
  expect(result.note.key).toBe(noteKey)
  expect(result.note.source).toBe('owner-report')
  expect(result.contentTruncated).toBe(false)
  expect(result.customerSendingEnabled).toBe(false)
 })
 it('keeps an individual twelve-month offer separate from a six-month template note',async()=>{
  const template={...row,id:other,key:'dealer.sales.template',value:JSON.stringify({recipient:null,pilotMonths:6})}
  const {run}=setup([template,row]);const result=await run() as {note:{value:string}}
  expect(JSON.parse(result.note?.value??'{}').offer?.months).toBe(12)
 })
 it('only returns the requested project even when a foreign row has the same key',async()=>{
  const {run}=setup([{...row,project_id:other,value:'foreign private note'},row])
  expect(await run()).toMatchObject({note:{id:row.id,value:row.value}})
 })
 it('returns the complete exact-version review rather than treating draft flags as its verdict',async()=>{
  const review={...row,key:'dealer.sales.text_review',value:JSON.stringify({status:'owner_reviewed_text_only',revisions:[{id:other,version:1,snapshot:{body,ownerTextReviewed:false}}],sendApproval:false})}
  const {run}=setup([review]);const result=await run({projectId,noteKey:review.key}) as {note:{value:string}}
  expect(JSON.parse(result.note?.value??'{}')).toEqual(JSON.parse(review.value))
 })
 it.each([null,'not-a-uuid'])('rejects an absent or invalid conversation %s before reading a note',async c=>{
  const {run,reads}=setup();expect(await run({projectId,noteKey},principal,c)).toHaveProperty('code');expect(reads()).toBe(0)
 })
 it('rejects a conversation belonging to a different project before reading a note',async()=>{
  const {run,reads}=setup([row],{foreignConversation:true});expect(await run()).toMatchObject({code:'NOT_FOUND'});expect(reads()).toBe(0)
 })
 it('rejects a foreign project before querying the database',async()=>{
  const {run,rpc,reads}=setup();expect(await run({projectId:other,noteKey})).toMatchObject({code:'NOT_FOUND'});expect(rpc).not.toHaveBeenCalled();expect(reads()).toBe(0)
 })
 it('does not read when the sales feature is disabled',async()=>{
  const {run,reads}=setup();expect(await run({projectId,noteKey},principal,conversation,false)).toMatchObject({code:'NOT_FOUND'});expect(reads()).toBe(0)
 })
 it.each(['platform.secret','dealer.strato.credentials','dealer.sales.','dealer.sales.\nsecret','x'.repeat(201)])('rejects out-of-scope or malformed note key %s',async key=>{
  const {run,reads}=setup();expect(await run({projectId,noteKey:key})).toMatchObject({code:'INVALID_BODY'});expect(reads()).toBe(0)
 })
 it.each([{recipient:'someone@example.se'},{send:true},{approved:true},{scheduledAt:'2026-11-01'},{userId:other}])('rejects authority or transport injection %j',async extra=>{
  const {run,reads}=setup();expect(await run({projectId,noteKey,...extra})).toMatchObject({code:'INVALID_BODY'});expect(reads()).toBe(0)
 })
 it('reports a missing note without pretending that a reply or approval is absent',async()=>{
  const {run}=setup([]);expect(await run()).toMatchObject({code:'NOT_FOUND'})
 })
 it('fails closed on a database error',async()=>{
  const {run}=setup([row],{readError:true});expect(await run()).toMatchObject({code:'UNAVAILABLE'})
 })
 it('does not return a silently shortened oversized note',async()=>{
  const {run}=setup([{...row,value:'x'.repeat(65537)}]);expect(await run()).toMatchObject({code:'UNAVAILABLE'})
 })
 it('rejects non-text note content',async()=>{
  const {run}=setup([{...row,value:null}]);expect(await run()).toMatchObject({code:'UNAVAILABLE'})
 })
})
