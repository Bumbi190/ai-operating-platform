import {describe,it,expect,vi} from 'vitest'
import {SALES_TOOLS,handleSalesTool} from '@/lib/sales/atlas-tools'
const projectId='10000000-0000-4000-8000-000000000001',conversation='50000000-0000-4000-8000-000000000001'
const principal={userId:'20000000-0000-4000-8000-000000000001',allowedProjectIds:[projectId]}
describe('Atlas sales tools',()=>{
 it('exposes preparation and reads without send or approval',()=>expect(SALES_TOOLS.map(x=>x.name)).toEqual(['get_sales_workspace','prepare_sales_drafts','get_sales_connection_status','manage_sales_connection','prepare_strato_connection','get_strato_connection_status','get_sales_job','get_sales_inbox','get_sales_inbox_message','prepare_sales_reply','get_sales_reply_job']))
 it('requires an actual conversation before any database operation',async()=>{const rpc=vi.fn();expect(await handleSalesTool('get_sales_workspace',{projectId},principal,null,{rpc} as never,()=>true)).toMatchObject({code:'NOT_FOUND'});expect(rpc).not.toHaveBeenCalled()})
 it('refuses a foreign conversation before reading project sales data',async()=>{const rpc=vi.fn().mockResolvedValue({data:null,error:{code:'P0002'}});expect(await handleSalesTool('get_sales_workspace',{projectId},principal,conversation,{rpc} as never,()=>true)).toMatchObject({code:'NOT_FOUND'});expect(rpc).toHaveBeenCalledTimes(1)})
 it('returns the persisted project workspace URL',async()=>{const rpc=vi.fn().mockResolvedValueOnce({data:true,error:null}).mockResolvedValueOnce({data:{workspaceUrl:'/projects/handlarborsen/sales',sendingEnabled:false},error:null});expect(await handleSalesTool('get_sales_workspace',{projectId},principal,conversation,{rpc} as never,()=>true)).toMatchObject({workspaceUrl:'/projects/handlarborsen/sales',sendingEnabled:false})})
 it('does not touch database when feature is off',async()=>{const rpc=vi.fn();expect(await handleSalesTool('get_sales_workspace',{projectId},principal,conversation,{rpc} as never,()=>false)).toMatchObject({code:'NOT_FOUND'});expect(rpc).not.toHaveBeenCalled()})
 it('refuses model supplied recipient',async()=>{const rpc=vi.fn();const result=await handleSalesTool('prepare_sales_drafts',{projectId,toEmail:'victim@example.se'},principal,conversation,{rpc} as never,()=>true);expect(result).toMatchObject({code:'INVALID_BODY'});expect(rpc).not.toHaveBeenCalled()})
})
