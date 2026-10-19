import {test} from 'node:test'
import assert from 'node:assert/strict'
import {
 resolveIllustratedNewsProfile,buildIllustratedNewsPlanningPrompt,parseIllustratedNewsScenes,
 buildIllustratedImageRequest,runIllustratedImagePlan,
} from '../../web/lib/media/illustrated-news-profile'
const ID='a8a1b1f6-c222-4893-9399-b1fb3bc2fa52'
const enabled={THE_PROMPT_ILLUSTRATED_PILOT:'true',THE_PROMPT_FRESH_NEWS_PILOT:'true',THE_PROMPT_PILOT_PROJECT_ID:ID}
const scenes=()=>[
 {scene:1,narrative_purpose:'setup',emotional_intent:'curiosity',environment:'Support triage workspace',visual_concept:'An original cutaway agent workflow routes incoming support ticket cards into distinct review queues.'},
 {scene:2,narrative_purpose:'explanation',emotional_intent:'realism',environment:'Software code review desk',visual_concept:'A close view of prepared code-change cards links the incoming problem to a reviewed software fix.'},
 {scene:3,narrative_purpose:'implication',emotional_intent:'gravity',environment:'Human decision workbench',visual_concept:'A human hand selects a reviewed software fix while the prepared agent workflow waits for the decision.'},
]
test('three explicit flags and the exact real project are all required',()=>{
 assert.equal(resolveIllustratedNewsProfile(ID,enabled),'the-prompt-illustrated-v2')
 for(const env of [{},{...enabled,THE_PROMPT_ILLUSTRATED_PILOT:undefined},{...enabled,THE_PROMPT_FRESH_NEWS_PILOT:'false'},
  {...enabled,THE_PROMPT_PILOT_PROJECT_ID:'11111111-1111-4111-8111-111111111111'}])
  assert.equal(resolveIllustratedNewsProfile(ID,env),undefined)
 assert.equal(resolveIllustratedNewsProfile('11111111-1111-4111-8111-111111111111',enabled),undefined)
})
test('planner incorporates this story, exactly three images and the accepted bright illustrative direction',()=>{
 const p=buildIllustratedNewsPlanningPrompt('A new AI coding tool','A human reviews the AI agent support triage.',3)
 assert.ok(p.includes('A new AI coding tool'))
 assert.ok(p.includes('A human reviews the AI agent support triage.'))
 assert.match(p,/exactly 3/)
 assert.match(p,/bright|bright midtones/i)
 assert.match(p,/illustration/i)
 assert.throws(()=>buildIllustratedNewsPlanningPrompt('AI news','story',8),/Invalid illustrated/)
})
test('complete, bounded distinct scene plans only; no unbounded extra image calls',()=>{
 assert.equal(parseIllustratedNewsScenes(JSON.stringify(scenes())).length,3)
 for(const bad of ['', 'not json', JSON.stringify(scenes().slice(0,2)),JSON.stringify([...scenes(),scenes()[0]]),
  JSON.stringify(scenes().map((s,i)=>i===1?{...s,scene:8}:s)),
  JSON.stringify(scenes().map((s,i)=>i===1?{...s,visual_concept:scenes()[0].visual_concept}:s)),
  JSON.stringify(scenes().map((s,i)=>i===1?{...s,visual_concept:'x'.repeat(2000)}:s)),
  JSON.stringify(scenes().map((s,i)=>i===1?{...s,narrative_purpose:'make up facts'}:s)),
 ])assert.throws(()=>parseIllustratedNewsScenes(bad),/Invalid illustrated/)
})
test('provider request keeps existing TURBO budget tier and explicit illustration semantics',()=>{
 const request=buildIllustratedImageRequest(scenes()[0] as any)
 assert.equal(request.rendering_speed,'TURBO')
 assert.equal(request.style_type,'GENERAL')
 assert.equal(request.aspect_ratio,'9x16')
 assert.match(request.prompt,/not an actual photograph/i)
 assert.match(request.prompt,/orange|cyan/i)
 assert.match(request.negative_prompt,/readable text/)
 assert.ok(!('num_images' in request))
})
test('actual illustrated orchestration parses everything before dispatch and generates exactly three',async()=>{
 const requests:unknown[]=[]
 const urls=await runIllustratedImagePlan('AI tool','An AI agent prepares work for a human.',3,
  async()=>JSON.stringify(scenes()),async req=>{requests.push(req);return 'https://provider.invalid/'+requests.length})
 assert.equal(requests.length,3)
 assert.equal(urls.length,3)
 let paid=0
 await assert.rejects(runIllustratedImagePlan('AI tool','An agent helps.',3,async()=>JSON.stringify([...scenes(),scenes()[0]]),
  async()=>{paid++;return 'bad'}),/Invalid illustrated/)
 assert.equal(paid,0)
})

test('new image mode checks real persisted source date/project before providers',async()=>{
 const {assertIllustratedNewsSource}=await import('../../web/lib/media/illustrated-news-profile')
 const now=Date.parse('2026-10-18T05:00:00Z')
 const n={project_id:ID,title:'New AI agent coding workflow',summary:'AI agents help review code',
  url:'https://techcrunch.com/2026/10/17/ai-agent-update/',raw_output:{
   source_key:'rss_techcrunch',source_published_at:'2026-10-17T12:00:00Z'}}
 assert.doesNotThrow(()=>assertIllustratedNewsSource(ID,n,now))
 for(const bad of [null,{...n,project_id:'wrong'},{...n,raw_output:{}},
  {...n,raw_output:{...n.raw_output,source_published_at:'2026-10-12T12:00:00Z'}},
  {...n,url:'https://fake.invalid/ai-agent-update'}])
  assert.throws(()=>assertIllustratedNewsSource(ID,bad,now),/ILLUSTRATED_SOURCE_NOT_VERIFIED/)
})
