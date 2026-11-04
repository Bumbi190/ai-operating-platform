import test from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
registerHooks({resolve(specifier,context,next){
  if(specifier==='server-only')return {url:'data:text/javascript,export {}',shortCircuit:true}
  if(specifier==='./posthog-approved-read')return {url:'data:text/javascript,'+encodeURIComponent(`
    export async function prepareApprovedPosthogRead(input){
      const f=globalThis.__phRequest;f.prepared.push(input);
      if(f.denial)throw Error(f.denial);return f.proposal
    }`),shortCircuit:true}
  if(specifier==='../authorization/principal-write')return {url:'data:text/javascript,'+encodeURIComponent(`
    export async function requestAuthorization(input){globalThis.__phRequest.writes.push(input);return globalThis.__phRequest.result}
  `),shortCircuit:true}
  return next(specifier,context)
}})
const {requestPosthogAuthorization}=await import('../atlas/capability/posthog-authorization.ts')
test.beforeEach(()=>{globalThis.__phRequest={
  proposal:{enabled:true,projectId:'owned',actionKind:'analytics.posthog.dashboards.read',
    target:{targetType:'posthog_dashboard_read',targetId:'owned',versionHash:'hash'},
    payload:{operation:'list_dashboards',posthogProjectId:245437,limit:10}},
  prepared:[],writes:[],result:{status:'ok',state:{status:'pending',authorizationId:'request-1'}}
}})
test('only canonical pending request is created from server-derived scope',async()=>{
  const result=await requestPosthogAuthorization({projectId:'owned',expectedVersionHash:'hash'})
  const f=globalThis.__phRequest
  assert.equal(result.authorizationId,'request-1')
  assert.equal(f.writes.length,1)
  assert.deepEqual(f.writes[0].target,f.proposal.target)
  assert.deepEqual(f.writes[0].targetPayload,f.proposal.payload)
  assert.equal(f.writes[0].authority.actionKind,'analytics.posthog.dashboards.read')
  assert.ok(!('principalId' in f.writes[0]))
})
test('stale hash and disabled capability cannot create a request',async()=>{
  await assert.rejects(requestPosthogAuthorization({projectId:'owned',expectedVersionHash:'old'}),/posthog_review_stale/)
  globalThis.__phRequest.proposal.enabled=false
  await assert.rejects(requestPosthogAuthorization({projectId:'owned',expectedVersionHash:'hash'}),/posthog_approved_read_disabled/)
  assert.equal(globalThis.__phRequest.writes.length,0)
})
test('untrusted authority and execution fields are rejected',async()=>{
  for(const key of ['target','principalId','actionKind','approved','store','now','authorizationId']){
    await assert.rejects(requestPosthogAuthorization({projectId:'owned',expectedVersionHash:'hash',[key]:'forged'}),/posthog_invalid_request/)
  }
  assert.equal(globalThis.__phRequest.writes.length,0)
})
test('owner/authentication denials cannot write',async()=>{
  globalThis.__phRequest.denial='posthog_project_forbidden'
  await assert.rejects(requestPosthogAuthorization({projectId:'other',expectedVersionHash:'hash'}),/posthog_project_forbidden/)
  assert.equal(globalThis.__phRequest.writes.length,0)
})
test('storage failure and unexpected granted state never report request success',async()=>{
  for(const result of [{status:'unavailable',state:null},{status:'ok',state:{status:'granted',authorizationId:'bad'}}]){
    globalThis.__phRequest.result=result
    await assert.rejects(requestPosthogAuthorization({projectId:'owned',expectedVersionHash:'hash'}),/posthog_authorization_request_failed/)
  }
})
