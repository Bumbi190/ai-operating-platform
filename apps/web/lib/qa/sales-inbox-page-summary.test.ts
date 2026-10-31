import {describe,it,expect,vi} from 'vitest'
import {handleSalesTool} from '@/lib/sales/atlas-tools'
const projectId='10000000-0000-4000-8000-000000000001',mailboxId='70000000-0000-4000-8000-000000000001',conversationId='90000000-0000-4000-8000-000000000001'
const contactA='30000000-0000-4000-8000-000000000001',contactB='30000000-0000-4000-8000-000000000002'
const p={userId:'20000000-0000-4000-8000-000000000001',allowedProjectIds:[projectId]}
const message=(extra:Record<string,unknown>={})=>({contactId:null,contactState:'unlinked',textSelected:false,textState:'not_selected',...extra})
const linked=(id:string)=>message({contactId:id,contactState:'linked',textSelected:true,textState:'complete'})
const page=(messages:unknown,nextCursor:string|null=null)=>({messages,nextCursor,config:{state:'enabled'},inboxEnabled:true,readingEnabled:true,sendingEnabled:false})
async function read(saved:unknown,error:unknown=null){
 const rpc=vi.fn(async(name:string)=>name==='sales_validate_conversation'?{data:true,error:null}:{data:saved,error})
 return handleSalesTool('get_sales_inbox',{projectId,mailboxId},p,conversationId,{rpc} as never,()=>true)
}
describe('Atlas saved inbox page evidence',()=>{
 it('counts four linked messages as two confirmed contact rows in a seven-message page',async()=>{
  const rows=[linked(contactA),linked(contactA),linked(contactA),linked(contactB),message({textSelected:true,textState:'complete'}),message(),message()]
  expect(await read(page(rows))).toMatchObject({pageSummary:{scope:'returned_page_only',messageCount:7,linkedMessageCount:4,linkedContactCount:2,linkedContactIds:[contactA,contactB],unlinkedMessageCount:3,ambiguousMessageCount:0,selectedCompleteMessageCount:5,hasMore:false}})
 })
 it('keeps two branches sharing an email separate',async()=>{
  expect(await read(page([linked(contactA),linked(contactB)].map(m=>({...m,header:{from:'shared@example.se'}}))))).toMatchObject({pageSummary:{linkedContactCount:2,linkedMessageCount:2}})
 })
 it('does not count ambiguous correspondence as a confirmed contact link',async()=>{
  expect(await read(page([message({contactState:'ambiguous',textSelected:true,textState:'complete'})]))).toMatchObject({pageSummary:{linkedMessageCount:0,linkedContactCount:0,unlinkedMessageCount:0,ambiguousMessageCount:1,selectedCompleteMessageCount:1}})
 })
 it('labels a paginated summary as only the returned page',async()=>{
  expect(await read(page([linked(contactA)],'opaque-next'))).toMatchObject({nextCursor:'opaque-next',pageSummary:{scope:'returned_page_only',linkedContactCount:1,hasMore:true}})
 })
 it('does not treat a truncated or unselected body as selected complete text',async()=>{
  expect(await read(page([message({textSelected:true,textState:'truncated'}),message({textSelected:false,textState:'complete'}),message({textSelected:true,textState:'complete'})]))).toMatchObject({pageSummary:{selectedCompleteMessageCount:1}})
 })
 it('recomputes an upstream stale summary instead of returning invented reply totals',async()=>{
  expect(await read({...page([]),pageSummary:{linkedContactCount:5}})).toMatchObject({pageSummary:{messageCount:0,linkedMessageCount:0,linkedContactCount:0,linkedContactIds:[]}})
 })
 it.each([null,{},[null]])('does not return reply counts for malformed message data %j',async messages=>{
  const result=await read(page(messages))
  expect(result).toMatchObject({code:'UNAVAILABLE'})
  expect(result).not.toHaveProperty('pageSummary')
 })
 it('preserves failed reads without a zero response count',async()=>{
  const result=await read(null,{code:'P0002'})
  expect(result).toMatchObject({code:'NOT_FOUND'})
  expect(result).not.toHaveProperty('pageSummary')
 })
})
