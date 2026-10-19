import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
import * as profile from '../../web/lib/media/illustrated-news-profile'
const require=createRequire(import.meta.url),ts=require('typescript') as typeof import('typescript')
for(const raw of [{pilot_image_profile:'the-prompt-illustrated-v2'},{private_provider_preview:{kind:'the-prompt-private-provider-qa-v1'}}]){
 for(const state of ['ready','rendering'])test('step4 holds '+JSON.stringify(raw)+' '+state+' before poll, retry or container',async()=>{
  const old={...process.env};process.env.CRON_SECRET='unit-only';process.env.THE_PROMPT_ILLUSTRATED_PILOT='false'
  try{
   const effects:string[]=[],writes:unknown[]=[]
   const row={id:'11111111-1111-4111-8111-111111111111',project_id:'a8a1b1f6-c222-4893-9399-b1fb3bc2fa52',
    hook:'Private preview',video_status:state,video_url:'https://private.test/movie.mp4',
    raw_output:raw,render_id:'render',render_bucket:'bucket',projects:{slug:'ai-media-automation'}}
   let columns=''
   const projected=()=>{const data={...row} as Record<string,unknown>;if(!columns.includes('raw_output'))delete data.raw_output;return data}
   const q:any={select:(v:string)=>{columns=v;return q},eq:()=>q,is:()=>q,in:()=>q,or:()=>q,order:()=>q,limit:()=>q,gte:()=>q,
    single:async()=>({data:projected(),error:null}),maybeSingle:async()=>({data:row,error:null}),update:(patch:unknown)=>{writes.push(patch);return q},
    then:(ok:any,err:any)=>Promise.resolve({data:null,error:null}).then(ok,err)}
   const deps:Record<string,any>={
    'next/server':{NextResponse:{json:(data:any,init?:ResponseInit)=>Response.json(data,init)}},
    '@/lib/supabase/admin':{createAdminClient:()=>({from:()=>q})},
    '@/lib/media/illustrated-news-profile':profile,
    '@/lib/media/lambda-render':{
     getLambdaRenderProgress:async()=>{effects.push('poll');return{done:true,videoUrl:row.video_url}},
     startLambdaRender:async()=>{effects.push('render');return{renderId:'r',bucketName:'b'}}},
    '@/lib/media/instagram':{createReelContainer:async()=>{effects.push('container');return'cid'},buildInstagramCaption:()=> 'caption'},
    '@/lib/media/social-credentials':{resolveInstagramCredential:async()=>{effects.push('credential');return{ok:true,credential:{}}}},
    '@/lib/media/video-props':{buildVideoInputProps:async()=>{effects.push('props');return{}}},
    '@/lib/media/alert':{sendPipelineAlert:async()=>{effects.push('alert')}},
    '@/lib/media/run-log':{logRun:async()=>{effects.push('runlog')}},
    '@/lib/governance/execution-stop':{projectScope:(x:unknown)=>x},
    '@/lib/governance/execution-dispatch':{assertExecutionDispatchAllowed:async()=>{},isExecutionStopped:()=>false},
    '@/lib/media/social-destination':{PLATFORM_SOCIAL_PROJECT_SLUG:'ai-media-automation'},
   }
   const source=readFileSync(new URL('../../web/app/api/media/cron/step4/route.ts',import.meta.url),'utf8')
   const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2023}}).outputText,m={exports:{} as any}
   new Function('require','module','exports',js)((id:string)=>{if(!(id in deps))throw Error('Unhandled dependency '+id);return deps[id]},m,m.exports)
   const response=await m.exports.GET(new Request('https://unit.invalid/api/media/cron/step4?scriptId='+row.id,{headers:{authorization:'Bearer unit-only'}}))
   assert.equal((await response.json()).status,'illustrated_preview_required')
   assert.deepEqual(effects,[]);assert.deepEqual(writes,[])
  }finally{for(const k of ['CRON_SECRET','THE_PROMPT_ILLUSTRATED_PILOT']){if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k]}}
 })
}
