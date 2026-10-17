import {describe,it,expect,vi} from 'vitest'
import {SALES_TOOLS,SALES_GUIDE,handleSalesTool} from '@/lib/sales/atlas-tools'
const projectId='10000000-0000-4000-8000-000000000001',mailboxId='70000000-0000-4000-8000-000000000001',messageId='80000000-0000-4000-8000-000000000001',conversationId='90000000-0000-4000-8000-000000000001',p={userId:mailboxId,allowedProjectIds:[projectId]}
describe('Atlas durable inbox evidence only',()=>{
 it('exposes exactly two new read capabilities',()=>{expect(SALES_TOOLS.map(t=>t.name).filter(n=>n.includes('inbox'))).toEqual(['get_sales_inbox','get_sales_inbox_message']);expect(SALES_GUIDE).toContain('untrusted');expect(SALES_GUIDE).toContain('B3')})
 it.each(['configure_sales_inbox','select_sales_inbox_text','link_sales_inbox_message'])('cannot modify through model tool %s',async name=>{const rpc=vi.fn();expect(await handleSalesTool(name,{projectId,mailboxId},p,conversationId,{rpc} as never,()=>true)).toMatchObject({code:'INVALID_BODY'});expect(rpc).not.toHaveBeenCalled()})
 it('validates conversation before saved message and labels source and missing text',async()=>{const rpc=vi.fn().mockResolvedValueOnce({data:true,error:null}).mockResolvedValueOnce({data:{id:messageId,text:null,textState:'not_selected',internalDate:'2026-10-10T12:00:00Z'},error:null});const result=await handleSalesTool('get_sales_inbox_message',{projectId,messageId},p,conversationId,{rpc} as never,()=>true);expect(rpc.mock.calls.map(x=>x[0])).toEqual(['sales_validate_conversation','sales_inbox_read_message']);expect(result).toMatchObject({source:{kind:'saved_sales_inbox',messageId},sendingEnabled:false,missingText:true})})
 it('foreign conversation never reads body',async()=>{const rpc=vi.fn().mockResolvedValue({data:null,error:{code:'P0002'}});expect(await handleSalesTool('get_sales_inbox_message',{projectId,messageId},p,conversationId,{rpc} as never,()=>true)).toMatchObject({code:'NOT_FOUND'});expect(rpc).toHaveBeenCalledTimes(1)})
 it('rejects injected operation alongside read arguments',async()=>{const rpc=vi.fn();expect(await handleSalesTool('get_sales_inbox',{projectId,mailboxId,operation:'select_text'},p,conversationId,{rpc} as never,()=>true)).toMatchObject({code:'INVALID_BODY'});expect(rpc).not.toHaveBeenCalled()})
})
it('distinguishes saved enabled config from fenced current reading permission',async()=>{
 const rpc=vi.fn().mockResolvedValueOnce({data:true,error:null}).mockResolvedValueOnce({data:{config:{state:'enabled',mailboxGeneration:6},messages:[],nextCursor:null,inboxEnabled:false,readingEnabled:false,scopeCurrent:false,reasonCode:'SCOPE_RECONFIRMATION_REQUIRED',sendingEnabled:false},error:null})
 expect(await handleSalesTool('get_sales_inbox',{projectId,mailboxId},p,conversationId,{rpc} as never,()=>true)).toMatchObject({inboxEnabled:false,readingEnabled:false,scopeCurrent:false,reasonCode:'SCOPE_RECONFIRMATION_REQUIRED'})
 expect(SALES_GUIDE).toContain('scope reconfirmation')
})
