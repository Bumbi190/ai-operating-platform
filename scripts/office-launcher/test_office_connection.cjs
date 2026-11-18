// Behavioral test of the actual browser-side connection module. All identities synthetic.
const {test, before} = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const {pathToFileURL} = require('node:url')
const root = path.resolve(__dirname, '../..')
const modulePath = path.join(root, 'apps/web/lib/atlas/office/connection.ts')
let api = {}
before(async()=>{
 if(fs.existsSync(modulePath))api=await import(pathToFileURL(modulePath).href)
})
const PROJECT='11111111-1111-4111-8111-111111111111'
const AGENT='22222222-2222-4222-8222-222222222222'
const KEY='x'.repeat(43)
const pairing={port:42123,key:KEY}
const selected={avatarId:'office-familje-pling',projectId:PROJECT,agentId:AGENT}
const answer=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}})
const present=()=>({schema:'omnira.office.private-presence.v1',avatar_id:selected.avatarId,
 data_state:'fresh',identity:'verified',execution:'not_verified',work_verified:false,
 status_text:'UNTRUSTED LABEL',expires_at_unix:Date.now()/1000+19})
function transport({auth=200, hold=false, presence=present, duplicate=false}={}){
 const calls=[];let active=0,maxActive=0
 const fetcher=async(url,opts={})=>{
  calls.push({url,opts}); active++;maxActive=Math.max(maxActive,active)
  try{
   assert.equal(opts.redirect,'error')
   assert.equal(opts.cache,'no-store')
   if(url.startsWith('http://127.0.0.1:')){
    assert.equal(opts.credentials,'omit')
    assert.equal(opts.headers.Authorization,'Bearer '+KEY)
    assert.equal(opts.referrerPolicy,'no-referrer')
    if(url.endsWith('/status'))return answer({protocol:1,avatars:[selected.avatarId],presence:null})
    if(url.endsWith('/bind'))return answer({protocol:1,connectionId:'c'.repeat(24),presence:null})
    const data=JSON.parse(opts.body)
    assert.equal(data.connectionId,'c'.repeat(24))
    if(url.endsWith('/disconnect'))return answer({protocol:1,presence:null})
    return answer({protocol:1,presence:presence()})
   }
   assert.equal(opts.credentials,'same-origin')
   assert(!opts.headers?.Authorization,'Local pairing key must never reach the source API')
   if(hold)await new Promise((resolve,reject)=>opts.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true}))
   const binding={schemaVersion:1,source:'AUTHENTICATED_PROJECT_AGENT_MATCH_V036',verifiedIdentity:true,
    verifiedAt:new Date().toISOString(),character:'pling',public3dBinding:'none',
    project:{id:PROJECT,slug:'selected',name:'Chosen'},agent:{id:AGENT,name:'Chosen agent',description:'PRIVATE_DESCRIPTION'}}
   const chosen={id:PROJECT,slug:'selected',name:'Chosen',agents:[{id:AGENT,name:'Chosen agent',executionEvidence:'unavailable',stepRequest:null}]}
   const other={id:'33333333-3333-4333-8333-333333333333',slug:'other',name:'UNRELATED_PROJECT',agents:[{id:AGENT,name:'UNRELATED_AGENT'}]}
   const snapshot={schemaVersion:2,dataSource:'authorized_organisation_read',generatedAt:new Date().toISOString(),
    availability:{projects:true,agents:true,stepEvidence:false},projects:[chosen,other,...(duplicate?[chosen]:[])]}
   return answer(url.includes('/agents/')?binding:snapshot,auth)
  }finally{active--}
 }
 return {calls,fetcher,get maxActive(){return maxActive}}
}

test('pairing fragment is scrubbed before validation; secrets never remain in history',()=>{
 assert.equal(typeof api.consumeOfficePairing,'function','Office connection module is missing')
 for(const hash of [`#officePort=42123&officeKey=${KEY}`,`#officeKey=${KEY}&officePort=42123&officePort=42124`,'#officePort=80&officeKey=bad','#officePort=42123&officeKey='+KEY+'&extra=bad']){
  const replacements=[]
  const result=api.consumeOfficePairing({hash,pathname:'/atlas/office/connect',search:''},
   {state:null,replaceState:(...args)=>replacements.push(args)})
  assert.equal(replacements.length,1)
  assert.equal(replacements[0][2],'/atlas/office/connect')
  assert(!JSON.stringify(replacements).includes(KEY))
  assert.deepEqual(result,hash===`#officePort=42123&officeKey=${KEY}`?pairing:null)
 }
})

test('connection is opt-in, uses one bounded API pair, and never claims execution',async()=>{
 assert.equal(typeof api.OfficeConnection,'function','Office connection controller is missing')
 const tx=transport();const states=[]
 const conn=new api.OfficeConnection(pairing,{fetcher:tx.fetcher,onState:s=>states.push(s)})
 assert.equal(tx.calls.length,0)
 assert.deepEqual(await api.probeOfficeRelay(pairing,tx.fetcher),[selected.avatarId])
 await conn.start(selected)
 assert.equal(states.at(-1).phase,'fresh')
 assert.equal(states.at(-1).message,'Identitet verifierad · arbetsstatus okänd')
 assert(!JSON.stringify(states).includes('UNTRUSTED LABEL'))
 const reads=tx.calls.filter(c=>c.url.startsWith('/api/'))
 assert.equal(reads.length,2)
 assert(reads.some(c=>c.url===`/api/atlas/campus/agents/${AGENT}?projectId=${PROJECT}`))
 assert(reads.some(c=>c.url==='/api/atlas/campus/snapshot'))
 await conn.stop()
 assert(tx.calls.at(-1).url.endsWith('/disconnect'))
 assert.equal(states.at(-1).phase,'stopped')
})

test('expired authentication clears connection and never forwards source DTOs',async()=>{
 assert.equal(typeof api.OfficeConnection,'function','Office connection controller is missing')
 const tx=transport({auth:401});const states=[]
 const conn=new api.OfficeConnection(pairing,{fetcher:tx.fetcher,onState:s=>states.push(s)})
 await conn.start(selected)
 assert.equal(states.at(-1).phase,'unavailable')
 assert.equal(tx.calls.filter(c=>c.url.endsWith('/snapshot')&&c.url.startsWith('http')).length,0)
 assert(tx.calls.some(c=>c.url.endsWith('/disconnect')))
 await conn.stop()
})

test('stop aborts in-flight source requests; a late refresh cannot revive identity',async()=>{
 assert.equal(typeof api.OfficeConnection,'function','Office connection controller is missing')
 const tx=transport({hold:true});const states=[]
 const conn=new api.OfficeConnection(pairing,{fetcher:tx.fetcher,onState:s=>states.push(s)})
 const start=conn.start(selected)
 for(let n=0;n<15&&!tx.calls.some(c=>c.url.startsWith('/api/'));n++)await new Promise(r=>setTimeout(r,0))
 await conn.stop(); await start
 assert.equal(states.at(-1).phase,'stopped')
 assert(!states.some(s=>s.phase==='fresh'))
 assert.equal(tx.calls.filter(c=>c.url.endsWith('/snapshot')&&c.url.startsWith('http')).length,0)
})

test('invalid selections never leave the browser',async()=>{
 assert.equal(typeof api.OfficeConnection,'function','Office connection controller is missing')
 const tx=transport(); const conn=new api.OfficeConnection(pairing,{fetcher:tx.fetcher})
 for(const change of [{projectId:''},{agentId:'../admin'},{avatarId:'../file'}]){
  await assert.rejects(()=>conn.start({...selected,...change}))
 }
 assert.equal(tx.calls.length,0)
 await conn.stop()
})

test('source expiry clears the browser status even before the next refresh',async()=>{
 const tx=transport({presence:()=>({...present(),expires_at_unix:Date.now()/1000+0.08})})
 const states=[]
 const conn=new api.OfficeConnection(pairing,{fetcher:tx.fetcher,onState:s=>states.push(s)})
 try{
  await conn.start(selected)
  assert.equal(states.at(-1).phase,'fresh')
  await new Promise(r=>setTimeout(r,150))
  assert.equal(states.at(-1).phase,'unavailable')
  assert(tx.calls.some(c=>c.url.endsWith('/disconnect')))
 }finally{await conn.stop()}
})

test('only selected identity fields cross the local transport boundary',async()=>{
 const tx=transport(); const conn=new api.OfficeConnection(pairing,{fetcher:tx.fetcher})
 try{
  await conn.start(selected)
  const frame=JSON.parse(tx.calls.find(c=>c.url.startsWith('http')&&c.url.endsWith('/snapshot')).opts.body)
  assert.equal(frame.snapshot.projects.length,1)
  assert.equal(frame.snapshot.projects[0].agents.length,1)
  assert(!JSON.stringify(frame).includes('UNRELATED_'))
  assert(!JSON.stringify(frame).includes('PRIVATE_DESCRIPTION'))
 }finally{await conn.stop()}
})

test('duplicate selected project identities fail closed before forwarding',async()=>{
 const tx=transport({duplicate:true});const states=[]
 const conn=new api.OfficeConnection(pairing,{fetcher:tx.fetcher,onState:s=>states.push(s)})
 try{
  await conn.start(selected)
  assert.equal(states.at(-1).phase,'unavailable')
  assert(!tx.calls.some(c=>c.url.startsWith('http')&&c.url.endsWith('/snapshot')))
 }finally{await conn.stop()}
})

test('a cancelled computer probe aborts its pending request',async()=>{
 let aborted=false
 const abort=new AbortController()
 const fetcher=async(_,opts)=>new Promise((resolve,reject)=>{
  opts.signal.addEventListener('abort',()=>{aborted=true;reject(new DOMException('Aborted','AbortError'))},{once:true})
 })
 const pending=api.probeOfficeRelay(pairing,fetcher,abort.signal).catch(()=>null)
 abort.abort()
 try{
  await new Promise(r=>setTimeout(r,30))
  assert.equal(aborted,true)
 }finally{await pending}
})
