import {describe,it,expect} from 'vitest'
import {startApprovedWebsitePlan} from './store'
import {buildErrorResponse} from '../api'
const projectId='10000000-0000-4000-8000-000000000001'
const principal={userId:'20000000-0000-4000-8000-000000000001',allowedProjectIds:[projectId]}
const input={projectId,planId:'30000000-0000-4000-8000-000000000001',revisionId:'40000000-0000-4000-8000-000000000001',decisionId:'50000000-0000-4000-8000-000000000001',sha256:'a'.repeat(64)}
// A missing SQL-error mapping must not turn the operator's required budget choice into an outage.
describe('plan start budget refusal',()=>{
 it('returns an actionable conflict when SQL refuses a missing project budget',async()=>{
  const db={rpc:async()=>({data:null,error:{code:'55000',message:'PROJECT_BUDGET_REQUIRED'}})} as any
  await expect(startApprovedWebsitePlan(db,principal,input)).rejects.toMatchObject({code:'PROJECT_BUDGET_REQUIRED',status:409})
 })
 it('keeps an unknown database failure unavailable without returning private details',async()=>{
  const db={rpc:async()=>({data:null,error:{code:'XX000',message:'private-database-detail'}})} as any
  let error:unknown
  try{await startApprovedWebsitePlan(db,principal,input)}catch(value){error=value}
  const response=buildErrorResponse(error)
  expect(response.status).toBe(503)
  expect(await response.text()).not.toContain('private-database-detail')
 })
})
