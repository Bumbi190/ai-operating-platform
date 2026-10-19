import {test} from 'node:test'
import assert from 'node:assert/strict'
import {evaluateHistoricalPosts,type PostEvidenceRow} from '../src/lib/editorial-evidence'

const begin='2026-10-01T00:00:00Z'
const timestamp=(hours:number)=>new Date(Date.parse(begin)+hours*3_600_000).toISOString()
const row=(i:number,platform:PostEvidenceRow['platform']='instagram',
  hours=40,topic='coding',views=10,options:Partial<PostEvidenceRow>={}):PostEvidenceRow=>({
  scriptId:'script-'+i,platform,topic,hook:'Real productivity tool',
  publishedAt:begin,fetchedAt:timestamp(hours),views,...options,
})

test('never compares raw views across platform or snapshot age buckets',()=>{
  const results=evaluateHistoricalPosts([
    row(1,'instagram',16,'coding',10),
    row(2,'instagram',25,'coding',20),
    row(3,'instagram',75,'coding',30),
    row(4,'facebook',25,'coding',400),
    row(5,'youtube',25,'coding',40),
  ])
  assert.equal(results.uniquePosts,5)
  assert.equal(results.groups.length,5)
  const ig=results.groups.filter(g=>g.platform==='instagram')
  assert.deepEqual(ig.map(g=>g.age),['0-24h','24-72h','3-7d'])
  assert.ok(results.groups.every(g=>g.reliability==='exploratory'))
})

test('picks the newest true snapshot of a post instead of adding cumulative views',()=>{
  const rows=[row(1,'instagram',40,'business',15),
    row(1,'instagram',48,'business',33),
    row(1,'instagram',43,'business',17)]
  const result=evaluateHistoricalPosts(rows)
  assert.equal(result.uniquePosts,1)
  assert.equal(result.duplicateSnapshots,2)
  assert.equal(result.groups[0].medianViews,33)
  assert.equal(result.groups[0].totalViews,33)
})

test('excludes missing views, bad time, invalid platforms and negative numbers',()=>{
  const result=evaluateHistoricalPosts([
    row(1,'instagram',40,'coding',null as unknown as number),
    row(2,'facebook',40,'coding',-5),
    row(3,'instagram',-2,'coding',15),
    row(4,'youtube',48,'coding',0),
    row(5,'tiktok' as any,48,'coding',5000),
  ])
  assert.equal(result.excluded,4)
  assert.equal(result.uniquePosts,1)
  assert.equal(result.groups[0].medianViews,0)
})

test('8+ matching samples are comparable only as description, not causal claims',()=>{
  const rows=Array.from({length:9},(_,i)=>row(i+1,'instagram',72+2*i,'coding',i*10))
  const results=evaluateHistoricalPosts(rows)
  assert.equal(results.groups.length,1)
  assert.equal(results.groups[0].posts,9)
  assert.equal(results.groups[0].medianViews,40)
  assert.equal(results.groups[0].p75Views,60)
  assert.equal(results.groups[0].reliability,'comparison_ready')
  assert.ok(results.warnings.some(w=>w.includes('not statistical proof')))
})

test('retention exists only for measurable YouTube rows and null never means zero',()=>{
  const results=evaluateHistoricalPosts([
    row(1,'instagram',90,'model',12,{avgViewPct:55,likes:null,shares:null}),
    row(2,'youtube',90,'model',10,{avgViewPct:0,likes:null}),
    row(3,'youtube',90,'model',15,{avgViewPct:56,likes:1,shares:0}),
    row(4,'youtube',90,'model',26,{avgViewPct:76,comments:2}),
  ])
  assert.equal(results.platforms.instagram.retentionSamples,0)
  assert.equal(results.platforms.youtube.retentionSamples,2)
  assert.equal(results.groups.find(g=>g.platform==='instagram')?.knownEngagementPosts,0)
  const yt=results.groups.find(g=>g.platform==='youtube')!
  assert.equal(yt.retentionSamples,2)
  assert.equal(yt.medianAvgViewPct,66)
  assert.equal(yt.knownEngagementPosts,2)
  assert.equal(yt.totalKnownInteractions,3)
})

test('separates creative versions and topics even at same age on same platform',()=>{
  const results=evaluateHistoricalPosts([
    row(1,'instagram',100,'coding',50,{creativeVersion:'editorial-v1'}),
    row(2,'instagram',100,'coding',55,{creativeVersion:'editorial-v2'}),
    row(3,'instagram',100,'business',50,{creativeVersion:'editorial-v2'}),
    row(4,'instagram',100,null as unknown as string,50),
  ])
  assert.equal(results.groups.length,4)
  assert.equal(results.groups.find(g=>g.creativeVersion==='unknown')?.topic,'unknown')
  assert.deepEqual(results.groups.map(g=>g.creativeVersion).sort(),
    ['editorial-v1','editorial-v2','editorial-v2','unknown'].sort())
})
