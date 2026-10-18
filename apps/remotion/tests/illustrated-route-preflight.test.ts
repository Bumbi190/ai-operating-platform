import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import * as profile from '../../web/lib/media/illustrated-news-profile'
const require=createRequire(import.meta.url),ts=require('typescript') as typeof import('typescript')
const ID='a8a1b1f6-c222-4893-9399-b1fb3bc2fa52'
for(const [step, saved] of [['step2',false],['step3',false],['step3',true]] as const)test(step+(saved?' holds persisted illustration with flags OFF':' refuses stale source')+' before row claims, failure counters or paid work',async()=>{
 const old={...process.env}
 process.env.CRON_SECRET='unit-only'
 process.env.THE_PROMPT_PILOT_PROJECT_ID=ID
 process.env.THE_PROMPT_ILLUSTRATED_PILOT=saved?'false':'true'
 process.env.THE_PROMPT_FRESH_NEWS_PILOT='true'
 try{
  const writes:any[]=[];let paid=0
  const row={id:'11111111-1111-4111-8111-111111111111',project_id:ID,hook:'AI agent news',
   script:'An AI agent helps a human.',voice_status:'none',video_status:'none',raw_output:saved?{pilot_image_profile:profile.ILLUSTRATED_NEWS_PROFILE}:{},images:[],
   media_news_items:{project_id:ID,title:'New AI agent workflow',summary:'AI agents help humans',
    url:'https://techcrunch.com/ai-agents',raw_output:{source_key:'rss_techcrunch',
     source_published_at:new Date(Date.now()-72*3600000).toISOString()}}}
  const q:any={select:()=>q,eq:()=>q,order:()=>q,limit:()=>q,or:()=>q,gte:()=>q,
   single:async()=>({data:row,error:null}),maybeSingle:async()=>({data:{id:row.id},error:null}),
   update:(data:any)=>{writes.push(data);return q},then:(r:any,j:any)=>Promise.resolve({error:null}).then(r,j)}
  const deps:Record<string,any>={
   '@/lib/media/illustrated-news-profile':profile,
   '@/lib/media/orchestrator/retry-authority':{dispatchedGenerationIsNotRetryable:()=>()=>false},
   'next/server':{NextResponse:{json:(data:any,init?:ResponseInit)=>Response.json(data,init)}},
   '@/lib/supabase/admin':{createAdminClient:()=>({from:()=>q})},
   '@/lib/media/elevenlabs':{generateVoiceover:async()=>{paid++;throw new Error('unexpected provider')}},
   '@/lib/media/ideogram':{generateNewsImages:async()=>{paid++;throw new Error('unexpected provider')}},
   '@/lib/media/pilot-voice-receipt':{buildPilotVoiceReceipt:()=>({})},
   '@/lib/media/storage':{},
   '@/lib/media/video-props':{buildVideoInputProps:async()=>{paid++;throw new Error('unexpected provider')}},
   '@/lib/media/lambda-render':{startLambdaRender:async()=>{paid++;throw new Error('unexpected provider')}},
   '@/lib/media/run-log':{logRun:async()=>{}},
   '@/lib/media/retry':{withRetry:async(f:any)=>f(),nextRetryDelayMs:()=>100},
   '@/lib/media/alert':{sendPipelineAlert:async()=>{}},
   '@/lib/governance/execution-stop':{projectScope:(x:any)=>x,GLOBAL_ONLY:{}},
   '@/lib/governance/execution-dispatch':{assertExecutionDispatchAllowed:async()=>{},isExecutionStopped:()=>false,stopIsNotRetryable:()=>()=>false},
   '@/lib/cost/governed-spend':{MEDIA_PIPELINE_PROJECT:{slug:'ai-media-automation'}},
  }
  const source=readFileSync(new URL('../../web/app/api/media/cron/'+step+'/route.ts',import.meta.url),'utf8')
  const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2023}}).outputText
  const m={exports:{} as any}
  new Function('require','module','exports',js)((id:string)=>{
   if(!(id in deps))throw new Error('Unhandled dependency '+id);return deps[id]
  },m,m.exports)
  const response=await m.exports.GET(new Request('https://unit.invalid/api/media/cron/'+step,{headers:{authorization:'Bearer unit-only'}}))
  assert.equal((await response.json()).status,saved?'illustrated_preview_required':'editorial_review_required')
  assert.equal(paid,0)
  assert.deepEqual(writes,[])
 }finally{for(const k of ['CRON_SECRET','THE_PROMPT_PILOT_PROJECT_ID','THE_PROMPT_ILLUSTRATED_PILOT','THE_PROMPT_FRESH_NEWS_PILOT']){
  if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k]
 }}
})
