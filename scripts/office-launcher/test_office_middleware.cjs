const {test}=require('node:test')
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module')
const ts=require('typescript'),{NextRequest}=require('next/server')
const root=path.resolve(__dirname,'../..')
const file=path.join(root,'apps/web/middleware.ts')
let user=null,membership=null,membershipError=null,owned=[],ownershipError=null
const scoped={from(table){
 return {select(){return {eq(){
  return table==='projects'
   ? {limit:async()=>({data:owned,error:ownershipError})}
   : {maybeSingle:async()=>({data:membership,error:membershipError})}
 }}}}
}}
const mockClient={auth:{getUser:async()=>({data:{user}})},...scoped}
const mod=new Module(file,module);mod.filename=file;mod.paths=Module._nodeModulePaths(path.dirname(file))
const original=mod.require.bind(mod)
mod.require=id=>{
 if(id==='@supabase/ssr')return {createServerClient:()=>mockClient}
 if(id==='@/lib/ui/generation')return {parseUiGenerationParam:()=>null}
 return original(id)
}
mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file)
const run=route=>mod.exports.middleware(new NextRequest('https://omniraos.se'+route))
function setup(values={}){user=values.user??null;membership=values.membership??null;owned=values.owned??[];ownershipError=values.ownershipError??null;membershipError=null}

test('anonymous pairing page never redirects its fragment to login or recovery handlers',async()=>{
 setup()
 for(const route of ['/atlas/office/connect','/atlas/office/connect?code=synthetic']){
  const response=await run(route)
  assert.equal(response.headers.get('location'),null)
  assert.equal(response.headers.get('x-middleware-next'),'1')
 }
 const ordinary=await run('/atlas')
 assert.equal(new URL(ordinary.headers.get('location')).pathname,'/login')
})

test('collaborator and unknown ownership are denied in-place before the private owner page',async()=>{
 for(const values of [
  {user:{id:'synthetic-user'},membership:{role:'collaborator',revoked_at:null}},
  {user:{id:'synthetic-user'},membership:{role:'collaborator',revoked_at:'2026-11-01'}},
  {user:{id:'synthetic-user'},owned:[]},
  {user:{id:'synthetic-user'},ownershipError:{message:'PRIVATE_ERROR'}},
 ]){
  setup(values)
  const response=await run('/atlas/office/connect')
  assert.equal(response.status,403)
  assert.equal(response.headers.get('location'),null)
  assert.match(response.headers.get('cache-control'),/no-store/)
  assert(!(await response.text()).includes('PRIVATE_ERROR'))
 }
})

test('existing owner route and existing collaborator API containment stay intact',async()=>{
 setup({user:{id:'synthetic-user'},membership:{role:'owner',revoked_at:null}})
 assert.equal((await run('/atlas/office/connect')).headers.get('x-middleware-next'),'1')
 setup({user:{id:'synthetic-user'},owned:[{id:'synthetic-project'}]})
 assert.equal((await run('/atlas/office/connect')).headers.get('x-middleware-next'),'1')
 setup({user:{id:'synthetic-user'},membership:{role:'collaborator',revoked_at:null}})
 assert.equal((await run('/api/atlas/campus/snapshot')).status,403)
 assert.equal(new URL((await run('/atlas')).headers.get('location')).pathname,'/organization/atlas')
})
