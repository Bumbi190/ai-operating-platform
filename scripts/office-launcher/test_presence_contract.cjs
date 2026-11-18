// Run actual existing pure Campus producers using synthetic identities only.
// Marker-only server-only imports are neutralized for this isolated pure-function test.
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const Module = require('node:module')
const ts = require('typescript')
const campus = process.argv[2]
const output = process.argv[3]
if (!campus || !output) throw Error('Expected existing Campus root and test output directory')
const sourceDir = path.join(campus, 'apps/web/lib/atlas/campus')
const allowed = new Set(['snapshot.ts', 'verified-agent-binding.ts', 'voice-identity.ts'])
const hashes = {}
function load(name) {
  if (!allowed.has(name)) throw Error('Unexpected producer dependency: '+name)
  const file = path.join(sourceDir, name)
  const source = fs.readFileSync(file,'utf8')
  hashes[name] = crypto.createHash('sha256').update(source).digest('hex')
  const compiled = new Module(file,module)
  compiled.filename=file
  const standardRequire=Module.createRequire(file)
  compiled.require=request=>{
    if(request==='server-only') return {}
    if(request.startsWith('./')) return load(request.slice(2)+'.ts')
    return standardRequire(request)
  }
  compiled._compile(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,file)
  return compiled.exports
}
const { resolveVerifiedAgentBinding }=load('verified-agent-binding.ts')
const { projectCampusSnapshot }=load('snapshot.ts')
const projectId='11111111-1111-4111-8111-111111111111'
const agentId='22222222-2222-4222-8222-222222222222'
const stamp='2026-11-12T14:50:00.000Z'
const agent={id:agentId,name:'Testagent',description:'Syntetisk provagent',model:'test',href:'/projects/synthetic-project/agents/'+agentId,working:true}
const model={operatorName:'Synthetic test',availability:{projects:true,agents:true,activity:true},projects:[{id:projectId,name:'Testprojekt',slug:'synthetic-project',color:'#336699',href:'/projects/synthetic-project',agents:[agent],runningRuns:7}]}
const step={projectId,agentId,runId:'33333333-3333-4333-8333-333333333333',stepOrder:2,kind:'step_request_waiting_for_reply',label:'Synthetic log indication',observedAt:stamp,leaseUntil:'2026-11-12T14:51:00.000Z',source:'claimed_run_and_step_log'}
const binding=resolveVerifiedAgentBinding(model,projectId,agentId,new Date(stamp))
const snapshot=projectCampusSnapshot(model,new Date(stamp),new Map([[projectId+':'+agentId,step]]))
if(!binding || !snapshot) throw Error('Existing producer rejected synthetic fixture')
fs.mkdirSync(output,{recursive:true})
for(const [name,value] of Object.entries({binding,snapshot,sourceProof:{synthetic:true,hashes}})){
  fs.writeFileSync(path.join(output,name+'.json'),JSON.stringify(value,null,2))
}
console.log('PASS: actual binding V036 and snapshot v2 producers emitted synthetic DTOs; no backend/model calls.')
