// Actual component handlers with a deterministic React hook harness; transport is synthetic.
const {test}=require('node:test'),assert=require('node:assert/strict')
const fs=require('node:fs'),ts=require('typescript'),Module=require('node:module'),path=require('node:path')
const root=path.resolve(__dirname,'../..')
const PROJECT='11111111-1111-4111-8111-111111111111',AGENT='22222222-2222-4222-8222-222222222222',AVATAR='office-familje-pling'
const tick=()=>new Promise(resolve=>setImmediate(resolve))
function harness(){
 const slots=[];let index=0,mounted=false,probeCount=0,finishProbe,controller,probeAborted=false,cleanup
 const listeners=new Map()
 const hooks={
  useRef:value=>{const k=index++;return slots[k]??=({current:value})},
  useState:value=>{const k=index++;if(!(k in slots))slots[k]=value;return[slots[k],next=>slots[k]=next]},
  useEffect:effect=>{if(!mounted)cleanup=effect()},
 }
 global.window={location:{},history:{},addEventListener:(n,fn)=>listeners.set(n,fn),removeEventListener(){}}
 global.document={hidden:false,addEventListener:(n,fn)=>listeners.set(n,fn),removeEventListener(){}}
 const fake={consumeOfficePairing:()=>({key:'x'.repeat(43),port:42123}),
  probeOfficeRelay:async(_pair,_fetch,signal)=>{
   if(++probeCount===2){signal?.addEventListener('abort',()=>{probeAborted=true},{once:true});await new Promise(r=>finishProbe=r)}
   return [AVATAR]
  },OfficeConnection:class{
   constructor(_,opts){this.opts=opts;controller=this}
   async start(){this.running=true;this.opts.onState({phase:'fresh',message:'identity fresh'})}
   async stop(){this.running=false;this.opts.onState({phase:'stopped',message:'stopped'})}
  }}
 const file=path.join(root,'apps/web/app/(office-private)/atlas/office/connect/OfficeConnectionPanel.tsx')
 const m=new Module(file,module);m.paths=Module._nodeModulePaths(path.dirname(file))
 const original=m.require.bind(m);m.require=id=>id==='react'?hooks:id==='@/lib/atlas/office/connection'?fake:original(id)
 m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,file)
 function render(){
  index=0
  const tree=m.exports.OfficeConnectionPanel({projects:[{id:PROJECT,name:'Synthetic',agents:[{id:AGENT,name:'Synthetic'}]}],authenticated:true,sourceAvailable:true})
  mounted=true
  const items=[];function walk(x){if(Array.isArray(x))return x.forEach(walk);if(!x?.props)return;items.push(x);walk(x.props.children)}walk(tree)
  return{buttons:items.filter(x=>x.type==='button').map(x=>x.props),selects:items.filter(x=>x.type==='select').map(x=>x.props),status:items.find(x=>x.props.role==='status').props.children}
 }
 async function prepare(){render();render().buttons[0].onClick();await tick();for(const [i,value]of[AVATAR,PROJECT,AGENT].entries())render().selects[i].onChange({target:{value}})}
 return{render,prepare,get controller(){return controller},finish:()=>finishProbe?.(),hidden(){document.hidden=true;listeners.get('visibilitychange')?.()},get aborted(){return probeAborted},unmount:()=>cleanup?.()}
}

test('probe and bind cannot overlap; late probe never hides a running connection',async()=>{
 const h=harness();await h.prepare()
 try{
  h.render().buttons[0].onClick()
  assert.equal(h.render().buttons[1].disabled,true)
  h.render().buttons[1].onClick() // Handler guard must also reject a stale/programmatic event.
  await tick();assert.equal(h.controller,undefined)
  h.finish();await tick()
  h.render().buttons[1].onClick();await tick()
  assert.equal(h.controller.running,true)
  assert.equal(h.render().buttons[2].disabled,false)
 }finally{h.finish();h.unmount()}
})

test('hiding the page aborts a pending probe and ignores its eventual callback',async()=>{
 const h=harness();await h.prepare()
 try{
  h.render().buttons[0].onClick();h.hidden()
  assert.equal(h.aborted,true)
  h.finish();await tick()
  assert(!h.render().status.includes('Datorn är ansluten'))
 }finally{h.finish();h.unmount()}
})
