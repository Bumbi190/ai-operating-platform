import {describe,it,expect,vi} from 'vitest'
import {prepareSalesDrafts,readSalesWorkspace,readSalesJob} from '@/lib/sales/store'
const project='10000000-0000-4000-8000-000000000001',user='20000000-0000-4000-8000-000000000001'
const input={projectId:project,conversationId:'50000000-0000-4000-8000-000000000001',contactIds:['30000000-0000-4000-8000-000000000001'],offerRevisionId:'40000000-0000-4000-8000-000000000001',idempotencyKey:'one'}
describe('sales store boundary',()=>{
 it('denies a foreign project before a service-role RPC',async()=>{const rpc=vi.fn();await expect(prepareSalesDrafts({rpc} as never,{userId:user,allowedProjectIds:[]},input)).rejects.toThrow('NOT_FOUND');expect(rpc).not.toHaveBeenCalled()})
 it('does not present a failed read as an empty successful workspace',async()=>{const rpc=vi.fn().mockResolvedValue({data:null,error:{message:'connection unavailable'}});await expect(readSalesWorkspace({rpc} as never,{userId:user,allowedProjectIds:[project]},project)).rejects.toThrow('UNAVAILABLE')})
 it('does not leak raw database errors',async()=>{const rpc=vi.fn().mockResolvedValue({data:null,error:{message:'SECRET raw query'}});await expect(readSalesJob({rpc} as never,{userId:user,allowedProjectIds:[project]},{projectId:project,jobId:input.conversationId})).rejects.toThrow('UNAVAILABLE')})
 it('returns canonical job receipt rather than inventing execution',async()=>{const job={id:input.conversationId,projectId:project,status:'queued',createdAt:'2026-10-17T10:00:00Z',attempts:0,detail:null};const rpc=vi.fn().mockResolvedValue({data:job,error:null});expect(await prepareSalesDrafts({rpc} as never,{userId:user,allowedProjectIds:[project]},input)).toEqual(job)})
})
