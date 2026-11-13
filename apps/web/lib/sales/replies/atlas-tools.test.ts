import {describe,it,expect} from 'vitest'
import {handleSalesTool,SALES_TOOL_NAMES,SALES_GUIDE} from '../atlas-tools'
const id=(n:number)=>`10000000-0000-4000-8000-${String(n).padStart(12,'0')}`,p={userId:id(2),allowedProjectIds:[id(1)]}
const input={projectId:id(1),messageId:id(4),messageVersion:1,contactId:id(5),contactVersion:1,offerRevisionId:id(6),idempotencyKey:id(7)}
function db(){const calls:any[]=[];return {calls,client:{rpc:async(n:string,a:unknown)=>{calls.push([n,a]);return {data:n==='sales_validate_conversation'?true:n==='sales_read_workspace'?{workspaceUrl:'/projects/handlarborsen/sales'}:{id:id(8),status:'queued'},error:null}}} as never}}
describe('Atlas reply requests',()=>{
 it('exposes separate draft-only tools without send, text selection or approval',()=>{expect(SALES_TOOL_NAMES).toContain('prepare_sales_reply');expect(SALES_TOOL_NAMES).toContain('get_sales_reply_job');expect(SALES_TOOL_NAMES.filter(n=>/send|approve|select_text/.test(n))).toEqual(['get_sales_send_status']);expect(SALES_GUIDE).toMatch(/prepare_sales_reply/);expect(SALES_GUIDE).not.toContain('Never claim B3 reply preparation or sending is available')})
 it('atlas_cannot_prepare_without_bound_conversation',async()=>{const x=db();expect(await handleSalesTool('prepare_sales_reply',input,p,null,x.client,()=>true)).toMatchObject({code:'NOT_FOUND'});expect(x.calls).toHaveLength(0)})
 it('injects trusted conversation rather than accepting a model-selected one',async()=>{const x=db();const r=await handleSalesTool('prepare_sales_reply',input,p,id(3),x.client,()=>true);expect(r).toMatchObject({status:'queued',sendingEnabled:false});expect(x.calls[0][0]).toBe('sales_validate_conversation');expect(x.calls.find(c=>c[0]==='sales_reply_prepare')[1].p_input).toEqual({...input,conversationId:id(3)});expect(await handleSalesTool('prepare_sales_reply',{...input,conversationId:id(9)},p,id(3),x.client,()=>true)).toMatchObject({code:'INVALID_BODY'})})
 it('refuses another project and raw recipient even in an owned conversation',async()=>{const x=db();expect(await handleSalesTool('prepare_sales_reply',{...input,projectId:id(9)},p,id(3),x.client,()=>true)).toMatchObject({code:'NOT_FOUND'});expect(await handleSalesTool('prepare_sales_reply',{...input,toEmail:'other@example.se'},p,id(3),x.client,()=>true)).toMatchObject({code:'INVALID_BODY'});expect(x.calls).toHaveLength(0)})
})

it('queues an explicit general reply in the trusted conversation without customer records',async()=>{
 const x=db(),general={projectId:id(1),messageId:id(4),messageVersion:1,idempotencyKey:id(7),replyMode:'general'}
 expect(await handleSalesTool('prepare_sales_reply',general,p,id(3),x.client,()=>true)).toMatchObject({status:'queued',sendingEnabled:false})
 expect(x.calls.find(c=>c[0]==='sales_reply_prepare')[1].p_input).toEqual({...general,conversationId:id(3)})
})
