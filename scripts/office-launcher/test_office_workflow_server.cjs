// Real server modules/routes; Supabase authentication/transport are synthetic.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),Module=require('node:module'),path=require('node:path')
const root=path.resolve(__dirname,'../..'),U='11111111-1111-4111-8111-111111111111',S='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',P='22222222-2222-4222-8222-222222222222',A='33333333-3333-4333-8333-333333333333',V='019a7d46-1222-7000-8000-000000000001'
function load({claims={sub:U,role:'authenticated',session_id:S},user={id:U},claimsError=null}={}){
 const calls=[],cache={};let authReads=0
 function moduleAt(rel){const file=path.join(root,rel);if(cache[file])return cache[file].exports
  const m=new Module(file,module);cache[file]=m;m.paths=Module._nodeModulePaths(path.dirname(file));const orig=m.require.bind(m)
  m.require=id=>id==='server-only'?{}:id==='@/lib/supabase/server'?{createClient:async()=>{authReads++;return{auth:{getUser:async()=>({data:{user},error:null}),getClaims:async()=>({data:{claims},error:claimsError})}}}}:
   id==='@/lib/supabase/admin'?{createAdminClient:()=>({rpc:async(name,args)=>{calls.push({name,args});const t=Date.now();return{data:{visitId:V,avatarId:'office-familje-pling',projectId:P,agentId:A,createdAt:new Date(t).toISOString(),expiresAt:new Date(t+14400000).toISOString(),leaseUntil:new Date(t+30000).toISOString(),readScope:'workflow_state_v1',nativeWorkflowProtocol:1,generatedAt:new Date(t).toISOString(),workflowRevision:1,workflowFacts:{complete:true,runs:[]}},error:null}}})}:
   id.startsWith('.')?moduleAt(path.relative(root,path.resolve(path.dirname(file),id+'.ts'))):id.startsWith('@/')?moduleAt('apps/web/'+id.slice(2)+'.ts'):orig(id)
  m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);return m.exports
 }
 return{create:moduleAt('apps/web/app/api/atlas/office/visits/workflow/route.ts'),presence:moduleAt('apps/web/app/api/atlas/office/visits/workflow/presence/route.ts'),calls,authReads:()=>authReads}
}
function req(presence=false){return new Request('https://omniraos.se/api/atlas/office/visits/workflow'+(presence?'/presence':''),{method:'POST',headers:{'Content-Type':'application/json',...(presence?{'x-omnira-office-visit':Buffer.alloc(32,42).toString('base64url')}:{Origin:'https://omniraos.se'})},body:JSON.stringify(presence?{visitId:V}:{visitId:V,secretDigest:'a'.repeat(64),projectId:P,agentId:A,avatarId:'office-familje-pling',readScope:'workflow_state_v1',nativeWorkflowProtocol:'1'})})}
async function env(value,fn){const prior=process.env.OMNIRA_OFFICE_WORKFLOW_STATUS_ENABLED;try{if(value===undefined)delete process.env.OMNIRA_OFFICE_WORKFLOW_STATUS_ENABLED;else process.env.OMNIRA_OFFICE_WORKFLOW_STATUS_ENABLED=value;await fn()}finally{if(prior===undefined)delete process.env.OMNIRA_OFFICE_WORKFLOW_STATUS_ENABLED;else process.env.OMNIRA_OFFICE_WORKFLOW_STATUS_ENABLED=prior}}
test('real routes default off; only exact true enables; gate prevents auth/admin calls',async()=>{
 for(const value of[undefined,'false','TRUE','1'])await env(value,async()=>{const h=load();assert.equal((await h.create.POST(req())).status,503);assert.equal((await h.presence.POST(req(true))).status,503);assert.equal(h.authReads(),0);assert.equal(h.calls.length,0)})
})
test('real owner adapter rejects mismatched, absent, failed and non-owner session claims',async()=>{
 await env('true',async()=>{for(const options of[{user:null},{claimsError:Error('SECRET_AUTH')},{claims:{sub:P,role:'authenticated',session_id:S}},{claims:{sub:U,role:'anon',session_id:S}},{claims:{sub:U,role:'authenticated'}},{claims:{sub:U,role:'authenticated',session_id:'bad'}}]){const h=load(options),r=await h.create.POST(req());assert.equal(r.status,401);assert.equal(h.calls.length,0);assert(!(await r.text()).includes('SECRET_AUTH'))}})
})
test('real routes use dedicated RPCs; native route does not read browser credentials',async()=>{
 await env('true',async()=>{const h=load();assert.equal((await h.create.POST(req())).status,200);assert.equal(h.authReads(),1);assert.equal(h.calls[0].name,'office_visit_workflow_create');assert.equal(h.calls[0].args.p_owner,U);assert.equal(h.calls[0].args.p_session,S);const r=await h.presence.POST(req(true));assert.equal(r.status,200);assert.equal((await r.json()).workflow_state,'idle');assert.equal(h.authReads(),1);assert.equal(h.calls[1].name,'office_visit_workflow_presence');for(const route of[h.create,h.presence]){assert.equal(route.runtime,'nodejs');assert.equal(route.dynamic,'force-dynamic');assert.equal(route.revalidate,0)}})
})
