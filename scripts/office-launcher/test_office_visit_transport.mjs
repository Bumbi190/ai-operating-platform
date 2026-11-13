/** Actual browser controller -> HTTP route boundary -> Python visit relay -> receiver/file.
 * Installed fixed bootstrap -> actual visit.main. Synthetic owner, DB rows, game lease and upstream HTTP socket; no real login/TLS/Unreal.
 */
import assert from 'node:assert/strict'
import {spawn,execFileSync} from 'node:child_process'
import {createServer} from 'node:http'
import {once} from 'node:events'
import {mkdtemp,readFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {fileURLToPath} from 'node:url'
import {createInterface} from 'node:readline'
import {createVisitHandlers} from '../../apps/web/lib/atlas/office/visits.ts'
import {OfficeVisitConnection,probeOfficeVisit} from '../../apps/web/lib/atlas/office/visit-connection.ts'
import {consumeOfficePairing} from '../../apps/web/lib/atlas/office/connection.ts'
const root=resolve(fileURLToPath(new URL('../..',import.meta.url)))
const output=await mkdtemp(join(tmpdir(),'omnira-office-visit-'))
const selection={avatarId:'office-familje-pling',projectId:'22222222-2222-4222-8222-222222222222',agentId:'33333333-3333-4333-8333-333333333333'}
let row=null,revoked=false,reads=0
const handlers=createVisitHandlers({owner:async()=>({ownerId:'11111111-1111-4111-8111-111111111111',sessionId:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'}),rpc:async(name,args)=>{
 const now=Date.now()
 if(name==='office_visit_create'){
  if(row)return null
  row={visitId:args.p_visit,...selection,createdAt:new Date(now).toISOString(),expiresAt:new Date(now+14400000).toISOString(),leaseUntil:new Date(now+30000).toISOString(),digest:args.p_digest}
  return row
 }
 if(!row||row.visitId!==args.p_visit||row.digest!==args.p_digest)return null
 if(name==='office_visit_revoke'){revoked=true;return true}
 if(revoked||Date.parse(row.leaseUntil)<=now)return null
 reads++;row.leaseUntil=new Date(now+30000).toISOString()
 return{...row,generatedAt:new Date(now).toISOString(),projectName:'Synthetic project',projectSlug:'synthetic',agentName:'Synthetic agent'}
}})
const server=createServer(async(req,res)=>{
 try{
  const chunks=[];for await(const chunk of req)chunks.push(chunk)
  const request=new Request('https://omniraos.se'+req.url,{method:req.method,headers:req.headers,body:Buffer.concat(chunks)})
  const method=req.url.endsWith('/presence')?'presence':req.url.endsWith('/revoke')?'revoke':'create'
  const result=await handlers[method](request)
  res.writeHead(result.status,Object.fromEntries(result.headers));res.end(await result.text())
 }catch{res.writeHead(500);res.end('{}')}
})
server.listen(0,'127.0.0.1');await once(server,'listening')
const port=server.address().port
const executable=process.env.OFFICE_TEST_PYTHON??'python'
const bundle=execFileSync(executable,['-B','-c',`
import sys
from pathlib import Path
sys.path.insert(0,sys.argv[1])
from office_entry_install import prepare_bundle
print(prepare_bundle(Path(sys.argv[1]),Path(sys.argv[2])))
`,join(root,'scripts','office-launcher'),join(output,'installed')],{encoding:'utf8'}).trim()
const python=spawn(executable,['-I','-B','-u','-c',`
import http.client,json,sys,threading,runpy
from pathlib import Path
from urllib.parse import urlsplit,parse_qs
entry=runpy.run_path(str(Path(sys.argv[3])/'office_entry.py'))
base=entry['verify_bundle']();sys.path.insert(0,str(base))
import office_visit
class Lease:
 live=True
 def alive(self):return self.live
 def close(self):pass
class Client:
 def call(self,path,visit,secret):
  c=http.client.HTTPConnection('127.0.0.1',int(sys.argv[2]),timeout=3)
  try:
   c.request('POST','/api/atlas/office/visits/'+path,json.dumps({'visitId':visit}),{'Content-Type':'application/json','X-Omnira-Office-Visit':secret})
   r=c.getresponse();data=r.read()
   if r.status!=200:raise RuntimeError('Fixture denied')
   return json.loads(data)
  finally:c.close()
 def presence(self,visit,secret,permitted):
  if not permitted():raise RuntimeError('Stopped')
  return self.call('presence',visit,secret)
 def revoke(self,visit,secret):return self.call('revoke',visit,secret)
lease=Lease()
office_visit.default_target=lambda:None
office_visit.check_native=lambda target:Path(sys.argv[1])
office_visit.WindowsBackend=lambda:None
office_visit.acquire_office_process=lambda target,backend:lease
office_visit.OfficeVisitClient=Client
def open_fixture(url):
 values=parse_qs(urlsplit(url).fragment)
 print(json.dumps({'port':int(values['officePort'][0]),'key':values['officeKey'][0],'bundledEntry':True}),flush=True)
 return True
office_visit.webbrowser.open=open_fixture
def close_game():sys.stdin.readline();lease.live=False
threading.Thread(target=close_game,daemon=True).start()
raise SystemExit(entry['main'](['omnira-office://visit']))
`,output,String(port),bundle],{cwd:root,env:{...process.env,PYTHONPATH:'ignored-by-isolated-entry'},stdio:['pipe','pipe','pipe']})
let controller=null,errors=''
python.stderr.on('data',chunk=>errors+=chunk.toString().slice(0,2000))
const waitFor=async(test,ms=11000)=>{const end=Date.now()+ms;while(!await test()&&Date.now()<end)await new Promise(r=>setTimeout(r,50));assert(await test())}
try{
 const lines=createInterface({input:python.stdout})
 const first=await Promise.race([once(lines,'line'),once(python,'exit').then(()=>{throw Error('Fixture relay failed')})]);lines.close()
 const paired=JSON.parse(first[0]);assert.equal(paired.bundledEntry,true);let scrubbed=false
 const pair=consumeOfficePairing({hash:'#officePort='+paired.port+'&officeKey='+paired.key+'&officeVisit=2',pathname:'/atlas/office/connect',search:''},{state:null,replaceState(){scrubbed=true}})
 assert.equal(pair.protocol,2);assert(scrubbed)
 const browserCalls=[]
 const fetcher=(url,opts)=>{browserCalls.push(url);return fetch(url.startsWith('/api/')?'http://127.0.0.1:'+port+url:url,{...opts,headers:{...opts.headers,Origin:'https://omniraos.se'}})}
 assert.deepEqual(await probeOfficeVisit(pair,fetcher),['office-familje-pling'])
 const states=[];controller=new OfficeVisitConnection(pair,{fetcher,onState:s=>states.push(s)})
 await controller.start(selection);assert.equal(states.at(-1).phase,'fresh')
 const path=join(output,'office-familje-pling.json'),initial=JSON.parse(await readFile(path,'utf8'))
 assert.equal(initial.identity,'verified');assert.equal(initial.agent_text,'Synthetic agent');assert.equal(initial.work_verified,false)
 controller.detach();assert.equal(states.at(-1).phase,'detached');const count=browserCalls.length
 await waitFor(()=>reads>=2)
 await waitFor(async()=>JSON.parse(await readFile(path,'utf8')).expires_at_unix>initial.expires_at_unix)
 const next=JSON.parse(await readFile(path,'utf8'))
 assert(next.expires_at_unix>initial.expires_at_unix);assert.equal(next.identity,'verified')
 assert.equal(browserCalls.length,count,'Detached browser continued transporting data');assert.equal(revoked,false)
 const done=once(python,'exit');python.stdin.end('\n');await done
 assert.equal(errors,'');assert.equal(revoked,true)
 assert.equal(JSON.parse(await readFile(path,'utf8')).identity,'unknown')
 const stoppedReads=reads;await new Promise(r=>setTimeout(r,300));assert.equal(reads,stoppedReads)
 console.log(JSON.stringify({status:'synthetic_bundled_entry_visit_transport_verified',nativeReads:reads,browserDetached:true,gameExitCleared:true,realOwner:false,realUnreal:false}))
}finally{
 controller?.detach()
 if(python.exitCode===null){python.stdin.end('\n');await Promise.race([once(python,'exit'),new Promise(r=>setTimeout(r,6000))]);if(python.exitCode===null)python.kill()}
 server.close();await once(server,'close');await rm(output,{recursive:true,force:true})
}
