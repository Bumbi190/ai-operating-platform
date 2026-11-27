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
const {presentGrowthDashboard: present}=await import(new URL('growth-dashboard-presentation.ts',base))
const uuid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0')
const scope={projectId:uuid(1),accountId:'acct',brand:'the-prompt'}
const H=3600000, now=1000*H
const row={projectId:scope.projectId,accountId:scope.accountId,postId:'secret-post',source:'caller_attested_provider_snapshot',publishedAtMs:now-48*H,observedAtMs:now,views:0,reach:100,saves:0,shares:2}
const run=(input,time=now)=>present(project([scope.projectId],scope,input,time))
const section=(v,title)=>v.sections.find(s=>s.title===title)
const value=(s,label)=>s.rows.find(r=>r.label===label)?.value
test('denial and missing inputs show no invented numbers',()=>{
  assert.equal(present(project([],scope,{},now)),null)
  const v=run({})
  assert.match(v.note,/inte oberoende verifierat/)
  assert.match(v.note,/Ingen publiceringsbehörighet/)
  assert.equal(v.sections.length,4)
  for(const s of v.sections){assert.equal(s.rows.length,0);assert.match(s.note,/Underlag saknas/)}
})
test('empty and older observations remain explicit, no source identity',()=>{
  assert.equal(value(section(run({observations:[]}), 'Analytics Engine'),'Inlägg i underlaget'),'0')
  const v=run({observations:[row]},now+8*24*H)
  const a=section(v,'Analytics Engine')
  assert.equal(value(a,'Äldre observationer'),'1')
  assert.match(a.note,/aktualitet bedöms separat/)
  assert.ok(!JSON.stringify(v).includes('secret-post'))
})
test('reference ideas retain limitations and do not imply rights or performance',()=>{
  const capture={projectId:scope.projectId,captureId:uuid(4),sourceId:uuid(5),sourceKind:'synthetic',durationMs:100,audioEvidence:'not_captured',frames:[{frameId:uuid(6),atMs:0}],caption:'secret-caption'}
  const v=run({reference:{capture,observations:[{frameId:uuid(6),feature:'high_contrast',evidence:'caller_attested_visual_review'}]}})
  const r=section(v,'Reference Intelligence')
  assert.match(r.note,/ljud saknas/)
  assert.match(r.note,/Rättigheter har inte bedömts/)
  assert.equal(value(r,'Testidé'),'Prova kontrast')
  assert.ok(!JSON.stringify(v).includes('secret-caption'))
})
test('unknown creative score remains missing, reported gate is qualified',()=>{
  const v=run({creative:{projectId:scope.projectId,revisionId:uuid(3),assessments:[],existingGate:'reported_pass'}})
  const q=section(v,'Growth Score')
  assert.match(value(q,'Rådgivande poäng'),/Saknas/)
  assert.match(value(q,'Uppgiven befintlig grind'),/ej verifierat/)
  assert.match(q.note,/inte verifierad faktakontroll/)
  assert.ok(!JSON.stringify(v).includes(uuid(3)))
})
test('descriptive rates keep local noncausal human review qualifier and zero',()=>{
  const experimentId='experiment'
  const labels=Array.from({length:6},(_,i)=>({...scope,experimentId,postId:'secret-'+i,variant:i<3?'A':'B',source:'caller_attested_manual_label'}))
  const snapshots=labels.map(l=>({...row,postId:l.postId}))
  const e=section(run({experiment:{experimentId,labels,snapshots}}),'Learning Engine')
  assert.match(e.note,/inte oberoende verifierade/)
  assert.match(e.note,/inte kausalitet/)
  assert.match(e.note,/mänsklig granskning krävs/)
  assert.equal(value(e,'A: sparningar / räckvidd').replace(/\s/g,''),'0%')
  assert.equal(value(e,'B: delningar / räckvidd').replace(/\s/g,''),'2%')
  assert.ok(!JSON.stringify(e).includes('secret-'))
  const missing=section(run({experiment:{experimentId,labels:[],snapshots:[]}}),'Learning Engine')
  assert.equal(value(missing,'Jämförelsetal'),'Saknas – ingen jämförelse')
  assert.equal(value(missing,'A: sparningar / räckvidd'),undefined)
})


test('presentation metadata preserves missing vs zero, coverage denominator and gate warnings',()=>{
  const empty=run({observations:[]})
  const e=section(empty,'Analytics Engine')
  assert.equal(e.rows.find(r=>r.label==='Jämförbar mätålder').bar,undefined)
  assert.equal(value(e,'Inlägg i underlaget'),'0')
  const a=section(run({observations:[row,{...row,postId:'cache',source:'cache_only'}]}),'Analytics Engine')
  assert.deepEqual(a.rows.find(r=>r.label==='Jämförbar mätålder').bar,{value:1,maximum:2,caption:'1 av 2 i underlaget'})
  assert.equal(a.rows.filter(r=>r.kind==='detail').length,3)
  const q=section(run({creative:{projectId:scope.projectId,revisionId:uuid(3),assessments:[],existingGate:'reported_block'}}),'Growth Score')
  assert.equal(q.rows.filter(r=>r.kind==='criterion').length,6)
  assert.equal(q.rows.find(r=>r.label==='Faktagranskningssignal').attention,true)
  assert.equal(q.rows.find(r=>r.label==='Uppgiven befintlig grind').attention,true)
})
test('all A/B bars share a zero-based scale including ratios above 100 percent and zero',()=>{
  const experimentId='exp-scale'
  const labels=Array.from({length:6},(_,i)=>({...scope,experimentId,postId:'scale-'+i,variant:i<3?'A':'B',source:'caller_attested_manual_label'}))
  const snapshots=labels.map((l,i)=>({...row,postId:l.postId,reach:10,saves:i<3?25:0,shares:1}))
  const l=section(run({experiment:{experimentId,labels,snapshots}}),'Learning Engine')
  assert.equal(l.rows.filter(r=>r.kind==='rate').length,4)
  assert.deepEqual(l.rows.filter(r=>r.kind==='rate').map(r=>r.bar),[
    {value:2.5,maximum:2.5},{value:0,maximum:2.5},{value:.1,maximum:2.5},{value:.1,maximum:2.5}
  ])
  assert.match(l.rateScale,/250\s*%/)
  assert.match(l.rateScale,/ingen målnivå/)
  const zero=section(run({experiment:{experimentId,labels,snapshots:snapshots.map(r=>({...r,saves:0,shares:0}))}}),'Learning Engine')
  assert.ok(zero.rows.filter(r=>r.kind==='rate').every(r=>r.bar.value===0&&r.bar.maximum===.01))
  const limited=section(run({experiment:{experimentId,labels,snapshots:snapshots.map((r,i)=>i? r:{...r,source:'cache_only'})}}),'Learning Engine')
  assert.equal(limited.rateScale,undefined)
  assert.equal(limited.rows.filter(r=>r.kind==='rate').length,0)
  assert.equal(limited.rows.find(r=>r.label==='Jämförelsetal').attention,true)
})