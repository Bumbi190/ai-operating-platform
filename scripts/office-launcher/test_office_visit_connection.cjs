const {test,before}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url')
let api={};const file=path.resolve(__dirname,'../../apps/web/lib/atlas/office/visit-connection.ts')
before(async()=>{if(fs.existsSync(file))api=await import(pathToFileURL(file))})
const selection={avatarId:'office-familje-pling',projectId:'22222222-2222-4222-8222-222222222222',agentId:'33333333-3333-4333-8333-333333333333'}
const id='019a7d46-1222-7000-8000-000000000001',pair={port:42123,key:'x'.repeat(43)}
function transport({holdCreate=false,ack=true}={}){
 const calls=[];let finish,created=false,failStatus=false
 const fetcher=async(url,opts)=>{
  calls.push({url,opts});assert.equal(opts.redirect,'error');assert.equal(opts.cache,'no-store')
  let data
  if(url.startsWith('http:')){
   assert.equal(opts.credentials,'omit');assert.equal(opts.headers.Authorization,'Bearer '+pair.key)
   if(failStatus&&url.endsWith('/status'))throw Error('Local observation unavailable')
   if(url.endsWith('/status'))data={protocol:2,avatars:[selection.avatarId],visitId:id,secretDigest:'a'.repeat(64),acknowledged:created&&ack,
    presence:created?{schema:'omnira.office.private-presence.v1',avatar_id:selection.avatarId,identity:'verified',data_state:'fresh',execution:'not_verified',work_verified:false,expires_at_unix:Date.now()/1000+19}:null,
    expiresAt:new Date(Date.now()+14400000).toISOString(),leaseUntil:new Date(Date.now()+30000).toISOString()}
   else if(url.endsWith('/attach'))data={protocol:2,visitId:id,acknowledged:false,committed:true}
   else if(url.endsWith('/disconnect'))data={protocol:2,disconnected:true}
   else throw Error('Browser must never send snapshots')
  }else{
   assert.equal(opts.credentials,'same-origin');assert(!JSON.stringify(opts.headers??{}).includes(pair.key))
   if(url.endsWith('/revoke'))data={revoked:true}
   else {if(holdCreate)await new Promise(r=>finish=r);created=true;data={...selection,visitId:id,expiresAt:new Date(Date.now()+14400000).toISOString(),leaseUntil:new Date(Date.now()+30000).toISOString()}}
  }
  return Response.json(data)
 }
 return{fetcher,calls,finish:()=>finish?.(),failStatus:()=>failStatus=true}
}
test('visit confirmation needs a native acknowledgement; browser never publishes frames',async()=>{
 assert.equal(typeof api.OfficeVisitConnection,'function','Browser visit controller missing')
 const t=transport(),states=[];const c=new api.OfficeVisitConnection(pair,{fetcher:t.fetcher,onState:s=>states.push(s)})
 try{await c.start(selection);assert.equal(states.at(-1).phase,'fresh');assert(c.canDetach)
  assert(t.calls.some(x=>x.url.endsWith('/attach')));assert(!t.calls.some(x=>/snapshot|\/bind$/.test(x.url)))
 }finally{await c.stop()}
})
test('closing confirmed browser detaches; explicit disconnect still revokes afterwards',async()=>{
 assert.equal(typeof api.OfficeVisitConnection,'function','Browser visit controller missing')
 const t=transport(),states=[],c=new api.OfficeVisitConnection(pair,{fetcher:t.fetcher,onState:s=>states.push(s)})
 await c.start(selection);const before=t.calls.length;c.detach();await new Promise(r=>setImmediate(r))
 assert.equal(states.at(-1).phase,'detached');assert.equal(t.calls.length,before)
 await c.stop();assert(t.calls.some(x=>x.url.endsWith('/disconnect')));assert(t.calls.some(x=>x.url.endsWith('/revoke')))
})
test('pending browser close prevents late attach and revokes a late grant',async()=>{
 assert.equal(typeof api.OfficeVisitConnection,'function','Browser visit controller missing')
 const t=transport({holdCreate:true}),states=[],c=new api.OfficeVisitConnection(pair,{fetcher:t.fetcher,onState:s=>states.push(s)})
 const pending=c.start(selection)
 while(!t.calls.some(x=>x.url.endsWith('/visits')))await new Promise(r=>setImmediate(r))
 c.detach();t.finish();await pending;await new Promise(r=>setImmediate(r))
 assert(!t.calls.some(x=>x.url.endsWith('/attach')));assert(t.calls.some(x=>x.url.endsWith('/revoke')))
 assert.notEqual(states.at(-1).phase,'fresh')
})
test('confirmed browser observation failure detaches without revoking native authority',async()=>{
 const t=transport(),states=[],c=new api.OfficeVisitConnection(pair,{fetcher:t.fetcher,onState:s=>states.push(s)})
 await c.start(selection);t.failStatus()
 // Invoke the actual scheduled monitor without waiting8seconds; no transport code is replaced.
 await c.refresh(selection,c.controller,c.generation)
 assert.equal(states.at(-1).phase,'detached')
 assert(!t.calls.some(x=>x.url.endsWith('/disconnect')||x.url.endsWith('/revoke')))
 await c.stop()
})
