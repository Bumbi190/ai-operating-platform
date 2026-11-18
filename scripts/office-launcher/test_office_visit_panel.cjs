// Actual component + actual visit controller; synthetic HTTPS/loopback transport.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),Module=require('node:module'),path=require('node:path')
const root=path.resolve(__dirname,'../..'),P='22222222-2222-4222-8222-222222222222',A='33333333-3333-4333-8333-333333333333',AV='office-familje-pling',V='019a7d46-1222-7000-8000-000000000001'
const tick=()=>new Promise(r=>setImmediate(r))
function harness(hold=false){
 const slots=[],events=new Map(),calls=[];let index=0,mounted=false,cleanup,created=false,finish,rejectModule=false
 const hooks={useRef:v=>{const k=index++;return slots[k]??={current:v}},useState:v=>{const k=index++;if(!(k in slots))slots[k]=v;return[slots[k],v=>slots[k]=v]},useEffect:fn=>{if(!mounted)cleanup=fn()}}
 global.window={location:{},history:{},addEventListener:(n,f)=>events.set(n,f),removeEventListener(){}}
 global.document={hidden:false,addEventListener:(n,f)=>events.set(n,f),removeEventListener(){}}
 global.fetch=async(url,opts)=>{
  calls.push(url)
  if(url.endsWith('/status'))return Response.json({protocol:2,avatars:[AV],visitId:V,secretDigest:'a'.repeat(64),acknowledged:created,
   presence:created?{schema:'omnira.office.private-presence.v1',avatar_id:AV,identity:'verified',data_state:'fresh',execution:'not_verified',work_verified:false,expires_at_unix:Date.now()/1000+19}:null,
   expiresAt:new Date(Date.now()+14400000).toISOString(),leaseUntil:new Date(Date.now()+30000).toISOString()})
  if(url.endsWith('/visits')){if(hold)await new Promise(r=>finish=r);created=true;return Response.json({visitId:V,avatarId:AV,projectId:P,agentId:A})}
  if(url.endsWith('/attach'))return Response.json({protocol:2,visitId:V,committed:true})
  return Response.json({revoked:true})
 }
 const modules={}
 function load(rel){
  const file=path.join(root,rel);if(modules[file])return modules[file].exports
  const m=new Module(file,module);modules[file]=m;m.paths=Module._nodeModulePaths(path.dirname(file));const original=m.require.bind(m)
  m.require=id=>id==='react'?hooks:id==='@/lib/atlas/office/connection'?{
   consumeOfficePairing:()=>({port:42123,key:'x'.repeat(43),protocol:2}),
   probeOfficeRelay:async()=>{throw Error('Legacy relay chosen for visit')},OfficeConnection:class{constructor(){throw Error('Legacy connection chosen for visit')}}
  }:id==='@/lib/atlas/office/visit-connection'?(rejectModule?(()=>{throw Error('Chunk failed')})():load('apps/web/lib/atlas/office/visit-connection.ts')):original(id)
  m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,file)
  return m.exports
 }
 const panel=load('apps/web/app/(office-private)/atlas/office/connect/OfficeConnectionPanel.tsx')
 function render(){index=0;const tree=panel.OfficeConnectionPanel({projects:[{id:P,name:'Synthetic project',agents:[{id:A,name:'Synthetic agent'}]}],authenticated:true,sourceAvailable:true});mounted=true
  const nodes=[];function walk(x){if(Array.isArray(x))return x.forEach(walk);if(!x?.props)return;nodes.push(x);walk(x.props.children)}walk(tree)
  return{buttons:nodes.filter(x=>x.type==='button').map(x=>x.props),selects:nodes.filter(x=>x.type==='select').map(x=>x.props),status:nodes.find(x=>x.props.role==='status').props.children}
 }
 return{render,calls,async prepare(){render();render().buttons[0].onClick();await tick();for(const[i,v]of[AV,P,A].entries())render().selects[i].onChange({target:{value:v}})},rejectModule(){rejectModule=true},hide(){document.hidden=true;events.get('visibilitychange')?.()},finish(){finish?.()},cleanup(){cleanup?.()}}
}
test('visit panel permits closing only after native acknowledgement and keeps explicit disconnect',async()=>{
 const h=harness();try{await h.prepare();h.render().buttons[1].onClick();await tick()
  assert.match(h.render().status,/du kan stänga sidan/);h.hide();await tick()
  assert.match(h.render().status,/Office sköter/);assert(!h.calls.some(x=>x.endsWith('/revoke')))
  assert.equal(h.render().buttons[2].disabled,false);h.render().buttons[2].onClick();await tick()
  assert.match(h.render().status,/Frånkopplad/);assert(h.calls.some(x=>x.endsWith('/revoke')))
 }finally{h.cleanup()}
})
test('visit panel hidden during pending approval cannot attach when response arrives later',async()=>{
 const h=harness(true);try{await h.prepare();h.render().buttons[1].onClick();await tick();h.hide();h.finish();await tick()
  assert(!h.calls.some(x=>x.endsWith('/attach')));assert(h.calls.some(x=>x.endsWith('/revoke')));assert.doesNotMatch(h.render().status,/du kan stänga sidan/)
 }finally{h.finish();h.cleanup()}
})
test('failed visit module download leaves a recoverable disconnected panel',async()=>{
 const h=harness();try{await h.prepare();h.rejectModule();h.render().buttons[1].onClick();await tick()
  assert.match(h.render().status,/kunde inte kopplas/);assert.equal(h.render().buttons[0].disabled,false)
 }finally{h.cleanup()}
})
