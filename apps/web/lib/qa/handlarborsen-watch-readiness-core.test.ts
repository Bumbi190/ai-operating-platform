import { describe,expect,it } from 'vitest'
import { summarizeWatchBudget, deriveWatchReadiness, WATCH_PILOT_PROPOSAL } from '@/lib/atlas/project-analytics/handlarborsen-watch-readiness-core'
import { HANDLARBORSEN_PROJECT_ID as project } from '@/lib/atlas/collectors/handlarborsen-marketplace'
const row=(scope='project_monthly',overrides:Record<string,unknown>={})=>({
  project_id:project,scope,limit_sek:'100.0000',spent_sek:'20.0000',held_sek:'5.0000',remaining_sek:'75.0000',...overrides,
})
describe('non-executing competitor watch readiness',()=>{
  it('reports real missing scopes instead of treating global money as a project budget',()=>{
    expect(summarizeWatchBudget([row('global_daily')])).toBe('project_missing')
    expect(summarizeWatchBudget([row()])).toBe('global_missing')
    expect(summarizeWatchBudget([])).toBe('both_missing')
    expect(summarizeWatchBudget([row(),row('global_daily')])).toBe('available')
  })
  it('refuses exhausted headroom in any configured scope',()=>{
    for(const amount of ['0.0000','-1.0000'])expect(summarizeWatchBudget([
      row(),row('global_daily',{remaining_sek:amount}),
    ])).toBe('exhausted')
  })
  it.each([null,{},[row('project_monthly',{project_id:'foreign'})],[row(),row()],
    [row('global_anything')],[row('project_daily',{limit_sek:null})],
    [row('project_daily',{held_sek:false})],[row('project_daily',{spent_sek:-1})],
    [row('project_daily',{remaining_sek:'Infinity'})],
    Array.from({length:7},()=>row()),
  ])('keeps malformed or cross-project reads unknown',input=>{
    expect(summarizeWatchBudget(input)).toBe('unknown')
  })
  it('never turns even healthy prerequisites into execution authority',()=>{
    const report=deriveWatchReadiness({
      checkedAt:'2026-10-17T18:00:00.000Z',budget:'available',enforcement:'enforced',
      globalStop:'clear',projectStop:'clear',
    })
    expect(report.automaticActive).toBe(false)
    expect(report.executionAllowed).toBe(false)
    expect(report.stage).toBe('readiness_only')
    expect(report.pending).toEqual(['approved_sources','durable_run_control','verified_dispatch','activation_approval'])
  })
  it('cannot accept a forged activation field in a runtime object',()=>{
    expect(deriveWatchReadiness({checkedAt:'2026-10-17T18:00:00Z',budget:'available',enforcement:'enforced',globalStop:'clear',projectStop:'clear',executionAllowed:true,automaticActive:true,stage:'running'} as any)).toMatchObject({executionAllowed:false,automaticActive:false,stage:'readiness_only'})
  })
  it('keeps the first pilot a proposal with bounded HTTP and zero automatic retries',()=>{
    expect(WATCH_PILOT_PROPOSAL).toEqual({intervalDays:7,maxHttpRequests:10,maxAutomaticRetries:0,paidProviderCalls:0})
    expect(Object.isFrozen(WATCH_PILOT_PROPOSAL)).toBe(true)
  })
})
