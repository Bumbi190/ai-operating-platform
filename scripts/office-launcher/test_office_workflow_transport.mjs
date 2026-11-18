/** Browser/controller -> real HTTP handlers -> real loopback relay -> receiver/atomic file.
 * Owner/DB RPC, upstream HTTP socket and game-process lease are synthetic.
 * No installed bootstrap, genuine login/TLS or Unreal gameplay is claimed.
 */
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {spawn} from 'node:child_process'
import {createServer} from 'node:http'
import {once} from 'node:events'
import {mkdtemp,readFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {createInterface} from 'node:readline'
import {OfficeVisitConnection,probeOfficeVisitCapabilities} from '../../apps/web/lib/atlas/office/visit-connection.ts'
import {consumeOfficePairing} from '../../apps/web/lib/atlas/office/connection.ts'
const require=createRequire(import.meta.url),ts=require('typescript'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),cache={}
function load(file){if(cache[file])return cache[file].exports;const m={exports:{}};cache[file]=m;const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;vm.runInThisContext('(function(require,module,exports){'+code+'\n})',{filename:file})(id=>id.startsWith('.')?load(path.resolve(path.dirname(file),id+'.ts')):require(id),m,m.exports);return m.exports}
const root=resolve(fileURLToPath(new URL('../..',import.meta.url))),output=await mkdtemp(join(tmpdir(),'omnira-workflow-visit-'))
const selection={avatarId:'office-familje-pling',projectId:'22222222-2222-4222-8222-222222222222',agentId:'33333333-3333-4333-8333-333333333333'}
const {createWorkflowVisitHandlers}=load(join(root,'apps/web/lib/atlas/office/workflow-visits.ts'))
const {createVisitHandlers}=load(join(root,'apps/web/lib/atlas/office/visits.ts'))
let row=null,revoked=false,reads=0,state='idle',revision=0
const rpc=async(name,args)=>{const now=Date.now();if(name==='office_visit_workflow_create'){if(row)return null;row={visitId:args.p_visit,...selection,readScope:'workflow_state_v1',nativeWorkflowProtocol:1,createdAt:new Date(now).toISOString(),expiresAt:new Date(now+14400000).toISOString(),leaseUntil:new Date(now+30000).toISOString(),digest:args.p_digest};return row}
 if(!row||row.visitId!==args.p_visit||(args.p_digest!==row.digest&&name!=='office_visit_revoke'))return null
 if(name==='office_visit_revoke'){revoked=true;return true}if(revoked||Date.parse(row.leaseUntil)<=now)return null
 assert.equal(name,'office_visit_workflow_presence');reads++;row.leaseUntil=new Date(now+30000).toISOString()
 return{...row,generatedAt:new Date(now).toISOString(),workflowRevision:++revision,workflowFacts:{complete:true,runs:state==='idle'?[]:[{id:'44444444-4444-4444-8444-444444444444',project_id:selection.projectId,status:'pending',claim_id:null,claimed_at:null,lease_until:null,finished_at:null,cancel_requested:false,reconciliation_required:false,steps_snapshot:[{order:0,agent_id:selection.agentId,prompt:'SECRET_STEP'}]}]}}}
const deps={enabled:()=>true,owner:async()=>({ownerId:'11111111-1111-4111-8111-111111111111',sessionId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}),rpc}
const handlers=createWorkflowVisitHandlers(deps),legacy=createVisitHandlers(deps)
const server=createServer(async(req,res)=>{try{const chunks=[];for await(const c of req)chunks.push(c);const request=new Request('https://omniraos.se'+req.url,{method:req.method,headers:req.headers,body:Buffer.concat(chunks)});const handler=req.url==='/api/atlas/office/visits/workflow'?handlers.create:req.url==='/api/atlas/office/visits/workflow/presence'?handlers.presence:req.url==='/api/atlas/office/visits/revoke'?legacy.revoke:null;const result=handler?await handler(request):new Response('{}',{status:404});res.writeHead(result.status,Object.fromEntries(result.headers));res.end(await result.text())}catch{res.writeHead(500);res.end('{}')}})
server.listen(0,'127.0.0.1');await once(server,'listening')
const port=server.address().port,executable=process.env.OFFICE_TEST_PYTHON??'python'
const python=spawn(executable,['-I','-B','-u','-c',`
import http.client,json,sys,threading
from pathlib import Path
sys.path.insert(0,sys.argv[1])
from office_visit_relay import OfficeVisitRelay
class Lease:
 live=True
 def alive(self):return self.live
class Client:
 def call(self,path,visit,secret):
  c=http.client.HTTPConnection('127.0.0.1',int(sys.argv[3]),timeout=3)
  try:
   c.request('POST','/api/atlas/office/visits/'+path,json.dumps({'visitId':visit}),{'Content-Type':'application/json','X-Omnira-Office-Visit':secret})
   r=c.getresponse();data=r.read()
   if r.status!=200:raise RuntimeError('Fixture denied')
   return json.loads(data)
  finally:c.close()
 def workflow_presence(self,visit,secret,permitted):
  if not permitted():raise RuntimeError('Stopped')
  return self.call('workflow/presence',visit,secret)
 def presence(self,*args):raise RuntimeError('No scope fallback allowed')
 def revoke(self,visit,secret):return self.call('revoke',visit,secret)
lease=Lease();relay=OfficeVisitRelay(Path(sys.argv[2]),lease,Client(),workflow=True)
try:
 relay.start();print(json.dumps({'port':relay.port,'key':relay.session_key}),flush=True)
 def close_game():sys.stdin.readline();lease.live=False
 threading.Thread(target=close_game,daemon=True).start()
 while not relay._halt.wait(.1):pass
finally:relay.stop()
`,join(root,'scripts/office-launcher'),output,String(port)],{cwd:root,stdio:['pipe','pipe','pipe']})
let controller=null,errors='';python.stderr.on('data',c=>errors+=c.toString().slice(0,2000))
const waitFor=async(test,ms=20000)=>{const end=Date.now()+ms;while(!await test()&&Date.now()<end)await new Promise(r=>setTimeout(r,50));assert(await test())}
try{
 const lines=createInterface({input:python.stdout});const first=await Promise.race([once(lines,'line'),once(python,'exit').then(()=>{throw Error('Fixture relay failed: '+errors)})]);lines.close()
 const paired=JSON.parse(first[0]);let scrubbed=false
 const pair=consumeOfficePairing({hash:'#officePort='+paired.port+'&officeKey='+paired.key+'&officeVisit=2',pathname:'/atlas/office/connect',search:''},{state:null,replaceState(){scrubbed=true}});assert(scrubbed)
 const calls=[],fetcher=(url,opts)=>{calls.push(url);return fetch(url.startsWith('/api/')?'http://127.0.0.1:'+port+url:url,{...opts,headers:{...opts.headers,Origin:'https://omniraos.se'}})}
 assert.equal((await probeOfficeVisitCapabilities(pair,fetcher)).workflowAvailable,true)
 const states=[];controller=new OfficeVisitConnection(pair,{fetcher,workflow:true,onState:s=>states.push(s)});await controller.start(selection);assert.equal(states.at(-1).phase,'fresh')
 const file=join(output,selection.avatarId+'.json'),frame=()=>readFile(file,'utf8').then(JSON.parse)
 const initial=await frame();assert.equal(initial.schema,'omnira.office.workflow-presence.v1');assert.equal(initial.workflow_state,'idle');assert.equal(initial.workflow_busy,false);assert.equal(initial.project_id,selection.projectId);assert.equal(initial.agent_id,selection.agentId)
 controller.detach();const browserCount=calls.length;assert.equal(states.at(-1).phase,'detached')
 state='busy';await waitFor(async()=>reads>=2&&(await frame()).workflow_state==='busy');const busy=await frame();assert(busy.workflow_busy);assert(busy.workflow_state_known);assert(busy.revision>initial.revision)
 state='idle';await waitFor(async()=>reads>=3&&(await frame()).workflow_state==='idle');const idle=await frame();assert(!idle.workflow_busy);assert(idle.revision>busy.revision);assert.equal(calls.length,browserCount,'Detached browser continued transporting data');assert.equal(revoked,false);assert(!(JSON.stringify(idle)).includes('SECRET_'))
 const done=once(python,'exit');python.stdin.end('\n');const[code]=await done;assert.equal(code,0);assert.equal(errors,'');assert.equal(revoked,true)
 const stopped=await frame();assert.equal(stopped.identity,'unknown');assert.equal(stopped.workflow_state,'unknown');assert(stopped.workflow_busy);assert(!stopped.workflow_state_known)
 const finalReads=reads;await new Promise(r=>setTimeout(r,300));assert.equal(reads,finalReads)
 console.log(JSON.stringify({status:'synthetic_workflow_visit_transport_verified',nativeReads:reads,browserDetached:true,busyThenIdle:true,gameExitClearedToHold:true,realOwner:false,realTls:false,realUnreal:false}))
}finally{controller?.detach();if(python.exitCode===null){python.stdin.end('\n');await Promise.race([once(python,'exit'),new Promise(r=>setTimeout(r,6000))]);if(python.exitCode===null)python.kill()}server.close();await once(server,'close');await rm(output,{recursive:true,force:true})}
