import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import * as profile from '../../web/lib/media/illustrated-news-profile'
const require=createRequire(import.meta.url)
const ts=require('typescript') as typeof import('typescript')
const scenePlan=()=>[0,1,2].map(i=>({scene:i+1,narrative_purpose:['setup','explanation','implication'][i],
 emotional_intent:'curiosity',environment:'Specific story workspace '+i,
 visual_concept:'An original story-specific illustration demonstrates the concrete action and consequence for scene number '+i}))
function subject(planText:string,failure?:Error){
 const imageCalls:{context:any;body:any}[]=[]
 const textCalls:any[]=[]
 const code=readFileSync(new URL('../../web/lib/media/ideogram.ts',import.meta.url),'utf8')
 const js=ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2023}}).outputText
 const deps:Record<string,any>={
  './illustrated-news-profile':profile,
  '@/lib/media/text-client':{getMediaTextClient:(ctx:any)=>({messages:{create:async(request:any)=>{
   textCalls.push({ctx,request});return {content:[{type:'text',text:planText}]}
  }}})},
  '@/lib/media/image-client':{generateIdeogramV3:async(context:any,body:any)=>{
   imageCalls.push({context,body});if(failure)throw failure;return 'https://provider.invalid/image-'+imageCalls.length
  }},
  '@/lib/cost/governed-spend':{MEDIA_PIPELINE_PROJECT:{slug:'ai-media-automation'}},
  '@/lib/cost/spend-identity':{spendIdempotencyKey:(v:any)=>JSON.stringify(v)},
  '@/lib/article/photo-editor':{ANTI_STOCK_BANLIST:[]},
 }
 const m={exports:{} as any}
 new Function('require','module','exports',js)((id:string)=>{
  if(!(id in deps))throw new Error('Unhandled external dependency '+id);return deps[id]
 },m,m.exports)
 return {generate:m.exports.generateNewsImages,imageCalls,textCalls}
}
const execution={context:'AUTONOMOUS',scope:{projectId:'owner-project'}}
const budget={id:'actual-project-budget'}
test('real existing image generator preserves execution and budget for all new illustration requests',async()=>{
 const s=subject(JSON.stringify(scenePlan()))
 await s.generate('AI news','An AI agent helps a human review code.',3,execution,budget,undefined,profile.ILLUSTRATED_NEWS_PROFILE)
 assert.equal(s.textCalls.length,1);assert.equal(s.imageCalls.length,3)
 assert.equal(s.textCalls[0].ctx.execution,execution);assert.equal(s.textCalls[0].ctx.project,budget)
 assert.ok(s.imageCalls.every(c=>c.context.execution===execution&&c.context.project===budget))
 assert.ok(s.imageCalls.every(c=>c.body.style_type==='GENERAL'&&c.body.rendering_speed==='TURBO'))
})
test('legacy image call remains documentary REALISTIC when no illustration profile is supplied',async()=>{
 const s=subject(JSON.stringify(scenePlan()))
 await s.generate('AI news','A coding tool changes.',3,execution,budget)
 assert.equal(s.imageCalls.length,3)
 assert.ok(s.imageCalls.every(c=>c.body.style_type==='REALISTIC'))
})
test('real generator refuses malformed/count-mismatched plans before any billable image dispatch',async()=>{
 const s=subject(JSON.stringify([...scenePlan(),scenePlan()[0]]))
 await assert.rejects(s.generate('AI news','An agent helps.',3,execution,budget,undefined,profile.ILLUSTRATED_NEWS_PROFILE),/Invalid illustrated/)
 assert.equal(s.imageCalls.length,0)
})
test('a stop/budget refusal at the existing gateway propagates without an internal retry',async()=>{
 const stop=new Error('Execution stopped by owner')
 const s=subject(JSON.stringify(scenePlan()),stop)
 await assert.rejects(s.generate('AI news','An agent helps.',3,execution,budget,undefined,profile.ILLUSTRATED_NEWS_PROFILE),
  (e:unknown)=>e===stop)
 assert.equal(s.imageCalls.length,3)
 // Calls are parallel, one per scene; no second generation batch is started.
 assert.equal(s.textCalls.length,1)
})
