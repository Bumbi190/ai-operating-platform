/** Actual TS producer -> actual browser controller -> actual Python HTTP relay.
 * All source data/session behavior is synthetic. No real auth, DB, browser CORS,
 * native actor, model or voice is exercised by this test.
 */
import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {createServer} from 'node:http'
import {once} from 'node:events'
import {mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join,resolve} from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
import {createInterface} from 'node:readline'
import {OfficeConnection,probeOfficeRelay} from '../../apps/web/lib/atlas/office/connection.ts'
import {projectCampusSnapshot} from '../../apps/web/lib/atlas/campus/snapshot.ts'
import {resolveVerifiedAgentBinding} from '../../apps/web/lib/atlas/campus/verified-agent-binding.fixture.mjs'
const root=resolve(fileURLToPath(new URL('../..',import.meta.url)))
const output=await mkdtemp(join(tmpdir(),'omnira-office-transport-'))
const PROJECT='11111111-1111-4111-8111-111111111111',AGENT='22222222-2222-4222-8222-222222222222'
const avatar='office-familje-pling'
const model={operatorName:'Synthetic operator',availability:{projects:true,agents:true,activity:true},
 projects:[{id:PROJECT,slug:'synthetic-project',name:'Syntetiskt projekt',color:'#00aabb',href:null,runningRuns:1,
 agents:[{id:AGENT,name:'Syntetisk Pling',description:'PRIVATE_DESCRIPTION',model:'PRIVATE_MODEL',href:null,working:true}]}]}
let authenticated=true, sourceReads=0
const server=createServer((req,res)=>{
 sourceReads++
 res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store')
 if(!authenticated){res.statusCode=401;res.end('{"error":"Unauthorized"}');return}
 if(req.url==='/api/atlas/campus/snapshot')res.end(JSON.stringify(projectCampusSnapshot(model,new Date())))
 else if(req.url===`/api/atlas/campus/agents/${AGENT}?projectId=${PROJECT}`)res.end(JSON.stringify(resolveVerifiedAgentBinding(model,PROJECT,AGENT,new Date())))
 else{res.statusCode=404;res.end('{}')}
})
server.listen(0,'127.0.0.1');await once(server,'listening')
const origin='http://127.0.0.1:'+server.address().port
const python=spawn('python',['-u','-c',
 `import json,sys\nfrom pathlib import Path\nfrom office_relay import OfficeRelay\nr=OfficeRelay(Path(sys.argv[1]),avatars=('${avatar}',))\nr.start()\nprint(json.dumps({'port':r.port,'key':r.session_key}),flush=True)\nsys.stdin.readline()\nr.stop()`,output],
 {cwd:root,env:{...process.env,PYTHONPATH:join(root,'scripts','office-launcher')},stdio:['pipe','pipe','pipe']})
let controller=null
let childErrors=''
python.stderr.on('data',chunk=>{childErrors+=chunk.toString().slice(0,2000)})
try{
 const lines=createInterface({input:python.stdout})
 const first=await Promise.race([once(lines,'line'),once(python,'exit').then(()=>{throw Error('Relay exited before readiness')})])
 const pairing=JSON.parse(first[0]);lines.close()
 // Node has no browser Origin injection or relative-URL handling; emulate only these boundaries.
 const fetcher=(url,opts)=>fetch(url.startsWith('/api/')?origin+url:url,{
  ...opts,headers:{...opts.headers,...(url.startsWith('/api/')?{}:{Origin:'https://omniraos.se'})}})
 assert.deepEqual(await probeOfficeRelay(pairing,fetcher),[avatar])
 const states=[]
 controller=new OfficeConnection(pairing,{fetcher,onState:s=>states.push(s)})
 await controller.start({avatarId:avatar,projectId:PROJECT,agentId:AGENT})
 assert.equal(states.at(-1).phase,'fresh')
 const file=join(output,avatar+'.json')
 const fresh=JSON.parse(await readFile(file,'utf8'))
 assert.equal(fresh.identity,'verified');assert.equal(fresh.execution,'not_verified')
 assert.equal(fresh.agent_text,'Syntetisk Pling');assert.equal(fresh.work_verified,false)
 const persisted=await readFile(file,'utf8')
 assert(!persisted.includes('PRIVATE_'));assert(!persisted.includes(pairing.key))
 assert.equal(sourceReads,2)
 authenticated=false
 const deadline=Date.now()+11000
 while(Date.now()<deadline&&states.at(-1).phase!=='unavailable')await new Promise(r=>setTimeout(r,80))
 assert.equal(states.at(-1).phase,'unavailable')
 // Status transition precedes the best-effort disconnect write by a few milliseconds.
 let cleared
 for(let n=0;n<20;n++){
  cleared=JSON.parse(await readFile(file,'utf8'))
  if(cleared.identity==='unknown')break
  await new Promise(r=>setTimeout(r,40))
 }
 assert.equal(cleared.identity,'unknown')
 const proof={synthetic:true,real_auth:false,browser_cors:false,native_actor:false,
  path:'actual_ts_producers_to_actual_ts_controller_to_actual_python_http_to_safe_disk',
  identity:'verified_then_unknown_after_source_401',work_verified:false,sourceReads}
 await mkdir(join(root,'.superpowers/office-launcher-20261112'),{recursive:true})
 await writeFile(join(root,'.superpowers/office-launcher-20261112/transport-proof.json'),JSON.stringify(proof,null,2))
 console.log('PASS: real cross-language HTTP transport; synthetic identity verified; source 401 clears persisted identity; no execution or secret persisted.')
}finally{
 await controller?.stop()
 python.stdin.end('stop\n')
 await Promise.race([once(python,'exit'),new Promise(r=>setTimeout(r,3000))])
 if(python.exitCode===null)python.kill()
 await new Promise(r=>server.close(r))
 await rm(output,{recursive:true,force:true})
}
