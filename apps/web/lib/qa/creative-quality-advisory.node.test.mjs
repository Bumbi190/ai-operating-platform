import { test } from 'node:test'
import assert from 'node:assert/strict'
import { assessCreativeQuality as assess, CREATIVE_CRITERIA } from '../content-growth/creative-quality-advisory.ts'
const scope = { projectId: '11111111-1111-4111-8111-111111111111', revisionId: '22222222-2222-4222-8222-222222222222' }
const other = '33333333-3333-4333-8333-333333333333'
const row = (criterion, rating='meets') => ({ ...scope, criterion, rating, evidence: rating==='unknown' ? null : CREATIVE_CRITERIA[criterion].evidence })
const all = () => Object.keys(CREATIVE_CRITERIA).map(k=>row(k))
const input = (assessments=[], existingGate='unknown') => ({...scope, assessments, existingGate})
test('empty evidence stays unknown, no aggregate',()=>{const r=assess(scope,input()); assert.equal(r.advisoryPoints,null); assert.equal(r.assessedCount,0); assert.ok(r.criteria.every(c=>c.points===null)); assert.equal(r.factualReviewConcern,true)})
test('complete equal-weight rubric is descriptive only',()=>{const r=assess(scope,input(all(),'reported_pass')); assert.equal(r.advisoryPoints,12); assert.equal(r.assessedCount,6); assert.equal(r.maximumPoints,12); assert.equal(r.authorizesPublication,false); assert.equal(r.predictsPerformance,false)})
test('rating scales distinguish zero from unknown',()=>{const a=all();a[0]=row('hook','needs_work');a[1]=row('clarity','partial');const r=assess(scope,input(a));assert.equal(r.advisoryPoints,9);assert.equal(r.criteria[0].points,0);assert.equal(r.criteria[1].points,1)})
test('partial coverage cannot produce total',()=>{const r=assess(scope,input([row('hook'),row('clarity','unknown')]));assert.equal(r.advisoryPoints,null);assert.equal(r.assessedCount,1)})
test('existing gate block remains visible even at maximum points',()=>{const r=assess(scope,input(all(),'reported_block'));assert.equal(r.advisoryPoints,12);assert.equal(r.factualReviewConcern,true);assert.equal(r.reportedExistingGate,'reported_block');assert.equal(r.authorizesPublication,false)})
test('source concern cannot be overridden by reported existing pass',()=>{const a=all().map(x=>x.criterion==='source_support'?row('source_support','partial'):x);assert.equal(assess(scope,input(a,'reported_pass')).factualReviewConcern,true)})
test('planned visual is not rendered readability evidence',()=>{assert.throws(()=>assess(scope,input([{...row('visual_readability'),evidence:'script_review'}])),/Wrong evidence/)})
test('source claim needs source review, unknown cannot attest evidence',()=>{assert.throws(()=>assess(scope,input([{...row('source_support'),evidence:null}])),/Wrong evidence/);assert.throws(()=>assess(scope,input([{...row('hook','unknown'),evidence:'opening_review'}])),/Wrong evidence/)})
test('cross-project or revision rejected on input and rows',()=>{for(const key of ['projectId','revisionId']){assert.throws(()=>assess(scope,{...input(),[key]:other}),/scope/);assert.throws(()=>assess(scope,input([{...row('hook'),[key]:other}])),/scope/)}})
test('invalid scope and null records rejected',()=>{assert.throws(()=>assess({...scope,revisionId:'source text'},input()),/scope/);assert.throws(()=>assess(scope,null),/scope/);assert.throws(()=>assess(scope,input([null])),/scope/)})
test('unknown or inherited criteria and duplicates rejected',()=>{for(const criterion of ['toString','__proto__',3])assert.throws(()=>assess(scope,input([{...row('hook'),criterion}])),/criterion/);assert.throws(()=>assess(scope,input([row('hook'),row('hook')])),/criterion/)})
test('invalid ratings, gate labels and collections rejected',()=>{assert.throws(()=>assess(scope,input([{...row('hook'),rating:'excellent'}])),/rating/);assert.throws(()=>assess(scope,input([],'pass')),/gate/);assert.throws(()=>assess(scope,input(null)),/collection/);assert.throws(()=>assess(scope,input([...all(),row('hook')])),/collection/)})
test('output is fixed vocabulary; extra free text is not echoed',()=>{const a={...row('hook'),note:'private caption'};const r=assess(scope,{...input([a]),text:'private caption'});assert.ok(!JSON.stringify(r).includes('private caption'));assert.equal(r.evidenceTrust,'caller_attested')})
test('assessment does not mutate input',()=>{const a=Object.freeze([Object.freeze(row('hook'))]);assert.equal(assess(scope,Object.freeze(input(a))).assessedCount,1)})
test('nested criterion vocabulary cannot be mutated at runtime',()=>{
  assert.ok(Object.values(CREATIVE_CRITERIA).every(Object.isFrozen))
  assert.throws(()=>{CREATIVE_CRITERIA.source_support.evidence='script_review'},TypeError)
  assert.throws(()=>{CREATIVE_CRITERIA.source_support.check='invent proof'},TypeError)
  assert.throws(()=>assess(scope,input([{...row('source_support'),evidence:'script_review'}])),/Wrong evidence/)
  assert.equal(assess(scope,input(all(),'reported_pass')).factualReviewConcern,false)
})
test('top level criterion vocabulary cannot add replace or delete keys',()=>{
  assert.ok(Object.isFrozen(CREATIVE_CRITERIA))
  assert.throws(()=>{CREATIVE_CRITERIA.extra=CREATIVE_CRITERIA.hook},TypeError)
  assert.throws(()=>{CREATIVE_CRITERIA.hook=CREATIVE_CRITERIA.clarity},TypeError)
  assert.throws(()=>{delete CREATIVE_CRITERIA.source_support},TypeError)
  assert.equal(assess(scope,input(all())).totalCriteria,6)
  assert.equal(assess(scope,input(all())).advisoryPoints,12)
})
