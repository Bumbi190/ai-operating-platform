import {describe,it,expect} from 'vitest'
import {randomUUID} from 'node:crypto'
import {createStudioFixture} from './test-fixture'
import {testSql} from '../test-db'
import {ensureStudioWorkspace} from './store'
import {setStudioProjectBudget} from './budget'
import {resolveStudioTurnContext} from './turn-context'

describe('explicit studio budgets and billable project identity',()=>{
 it('requires a budget for the exact owned studio conversation and keeps replay idempotent',async()=>{
  const f=createStudioFixture(),a=await ensureStudioWorkspace(f.db,f.owner,{kind:'new',name:'Ny sida',idempotencyKey:randomUUID()})
  const p={...f.owner,allowedProjectIds:[...f.owner.allowedProjectIds,a.projectId]},context={projectId:a.projectId,conversationId:a.conversationId}
  await expect(resolveStudioTurnContext(f.db,p,a.conversationId,context)).rejects.toMatchObject({code:'PROJECT_BUDGET_REQUIRED',status:409})
  const input={projectId:a.projectId,monthlySek:250,expectedMonthlySek:null,idempotencyKey:randomUUID()}
  expect(await setStudioProjectBudget(f.db,p,input)).toMatchObject({projectId:a.projectId,monthlySek:250})
  expect(await setStudioProjectBudget(f.db,p,input)).toMatchObject({projectId:a.projectId,monthlySek:250})
  expect(testSql(`select count(*) from website_build_studio_budget_events where project_id='${a.projectId}';`)).toBe('1')
  expect(await resolveStudioTurnContext(f.db,p,a.conversationId,context)).toMatchObject({projectId:a.projectId,conversationId:a.conversationId})
 })
 it('uses a compare-and-set and preserves daily/weekly limits instead of overwriting later decisions',async()=>{
  const f=createStudioFixture();testSql(`alter table project_budgets add column if not exists daily_sek numeric,add column if not exists weekly_sek numeric,add column if not exists updated_at timestamptz default now();insert into project_budgets(project_id,monthly_sek,daily_sek,weekly_sek) values('${f.projectId}',100,10,30);`)
  const input={projectId:f.projectId,monthlySek:200,expectedMonthlySek:100,idempotencyKey:randomUUID()}
  await setStudioProjectBudget(f.db,f.owner,input)
  await expect(setStudioProjectBudget(f.db,f.owner,{...input,monthlySek:300,idempotencyKey:randomUUID()})).rejects.toMatchObject({code:'CONFLICT'})
  expect(testSql(`select jsonb_build_array(monthly_sek,daily_sek,weekly_sek) from project_budgets where project_id='${f.projectId}';`)).toBe('[200, 10, 30]')
  await expect(setStudioProjectBudget(f.db,f.owner,{...input,monthlySek:400})).rejects.toMatchObject({code:'CONFLICT'})
 })
 it('refuses foreign owners, unbounded numbers and mutated routing hints',async()=>{
  const f=createStudioFixture(),base={projectId:f.projectId,monthlySek:100,expectedMonthlySek:null,idempotencyKey:randomUUID()}
  await expect(setStudioProjectBudget(f.db,{...f.foreign,allowedProjectIds:[f.projectId]},base)).rejects.toMatchObject({code:'NOT_FOUND'})
  for(const monthlySek of [-1,Infinity,NaN,1000001,0.001])await expect(setStudioProjectBudget(f.db,f.owner,{...base,monthlySek})).rejects.toMatchObject({status:400})
  await expect(resolveStudioTurnContext(f.db,f.owner,randomUUID(),{projectId:f.otherProjectId,conversationId:randomUUID()})).rejects.toMatchObject({code:'NOT_FOUND'})
  await expect(resolveStudioTurnContext(f.db,f.owner,randomUUID(),{projectId:f.projectId,conversationId:randomUUID(),approved:true})).rejects.toMatchObject({status:400})
 })
 it('opens a verified historical conversation in the same owned studio project',async()=>{
  const f=createStudioFixture(),conversationId=randomUUID()
  testSql(`insert into conversations(id,user_id,project_id,title) values('${conversationId}','${f.owner.userId}','${f.projectId}','Tidigare bygge');insert into project_budgets(project_id,monthly_sek) values('${f.projectId}',100);`)
  expect(await resolveStudioTurnContext(f.db,f.owner,conversationId,{projectId:f.projectId,conversationId})).toEqual({projectId:f.projectId,conversationId})
  await expect(resolveStudioTurnContext(f.db,f.owner,conversationId,{projectId:f.otherProjectId,conversationId})).rejects.toMatchObject({code:'NOT_FOUND'})
 })
 it('never exposes audit mutations or budget setters to browser database roles',async()=>{
  const f=createStudioFixture();await setStudioProjectBudget(f.db,f.owner,{projectId:f.projectId,monthlySek:20,expectedMonthlySek:null,idempotencyKey:randomUUID()})
  expect(testSql("select has_function_privilege('authenticated','website_build_studio_budget_set(jsonb,jsonb)','execute') or has_function_privilege('anon','website_build_studio_budget_set(jsonb,jsonb)','execute') or has_table_privilege('service_role','website_build_studio_budget_events','update');")).toBe('f')
 })
})
