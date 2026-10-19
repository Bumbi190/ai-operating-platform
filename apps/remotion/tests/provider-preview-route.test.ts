import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {createRequire} from 'node:module'
const require=createRequire(import.meta.url),ts=require('typescript') as typeof import('typescript')
import {ProviderPreviewError,PREVIEW_PROJECT_ID} from '../../web/lib/media/provider-preview'
function route(access:any,env='preview',failure?:Error){
 let calls=0
 const source=readFileSync(new URL('../../web/app/api/media/pilot/provider-preview/route.ts',import.meta.url),'utf8')
 const deps:Record<string,any>={
  'next/server':{NextResponse:{json:(b:any,i:any)=>Response.json(b,i)}},
  '@/lib/auth/project-access':{resolveProjectAccess:async()=>access,assertProjectAllowed:(p:string,ids:string[])=>ids.includes(p)},
  '@/lib/media/provider-preview':{ProviderPreviewError,PREVIEW_PROJECT_ID},
  '@/lib/media/provider-preview-runtime':{createRuntimeProviderPreview:(a:any)=>{assert.equal(a,access);return{
   inspect:async()=>{calls++;if(failure)throw failure;return{status:'ready_to_generate'}},
   generate:async(b:any)=>{calls++;if(failure)throw failure;return{status:'claimed',...b}},
  }}},
 }
 const m={exports:{} as any}
 const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2023}}).outputText
 new Function('require','module','exports',js)((id:string)=>{if(!(id in deps))throw Error(id);return deps[id]},m,m.exports)
 return{api:m.exports,calls:()=>calls,env}
}
const owner={ok:true,userId:'owner',allowedProjectIds:[PREVIEW_PROJECT_ID]}
test('real HTTP handlers are preview-only and owner-only before runtime work',async()=>{
 const old=process.env.VERCEL_ENV
 try{
  for(const [env,access,status] of [
   ['production',owner,404],['preview',{ok:false,response:Response.json({error:'Unauthorized'},{status:401})},401],
   ['preview',{ok:true,userId:'foreign',allowedProjectIds:[]},404],['preview',owner,200],
  ] as const){
   process.env.VERCEL_ENV=env
   const x=route(access),r=await x.api.GET(new Request('https://preview.test/api/media/pilot/provider-preview'))
   assert.equal(r.status,status);assert.equal(x.calls(),status===200?1:0)
   assert.match(r.headers.get('cache-control')??'',/no-store/)
  }
 }finally{if(old===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=old}
})
test('real POST refuses cross-origin, oversized and arbitrary bodies before generation',async()=>{
 const old=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview'
 try{
  for(const [origin,body,status] of [
   ['https://evil.test',JSON.stringify({quoteHash:'a'.repeat(64),maximumSek:12}),403],
   ['https://preview.test','x'.repeat(1025),400],
   ['https://preview.test',JSON.stringify({quoteHash:'a'.repeat(64),maximumSek:12,projectId:'foreign'}),400],
   ['https://preview.test',JSON.stringify({quoteHash:'a'.repeat(64),maximumSek:12}),200],
  ] as const){
   const x=route(owner),r=await x.api.POST(new Request('https://preview.test/api/media/pilot/provider-preview',
    {method:'POST',headers:{origin,'content-type':'application/json'},body}))
   assert.equal(r.status,status);assert.equal(x.calls(),status===200?1:0)
  }
 }finally{if(old===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=old}
})
test('HTTP failures never echo raw provider errors or secret-like details',async()=>{
 const old=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview'
 try{
  const x=route(owner,'preview',Error('secret-provider-token-must-stay-server-side'))
  const r=await x.api.GET(new Request('https://preview.test/api/media/pilot/provider-preview'))
  assert.equal(r.status,503);assert.deepEqual(await r.json(),{error:'PREVIEW_UNAVAILABLE'})
 }finally{if(old===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=old}
})
