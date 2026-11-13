import {describe,it,expect,vi} from 'vitest'
import {handleSalesTool} from '@/lib/sales/atlas-tools'

const projectId='10000000-0000-4000-8000-000000000001'
const conversation='50000000-0000-4000-8000-000000000001'
const principal={userId:'20000000-0000-4000-8000-000000000001',allowedProjectIds:[projectId]}
function setup(workspace:unknown,error:unknown=null){
 const rpc=vi.fn(async(name:string)=>name==='sales_validate_conversation'?{data:true,error:null}:{data:workspace,error})
 return {rpc,read:()=>handleSalesTool('get_sales_workspace',{projectId},principal,conversation,{rpc} as never,()=>true)}
}
const workspace=(contacts:unknown)=>({projectId,state:'ok',contacts,offers:[],jobs:[],drafts:[],workspaceUrl:'/projects/handlarborsen/sales',sendingEnabled:false})
const contacts=Array.from({length:7},(_,i)=>({id:'30000000-0000-4000-8000-'+String(i+1).padStart(12,'0'),companyName:'Dealer '+(i+1),branchName:'Branch '+(i+1),email:'shared@example.se',historySource:'A note mentions an additional dealer; this is not another contact row.',history:'contacted',suppressed:true}))

describe('Atlas saved sales contact counts',()=>{
 it('counts all seven saved branch rows even when they share an address',async()=>{
  const x=setup(workspace(contacts))
  expect(await x.read()).toMatchObject({contactCount:7,contacts,sendingEnabled:false})
  expect(x.rpc.mock.calls.map(c=>c[0])).toEqual(['sales_validate_conversation','sales_read_workspace'])
 })
 it('returns zero only for a successful empty register',async()=>{
  expect(await setup(workspace([])).read()).toMatchObject({contactCount:0,contacts:[]})
 })
 it('returns the current count after the saved rows change',async()=>{
  expect(await setup(workspace(contacts.slice(0,1))).read()).toMatchObject({contactCount:1})
 })
 it('recomputes a stale upstream count from the same returned rows',async()=>{
  expect(await setup({...workspace(contacts),contactCount:99}).read()).toMatchObject({contactCount:7})
 })
 it('does not present an unavailable register as zero contacts',async()=>{
  const result=await setup({...workspace([]),state:'unavailable'}).read()
  expect(result).toMatchObject({code:'UNAVAILABLE'})
  expect(result).not.toHaveProperty('contactCount')
 })
 it.each([undefined,null,{}])('does not turn malformed contacts %j into a count',async value=>{
  const result=await setup(workspace(value)).read()
  expect(result).toMatchObject({code:'UNAVAILABLE'})
  expect(result).not.toHaveProperty('contactCount')
 })
 it('preserves a failed read as failure without a count',async()=>{
  const result=await setup(null,{code:'P0002'}).read()
  expect(result).toMatchObject({code:'NOT_FOUND'})
  expect(result).not.toHaveProperty('contactCount')
 })
 it('does not read or count a project outside the allowed scope',async()=>{
  const x=setup(workspace(contacts))
  const result=await handleSalesTool('get_sales_workspace',{projectId}, {...principal,allowedProjectIds:[]},conversation,{rpc:x.rpc} as never,()=>true)
  expect(result).toMatchObject({code:'NOT_FOUND'})
  expect(x.rpc).not.toHaveBeenCalled()
 })
})
