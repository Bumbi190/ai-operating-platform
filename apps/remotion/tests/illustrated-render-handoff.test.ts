import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
const require=createRequire(import.meta.url),ts=require('typescript') as typeof import('typescript')
const source=readFileSync(new URL('../../web/lib/media/lambda-render.ts',import.meta.url),'utf8')
for(const scenario of ['illustrated','missing','db_error','legacy','legacy_short','unapproved_composition'] as const)test('Lambda handoff: '+scenario,async()=>{
 let dispatches=0,reads=0
 const row=scenario==='missing'?null:{raw_output:scenario==='illustrated'?{pilot_image_profile:'the-prompt-illustrated-v2'}:{}}
 const q:any={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:row,error:scenario==='db_error'?{message:'unavailable'}:null})}
 const deps:Record<string,any>={
  '@/lib/supabase/admin':{createAdminClient:()=>{reads++;return{from:()=>q}}},
  './illustrated-news-profile':await import('../../web/lib/media/illustrated-news-profile'),
  '@remotion/lambda/client':{renderMediaOnLambda:async()=>{dispatches++;return{renderId:'r',bucketName:'b'}}},
 }
 const m={exports:{} as any}
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2023}}).outputText
 new Function('require','module','exports',js)((id:string)=>{if(!(id in deps))throw new Error('Unhandled dependency '+id);return deps[id]},m,m.exports)
 const old={...process.env}
 for(const k of ['AWS_REGION','REMOTION_LAMBDA_FUNCTION_NAME','REMOTION_SERVE_URL'])process.env[k]='unit-only'
 process.env.THE_PROMPT_ILLUSTRATED_PILOT='false'
 try{
  const run=()=>m.exports.startLambdaRender('script-id',{},scenario==='unapproved_composition'?'ThePromptIllustratedNews':scenario==='legacy_short'?'ShortFormVideo':'SimpleNewsReel')
  if(scenario==='legacy'||scenario==='legacy_short'){assert.deepEqual(await run(),{renderId:'r',bucketName:'b'});assert.equal(dispatches,1)}
  else{await assert.rejects(run(),scenario==='unapproved_composition'?/RENDER_COMPOSITION_NOT_AUTHORIZED/:scenario==='illustrated'?/ILLUSTRATED_PREVIEW_REQUIRED/:/RENDER_SCRIPT_NOT_VERIFIED/);assert.equal(dispatches,0);if(scenario==='unapproved_composition')assert.equal(reads,0)}
 }finally{
  for(const k of ['AWS_REGION','REMOTION_LAMBDA_FUNCTION_NAME','REMOTION_SERVE_URL','THE_PROMPT_ILLUSTRATED_PILOT']){
   if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k]
  }
 }
})
