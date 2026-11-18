// Actual server auth/RPC adapter; only the Supabase network boundary is synthetic.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),Module=require('node:module'),path=require('node:path')
const root=path.resolve(__dirname,'../..'),U='11111111-1111-4111-8111-111111111111',S='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
function load({claims={sub:U,role:'authenticated',session_id:S},user={id:U},claimsError=null}={}){
 const calls=[],cache={}
 function moduleAt(rel){const file=path.join(root,rel);if(cache[file])return cache[file].exports
  const m=new Module(file,module);cache[file]=m;m.paths=Module._nodeModulePaths(path.dirname(file));const orig=m.require.bind(m)
  m.require=id=>id==='server-only'?{}:id==='@/lib/supabase/server'?{createClient:async()=>({auth:{getUser:async()=>({data:{user},error:null}),getClaims:async()=>({data:{claims},error:claimsError})}})}:
   id==='@/lib/supabase/admin'?{createAdminClient:()=>({rpc:async(name,args)=>{calls.push({name,args});return{data:null,error:null}}})}:
   id==='./visits'?moduleAt('apps/web/lib/atlas/office/visits.ts'):orig(id)
  m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file);return m.exports
 }
 return{handlers:moduleAt('apps/web/lib/atlas/office/visit-server.ts').officeVisitHandlers,calls}
}
const request=()=>new Request('https://omniraos.se/api/atlas/office/visits/revoke',{method:'POST',headers:{Origin:'https://omniraos.se','Content-Type':'application/json'},body:JSON.stringify({visitId:'019a7d46-1222-7000-8000-000000000001'})})
test('verified claims must match verified user and contain a session; rejected users never reach admin RPC',async()=>{
 for(const options of[{user:null},{claimsError:Error('rejected')},{claims:{sub:'55555555-5555-4555-8555-555555555555',role:'authenticated',session_id:S}},{claims:{sub:U,role:'anon',session_id:S}},{claims:{sub:U,role:'authenticated'}}]){
  const h=load(options);assert.equal((await h.handlers.revoke(request())).status,401);assert.equal(h.calls.length,0)
 }
 const h=load();assert.equal((await h.handlers.revoke(request())).status,403)
 assert.equal(h.calls[0].name,'office_visit_revoke');assert.equal(h.calls[0].args.p_owner,U);assert.equal(h.calls[0].args.p_session,S)
})
