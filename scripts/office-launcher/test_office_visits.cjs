// HTTP boundary tests; synthetic owner and database adapter, no real credentials.
const {test,before}=require('node:test'),assert=require('node:assert/strict')
const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url'),crypto=require('node:crypto')
const file=path.resolve(__dirname,'../../apps/web/lib/atlas/office/visits.ts'); let api={}
before(async()=>{if(fs.existsSync(file)) api=await import(pathToFileURL(file))})
const ownerId='11111111-1111-4111-8111-111111111111',sessionId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const selection={visitId:'019a7d46-1222-7000-8000-000000000001',avatarId:'office-familje-pling',projectId:'22222222-2222-4222-8222-222222222222',agentId:'33333333-3333-4333-8333-333333333333'}
const secret=Buffer.alloc(32,42).toString('base64url'),digest=crypto.createHash('sha256').update(Buffer.from(secret,'base64url')).digest('hex')
const payload={...selection,secretDigest:digest}
function harness({owner=true,row=true,error=false}={}) {
 const calls=[];assert.equal(typeof api.createVisitHandlers,'function','Office visit HTTP handlers missing')
 const handlers=api.createVisitHandlers({owner:async()=>owner?{ownerId,sessionId}:null,rpc:async(name,args)=>{
  calls.push({name,args}); if(error)throw Error('SENSITIVE DB DIAGNOSTIC')
  if(!row)return null;if(name==='office_visit_revoke')return true
  const now=Date.now()
  return {...selection,createdAt:new Date(now).toISOString(),expiresAt:new Date(now+14400000).toISOString(),leaseUntil:new Date(now+30000).toISOString(),
   ...(name==='office_visit_presence'?{generatedAt:new Date().toISOString(),projectName:'Synthetic project',projectSlug:'synthetic',agentName:'Synthetic agent'}:{})}
 }})
 return{handlers,calls}
}
function request(operation='create',data=payload,headers={}){
 const suffix=operation==='create'?'':'/'+operation
 return new Request('https://omniraos.se/api/atlas/office/visits'+suffix,{method:'POST',headers:{'Content-Type':'application/json',...(operation==='create'?{Origin:'https://omniraos.se'}:{}),...headers},body:typeof data==='string'?data:JSON.stringify(data)})
}
test('only verified cookie owner creates selected scoped metadata',async()=>{
 const h=harness();const r=await h.handlers.create(request());assert.equal(r.status,200)
 assert.equal(h.calls[0].args.p_owner,ownerId);assert.equal(h.calls[0].args.p_session,sessionId)
 const text=await r.text();for(const value of[secret,digest,ownerId,sessionId])assert(!text.includes(value))
 assert.equal(r.headers.get('Cache-Control'),'private, no-store, max-age=0')
})
test('create rejects unauthenticated user and CSRF before writes',async()=>{
 const h=harness({owner:false});assert.equal((await h.handlers.create(request())).status,401);assert.equal(h.calls.length,0)
 for(const Origin of['https://evil.test','null','https://omniraos.se.evil.test']){
  const x=harness();assert.equal((await x.handlers.create(request('create',payload,{Origin}))).status,403);assert.equal(x.calls.length,0)
 }
})
test('strict bounded JSON rejects duplicate keys, owner injection, nested and streamed overflow',async()=>{
 for(const body of['{"visitId":"a","visitId":"b"}',{...payload,owner_id:ownerId},{...payload,agentId:{id:selection.agentId}},' '.repeat(2049),'{bad']){
  const h=harness();assert.equal((await h.handlers.create(request('create',body))).status,400);assert.equal(h.calls.length,0)
 }
})
test('dedicated secret is hashed and accepted only by presence/revoke, not cookie fallback',async()=>{
 const h=harness();let r=await h.handlers.presence(request('presence',{visitId:selection.visitId},{'X-Omnira-Office-Visit':secret}));assert.equal(r.status,200)
 assert.equal(h.calls[0].args.p_digest,digest);const data=await r.json()
 assert.equal(data.snapshot.availability.stepEvidence,false);assert.equal(data.snapshot.projects.length,1)
 assert.equal(data.snapshot.projects[0].agents[0].executionEvidence,'unavailable');assert.equal(data.binding.agent.name,'Synthetic agent')
 for(const headers of[{}, {Cookie:'fake'}, {Authorization:'Bearer '+secret},{'X-Omnira-Office-Visit':digest},{'X-Omnira-Office-Visit':secret,Cookie:'fake'},{'X-Omnira-Office-Visit':secret,Origin:'https://omniraos.se'}]){
  const x=harness();assert.equal((await x.handlers.presence(request('presence',{visitId:selection.visitId},headers))).status,403);assert.equal(x.calls.length,0)
 }
 const x=harness();assert.equal((await x.handlers.create(request('create',payload,{'X-Omnira-Office-Visit':secret}))).status,403)
})
test('DB denial and exceptions stay closed with no sensitive errors',async()=>{
 for(const opts of[{row:false},{error:true}]){
  const h=harness(opts),r=await h.handlers.presence(request('presence',{visitId:selection.visitId},{'X-Omnira-Office-Visit':secret}))
  assert.equal(r.status,opts.error?503:403);assert(!(await r.text()).includes('SENSITIVE'))
 }
})
test('owner revoke needs exact origin and authenticated session; native needs secret alone',async()=>{
 const h=harness();assert.equal((await h.handlers.revoke(request('revoke',{visitId:selection.visitId},{Origin:'https://omniraos.se'}))).status,200)
 assert.equal(h.calls[0].args.p_owner,ownerId)
 const n=harness();assert.equal((await n.handlers.revoke(request('revoke',{visitId:selection.visitId},{'X-Omnira-Office-Visit':secret}))).status,200)
 assert.equal(n.calls[0].args.p_owner,null)
})
test('chunked oversized body is bounded even without Content-Length',async()=>{
 const h=harness(),stream=new ReadableStream({start(c){c.enqueue(new Uint8Array(1025).fill(32));c.enqueue(new Uint8Array(1025).fill(32));c.close()}})
 const req=new Request('https://omniraos.se/api/atlas/office/visits',{method:'POST',headers:{Origin:'https://omniraos.se','Content-Type':'application/json'},body:stream,duplex:'half'})
 assert.equal((await h.handlers.create(req)).status,400);assert.equal(h.calls.length,0)
})
test('JSON whitespace accepts space tab CR LF and rejects JavaScript-only Unicode whitespace',async()=>{
 const valid=harness();assert.equal((await valid.handlers.create(request('create',' \t\r\n'+JSON.stringify(payload)+'\n'))).status,200)
 for(const ws of['\u00a0','\u2028','\ufeff']){
  const h=harness();assert.equal((await h.handlers.create(request('create',ws+JSON.stringify(payload)))).status,400);assert.equal(h.calls.length,0)
 }
})
