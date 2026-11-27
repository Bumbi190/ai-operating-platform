import test from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
const base = new URL('../content-growth/', import.meta.url)
const entry = new URL('growth-dashboard-advisory.ts', base).href
const adapter = new URL('manual-experiment-advisory.ts', base).href
const local = new Set(['./instagram-observation-quality','./reference-format-observations','./creative-quality-advisory','./manual-experiment-advisory','./instagram-experiments'])
const hooks = registerHooks({resolve(specifier, context, nextResolve) {
  if ([entry,adapter].includes(context.parentURL) && local.has(specifier)) return nextResolve(specifier+'.ts',context)
  return nextResolve(specifier,context)
}})
const {projectGrowthDashboard: project}=await import(entry)
hooks.deregister()
const uuid = n => '00000000-0000-4000-8000-'+String(n).padStart(12,'0')
const scope = {projectId:uuid(1),accountId:'acct',brand:'the-prompt'}
const allowed = [scope.projectId]
const H=3600000, now=1000*H
const row = {projectId:scope.projectId,accountId:scope.accountId,postId:'post-secret',source:'caller_attested_provider_snapshot',publishedAtMs:now-48*H,observedAtMs:now,views:0,reach:0,saves:0,shares:0}
const run = input => project(allowed,scope,input,now)
test('denied project does not read payload',()=>{
  const payload={get observations(){throw Error('payload read')}}
  assert.equal(project([uuid(2)],scope,payload,now),null)
  assert.equal(project([],scope,payload,now),null)
})
test('missing sections are explicit not zero',()=>{
  const r=run({})
  for(const k of ['analytics','reference','quality','learning']) assert.deepEqual(r[k],{status:'not_supplied'})
  assert.equal(r.mode,'offline_advisory')
  assert.equal(r.authorizesPublication,false)
  assert.equal(r.predictsPerformance,false)
})
test('empty observation collection differs from missing',()=>{
  assert.equal(run({observations:[]}).analytics.totalPosts,0)
  assert.equal(run({observations:[row]}).analytics.viewsSample,1)
  assert.equal(run({observations:[row]}).analytics.engagementSample,0)
})
test('cache and stale evidence never described as verified live data',()=>{
  const a=run({observations:[{...row,source:'cache_only'}]}).analytics
  assert.equal(a.matchedAge,0)
  assert.equal(a.exclusions.unverifiedSource,1)
  const r=project(allowed,scope,{observations:[row]},now+8*24*H)
  assert.equal(r.analytics.freshness.stale,1)
  assert.equal(r.evidence,'caller_attested_not_independently_verified')
})
test('mixed project/account fails closed',()=>{
  for(const patch of [{projectId:uuid(2)},{accountId:'other'}])
    assert.throws(()=>run({observations:[{...row,...patch}]}),/scope/)
  assert.throws(()=>run({creative:{projectId:uuid(2),revisionId:uuid(3),assessments:[],existingGate:'unknown'}}),/scope/)
  assert.throws(()=>run({reference:{capture:{projectId:uuid(2)},observations:[]}}),/scope/)
})
test('quality with no assessed dimensions has no score',()=>{
  const r=run({creative:{projectId:scope.projectId,revisionId:uuid(3),assessments:[],existingGate:'unknown'}})
  assert.equal(r.quality.advisoryPoints,null)
  assert.equal(r.quality.factualReviewConcern,true)
  assert.equal(r.quality.assessedCount,0)
})
test('reference only returns categorized hypotheses and explicit limits',()=>{
  const capture={projectId:scope.projectId,captureId:uuid(4),sourceId:uuid(5),sourceKind:'synthetic',durationMs:100,audioEvidence:'not_captured',frames:[{frameId:uuid(6),atMs:0}],caption:'secret'}
  const r=run({reference:{capture,observations:[{frameId:uuid(6),feature:'high_contrast',evidence:'caller_attested_visual_review'}]}})
  assert.equal(r.reference.hypotheses.length,1)
  assert.equal(r.reference.rightsStatus,'not_assessed')
  assert.equal(r.reference.audioEvidence,'not_captured')
  assert.equal(JSON.stringify(r).includes('secret'),false)
  assert.equal(JSON.stringify(r).includes(uuid(6)),false)
})
test('learning insufficient and descriptive results remain advisory',()=>{
  const experimentId='experiment'
  const labels=Array.from({length:6},(_,i)=>({...scope,experimentId,postId:'secret-'+i,variant:i<3?'A':'B',source:'caller_attested_manual_label'}))
  const snapshots=labels.map(l=>({...row,postId:l.postId,reach:100,saves:2,shares:1}))
  assert.equal(run({experiment:{experimentId,labels:[],snapshots:[]}}).learning.rates,null)
  const r=run({experiment:{experimentId,labels,snapshots}})
  assert.equal(r.learning.comparisonStatus,'descriptive')
  assert.equal(r.learning.rates.aSaveRate,0.02)
  assert.equal('note' in r.learning,false)
  assert.equal(JSON.stringify(r).includes('secret-'),false)
  assert.equal(r.requiresHumanReview,true)
  assert.throws(()=>run({experiment:{experimentId,labels:[{...labels[0],brand:'familje-stunden'},...labels.slice(1)],snapshots}}),/label/)
})
test('malformed scope and oversized payload fail',()=>{
  assert.throws(()=>project(allowed,{...scope,brand:'other'},{},now),/scope/)
  assert.throws(()=>run({observations:Array(201).fill(row)}),/observations/)
  assert.throws(()=>project(allowed,scope,{},NaN),/scope/)
})
