import test from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

// Node 22 strip-types does not resolve extensionless TS imports; scope the
// test-only resolver to precisely the adapter's two local runtime imports.
const adapterUrl = new URL('../content-growth/manual-experiment-advisory.ts', import.meta.url).href
const hooks = registerHooks({
  resolve(specifier, context, nextResolve) {
    if (context.parentURL === adapterUrl &&
        ['./instagram-observation-quality', './instagram-experiments'].includes(specifier)) {
      return nextResolve(specifier + '.ts', context)
    }
    return nextResolve(specifier, context)
  },
})
const { assessManualInstagramExperiment: assess } = await import(adapterUrl)
hooks.deregister()
const H = 3600000
const now = 1000 * H
const scope = {projectId:'project-1', accountId:'account-1', brand:'the-prompt', experimentId:'exp-1'}
const fixture = () => {
  const labels = Array.from({length:6}, (_, i) => ({
    ...scope, postId:'post-'+i, variant:i<3?'A':'B', source:'caller_attested_manual_label'
  }))
  const snapshots = labels.map(({postId}, i) => ({
    projectId:scope.projectId, accountId:scope.accountId, postId,
    source:'caller_attested_provider_snapshot', publishedAtMs:now-48*H,
    observedAtMs:now, views:null, reach:i<3?100:200, saves:10, shares:i<3?2:4
  }))
  return {labels,snapshots}
}
test('reuses pooled descriptive rates with unordered roster; never grants execution',()=>{
  const {labels,snapshots}=fixture()
  const r=assess(scope,labels,snapshots.reverse(),now)
  assert.equal(r.review.status,'descriptive')
  assert.equal(r.review.aSaveRate,0.1)
  assert.equal(r.review.bSaveRate,0.05)
  assert.equal(r.review.aShareRate,0.02)
  assert.equal(r.review.bShareRate,0.02)
  assert.equal(r.eligibleCount,6)
  assert.equal(r.authorizesPublication,false)
  assert.equal(r.performancePrediction,false)
  assert.equal(r.requiresHumanReview,true)
  assert.equal(r.evidence,'caller_attested_not_independently_verified')
  assert.equal('winner' in r.review,false)
})
test('empty and uneven variants retain existing per-variant minimum',()=>{
  assert.equal(assess(scope,[],[],now).review.status,'insufficient')
  const {labels,snapshots}=fixture()
  labels[2].variant='B'
  assert.equal(assess(scope,labels,snapshots,now).review.status,'insufficient')
})
test('missing snapshots and unknown post cannot silently shrink roster',()=>{
  const {labels,snapshots}=fixture()
  assert.throws(()=>assess(scope,labels,snapshots.slice(1),now),/roster/)
  assert.throws(()=>assess(scope,labels,[...snapshots.slice(1),{...snapshots[0],postId:'other'}],now),/roster/)
})
test('duplicate snapshot or label fails closed',()=>{
  const {labels,snapshots}=fixture()
  assert.throws(()=>assess(scope,labels,[...snapshots.slice(1),snapshots[1]],now),/duplicate/i)
  assert.throws(()=>assess(scope,[...labels.slice(1),labels[1]],snapshots,now),/duplicate/i)
})
test('scope mismatches including brand and experiment are rejected',()=>{
  const {labels,snapshots}=fixture()
  for (const field of ['projectId','accountId','brand','experimentId']) {
    assert.throws(()=>assess(scope,[{...labels[0],[field]:'other'},...labels.slice(1)],snapshots,now),/label/)
  }
  for (const field of ['projectId','accountId']) {
    assert.throws(()=>assess(scope,labels,[{...snapshots[0],[field]:'other'},...snapshots.slice(1)],now),/scope/i)
  }
})
test('cache source, missing metric, zero reach and future timestamp withhold rates',()=>{
  const {labels,snapshots}=fixture()
  for (const patch of [{source:'cache_only'},{shares:null},{reach:0},{observedAtMs:now+1},{publishedAtMs:null}]) {
    const r=assess(scope,labels,[{...snapshots[0],...patch},...snapshots.slice(1)],now)
    assert.equal(r.review.status,'not_comparable')
    assert.equal(r.eligibleCount,5)
    assert.equal('aSaveRate' in r.review,false)
  }
})
test('inclusive 48â€“54 hours; reject just outside either edge',()=>{
  const {labels,snapshots}=fixture()
  for(const age of [48*H,54*H]) {
    assert.equal(assess(scope,labels,snapshots.map(r=>({...r,publishedAtMs:now-age})),now).review.status,'descriptive')
  }
  for(const age of [48*H-1,54*H+1]) {
    assert.equal(assess(scope,labels,[{...snapshots[0],publishedAtMs:now-age},...snapshots.slice(1)],now).review.status,'not_comparable')
  }
})
test('stale fixed-age evidence is historical, not current data',()=>{
  const {labels,snapshots}=fixture()
  const r=assess(scope,labels,snapshots,now+8*24*H)
  assert.equal(r.review.status,'descriptive')
  assert.deepEqual(r.freshness,{fresh:0,stale:6,unknown:0})
})
test('bad scope, labels, counts and evaluation clock fail',()=>{
  const {labels,snapshots}=fixture()
  assert.throws(()=>assess({...scope,brand:'other'},labels,snapshots,now),/scope/)
  for (const patch of [{variant:'C'},{source:'automatic'},{postId:'bad id'}]) {
    assert.throws(()=>assess(scope,[{...labels[0],...patch},...labels.slice(1)],snapshots,now),/label/)
  }
  assert.throws(()=>assess(scope,labels,[{...snapshots[0],saves:-1},...snapshots.slice(1)],now),/metric/)
  assert.throws(()=>assess(scope,labels,snapshots,NaN),/policy/)
})
test('reject oversized rosters and unsafe pooled counts',()=>{
  const {labels,snapshots}=fixture()
  assert.throws(()=>assess(scope,Array(201).fill(labels[0]),Array(201).fill(snapshots[0]),now),/roster/)
  assert.throws(()=>assess(scope,labels,snapshots.map(r=>({...r,reach:Number.MAX_SAFE_INTEGER})),now),/pooled/)
})
test('zero saves/shares are observed counts; inputs remain unchanged',()=>{
  const {labels,snapshots}=fixture()
  const rows=snapshots.map(r=>({...r,saves:0,shares:0}))
  const before=JSON.stringify([labels,rows])
  const r=assess(scope,labels,rows,now)
  assert.equal(r.review.status,'descriptive')
  assert.equal(r.review.aSaveRate,0)
  assert.equal(JSON.stringify([labels,rows]),before)
})
