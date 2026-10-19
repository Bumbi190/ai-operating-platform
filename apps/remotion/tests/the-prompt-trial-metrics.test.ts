import {test} from 'node:test'
import assert from 'node:assert/strict'
import {compareCreativeTrial,type TrialMeasurement} from '../../web/lib/media/the-prompt-trial-metrics'
const origin='2026-10-20T08:00:00.000Z'
const sampled=(hours:number,scriptId:string,variant:TrialMeasurement['variant'],views:number,
 extra:Partial<TrialMeasurement>={}):TrialMeasurement=>({
 scriptId,platform:'instagram',variant,
 publishedAt:origin,
 fetchedAt:new Date(Date.parse(origin)+hours*3600000).toISOString(),
 views,...extra,
})
test('empty history yields missing rather than zero-view claims',()=>{
 const r=compareCreativeTrial([])
 assert.equal(r.cohorts.length,12)
 assert(r.cohorts.every(c=>c.medianViews===null&&c.observedPosts===0))
})
test('only actually observed 24h / 72h buckets are compared',()=>{
 const r=compareCreativeTrial([
  sampled(24,'a','text_motion',23),
  sampled(72,'a','text_motion',90),
  sampled(27,'b','story_visual',30),
  sampled(41,'c','story_visual',777),
 ])
 const ig24=r.cohorts.filter(c=>c.platform==='instagram'&&c.targetHours===24)
 assert.equal(ig24.find(c=>c.variant==='text_motion')?.medianViews,23)
 assert.equal(ig24.find(c=>c.variant==='story_visual')?.medianViews,30)
 const ig72=r.cohorts.find(c=>c.platform==='instagram'&&c.targetHours===72&&c.variant==='text_motion')
 assert.equal(ig72?.medianViews,90)
 assert.equal(ig72?.observedPosts,1)
})
test('select nearest same-script snapshot, never sum cumulative views',()=>{
 const r=compareCreativeTrial([
  sampled(20.5,'a','text_motion',10),
  sampled(23.75,'a','text_motion',21),
  sampled(24.5,'a','text_motion',22),
  sampled(24.1,'b','text_motion',19),
 ])
 const ig=r.cohorts.find(c=>c.platform==='instagram'&&c.targetHours===24&&c.variant==='text_motion')!
 assert.equal(ig.observedPosts,2)
 assert.equal(ig.medianViews,20)
})
test('no cross-platform bleed and unknown engagement != zero',()=>{
 const r=compareCreativeTrial([
  sampled(24,'a','text_motion',11),
  sampled(24,'b','story_visual',30,{platform:'facebook',likes:2,shares:1}),
  sampled(24,'c','text_motion',45,{platform:'youtube',avgViewPct:65}),
 ])
 const ig=r.cohorts.find(c=>c.platform==='instagram'&&c.targetHours===24&&c.variant==='text_motion')!
 assert.equal(ig.medianInteractions,null)
 assert.equal(ig.medianAvgViewPct,null)
 const fb=r.cohorts.find(c=>c.platform==='facebook'&&c.targetHours===24&&c.variant==='story_visual')!
 assert.equal(fb.medianInteractions,3)
 const yt=r.cohorts.find(c=>c.platform==='youtube'&&c.targetHours===24&&c.variant==='text_motion')!
 assert.equal(yt.watchPctSampleSize,1)
 assert.equal(yt.medianAvgViewPct,65)
})
test('rejects invalid ages, unknown platform, missing views and variant switching',()=>{
 const r=compareCreativeTrial([
  sampled(24,'a','text_motion',10),
  sampled(25,'a','story_visual',18),
  sampled(-3,'b','text_motion',10),
  sampled(24,'c','text_motion',null as never),
  sampled(24,'d','text_motion',30,{platform:'tiktok' as any}),
 ])
 assert.equal(r.rejectedRows,4)
 const group=r.cohorts.find(c=>c.platform==='instagram'&&c.targetHours===24&&c.variant==='text_motion')
 assert.equal(group?.observedPosts,1)
})
test('declared time tolerance cannot silently expand beyond six hours',()=>{
 assert.throws(()=>compareCreativeTrial([],0))
 assert.throws(()=>compareCreativeTrial([],9))
})
