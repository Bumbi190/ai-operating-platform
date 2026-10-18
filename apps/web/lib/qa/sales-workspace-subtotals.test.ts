import {describe,it,expect,vi} from 'vitest'
import {handleSalesTool} from '@/lib/sales/atlas-tools'
const projectId='10000000-0000-4000-8000-000000000001'
const conversation='50000000-0000-4000-8000-000000000001'
const principal={userId:'20000000-0000-4000-8000-000000000001',allowedProjectIds:[projectId]}
const contact=(extra:Record<string,unknown>={})=>({history:'contacted',pilotMonths:6,confirmed:true,excluded:false,suppressed:true,email:'shared@example.se',...extra})
const workspace=(contacts:unknown)=>({projectId,state:'ok',contacts,offers:[],jobs:[],drafts:[],workspaceUrl:'/projects/handlarborsen/sales',sendingEnabled:false})
async function read(data:unknown){
 const rpc=vi.fn(async(name:string)=>({data:name==='sales_validate_conversation'?true:data,error:null}))
 return handleSalesTool('get_sales_workspace',{projectId},principal,conversation,{rpc} as never,()=>true)
}
describe('Atlas authoritative sales contact subtotals',()=>{
 it('keeps the real57-row history groups and pilot tiers distinct',async()=>{
  const contacts=[...Array.from({length:7},()=>contact({pilotMonths:12})),...Array.from({length:25},()=>contact()),...Array.from({length:25},()=>contact({history:'unknown'}))]
  expect(await read(workspace(contacts))).toMatchObject({contactCount:57,contactSummary:{
   historyCounts:{contacted:32,unknown:25,not_contacted:0,unclassified:0},
   pilotMonthCounts:{2:0,6:50,12:7,unclassified:0},suppressedCount:57,initialOutreachEligibleCount:0
  }})
 })
 it('counts separate branches sharing an email without parsing narrative delivery numbers',async()=>{
  const contacts=[contact({historySource:'25 sent,23 delivered,2 bounced; this text is not a contact.'}),contact({history:'unknown',pilotMonths:2})]
  expect(await read(workspace(contacts))).toMatchObject({contactCount:2,contactSummary:{
   historyCounts:{contacted:1,unknown:1,not_contacted:0,unclassified:0},
   pilotMonthCounts:{2:1,6:1,12:0,unclassified:0},suppressedCount:2,initialOutreachEligibleCount:0
  }})
 })
 it('recomputes stale summary fields from current rows',async()=>{
  expect(await read({...workspace([contact({history:'unknown',pilotMonths:2})]),contactSummary:{historyCounts:{contacted:500},suppressedCount:99}})).toMatchObject({contactSummary:{
   historyCounts:{contacted:0,unknown:1,not_contacted:0,unclassified:0},pilotMonthCounts:{2:1,6:0,12:0,unclassified:0},suppressedCount:1
  }})
 })
 it('reports successful empty groups as zero',async()=>{
  expect(await read(workspace([]))).toMatchObject({contactCount:0,contactSummary:{
   historyCounts:{contacted:0,unknown:0,not_contacted:0,unclassified:0},
   pilotMonthCounts:{2:0,6:0,12:0,unclassified:0},suppressedCount:0,initialOutreachEligibleCount:0
  }})
 })
 it('preserves unclassified history and pilot values without treating them as unknown or a real tier',async()=>{
  expect(await read(workspace([contact({history:'legacy',pilotMonths:3}),{companyName:'Missing fields'}]))).toMatchObject({contactSummary:{
   historyCounts:{contacted:0,unknown:0,not_contacted:0,unclassified:2},
   pilotMonthCounts:{2:0,6:0,12:0,unclassified:2},initialOutreachEligibleCount:0
  }})
 })
 it('counts only confirmed unsuppressed unexcluded new contacts as eligible',async()=>{
  const base={history:'not_contacted',suppressed:false}
  const contacts=[contact(base),contact({...base,confirmed:false}),contact({...base,excluded:true}),contact({...base,suppressed:true}),contact({...base,history:'unknown'}),contact({...base,history:'contacted'})]
  expect(await read(workspace(contacts))).toMatchObject({contactSummary:{historyCounts:{contacted:1,unknown:1,not_contacted:4,unclassified:0},suppressedCount:1,initialOutreachEligibleCount:1}})
 })
 it('does not return subtotals for an unavailable read',async()=>{
  const result=await read({...workspace([]),state:'unavailable'})
  expect(result).toMatchObject({code:'UNAVAILABLE'})
  expect(result).not.toHaveProperty('contactSummary')
 })
 it('does not return a partial summary when a row is malformed',async()=>{
  const result=await read(workspace([contact(),null]))
  expect(result).toMatchObject({code:'UNAVAILABLE'})
  expect(result).not.toHaveProperty('contactSummary')
 })
})
