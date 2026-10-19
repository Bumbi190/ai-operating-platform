import {EventEmitter} from 'node:events'
import {PassThrough,Writable} from 'node:stream'
import {describe,it,expect} from 'vitest'

const flush=async()=>{for(let n=0;n<20;n++)await Promise.resolve();await new Promise(r=>setImmediate(r))}
async function launcherModule(){const m=await import('../../../code-broker/src/isolation/windows/controlled-helper').catch(()=>({})) as any;expect(m.createControlledLauncher).toBeTypeOf('function');return m}

/** Fake child with real streams: the test plays the native helper. */
class FakeChild extends EventEmitter{
 stdout=new PassThrough();stderr=new PassThrough();written:string[]=[];ended=0;kills=0;pid=4242
 stdin=new Writable({write:(chunk,_e,cb)=>{this.written.push(chunk.toString('utf8'));cb()},final:cb=>{this.ended++;cb()}})
 kill(){this.kills++;return true}
 line(v:unknown){this.stdout.write(typeof v==='string'?v:JSON.stringify(v)+'\n')}
 close(code:number|null=0){this.stdout.end();this.stderr.end();setImmediate(()=>this.emit('close',code))}
}
const PHASES=['before_resources','before_volume_create','before_container_create','before_upload','before_start','before_report']
const payload={schema:'sdf.windows_materialization_request.v1',workId:'c435e423-d964-428b-b5c0-4060d89ce3c6',attemptId:'11111111-1111-4111-8111-111111111111'}
function harness(m:any,over:any={}){
 const child=new FakeChild(),spawns:any[]=[],seen:[number,string][]=[]
 const launch=m.createControlledLauncher({platform:'win32',checkBootstrap:()=>{},spawn:(...a:any[])=>{spawns.push(a);return child},...over})
 const launched=launch(payload,{checkpoint:(seq:number,phase:string)=>seen.push([seq,phase])})
 return{child,spawns,seen,launched}
}
const checkpoint=(seq:number,phase=PHASES[seq-1])=>({t:'checkpoint',seq,phase})
const report={t:'report',report:{schema:'sdf.windows_materialization_report.v1',status:'stopped'}}

describe('controlled helper framing and spawn',()=>{
 it('refuses before spawning on platform, bootstrap or payload problems',async()=>{
  const m=await launcherModule()
  for(const [over,reason,body] of [[{platform:'linux'},'unsupported_platform',payload],[{checkBootstrap:()=>{throw Error('hash')}},'helper_unavailable',payload],[{},'input_invalid',{pad:'x'.repeat(4100)}],[{},'input_invalid',undefined]] as const){
   const spawns:any[]=[];const launch=m.createControlledLauncher({platform:'win32',checkBootstrap:()=>{},spawn:(...a:any[])=>{spawns.push(a);return new FakeChild()},...over})
   expect(launch(body,{checkpoint:()=>{}})).toEqual({status:'unavailable',reason});expect(spawns).toHaveLength(0)
  }
 })
 it('spawns the fixed runtime detached without shell, PATH or caller environment and keeps stdin open',async()=>{
  const m=await launcherModule(),h=harness(m)
  expect(h.launched.status).toBe('launched');expect(h.spawns).toHaveLength(1)
  const [file,args,opts]=h.spawns[0]
  expect(file).toBe('C:\\Program Files\\dotnet\\dotnet.exe');expect(args).toHaveLength(2);expect(args[0]).toMatch(/[\\/]\.native[\\/]windows-workspace[\\/]OmniraBrokerWorkspace\.dll$/);expect(args[1]).toBe('materialize-fixture')
  expect(opts).toEqual({shell:false,windowsHide:true,detached:true,stdio:['pipe','pipe','pipe'],env:{NODE_ENV:'production',SystemRoot:'C:\\Windows',WINDIR:'C:\\Windows',PATH:'C:\\Windows\\System32',DOTNET_MULTILEVEL_LOOKUP:'0',DOTNET_CLI_TELEMETRY_OPTOUT:'1',DOTNET_NOLOGO:'1'}})
  await flush();expect(h.child.written).toEqual([JSON.stringify(payload)+'\n']);expect(h.child.ended).toBe(0)
  expect(h.launched.process.pid).toBe(4242);h.child.close(1);await h.launched.process.done
 })
 it('delivers ordered checkpoints, writes exact continue lines and the report only at a clean exit',async()=>{
  const m=await launcherModule(),h=harness(m),p=h.launched.process
  let settled=false;p.done.then(()=>{settled=true})
  for(let s=1;s<=6;s++){h.child.line(checkpoint(s));await flush();p.continue(s)}
  expect(h.seen).toEqual(PHASES.map((x,i)=>[i+1,x]))
  expect(h.child.written.slice(1)).toEqual([1,2,3,4,5,6].map(s=>'{"t":"continue","seq":'+s+'}\n'))
  h.child.line(report);await flush();expect(settled).toBe(false)
  h.child.close(0);expect(await p.done).toEqual({kind:'report',value:report.report});expect(h.child.kills).toBe(0)
 })
 const violations:[string,(c:FakeChild)=>void][]=[
  ['wrong first seq',c=>c.line(checkpoint(2,'before_resources'))],
  ['repeated phase',c=>{c.line(checkpoint(1));c.line(checkpoint(2,'before_resources'))}],
  ['backwards phase',c=>{c.line(checkpoint(1,'before_volume_create'));c.line(checkpoint(2,'before_resources'))}],
  ['unknown phase',c=>c.line(checkpoint(1,'before_publish'))],
  ['extra key',c=>c.line({...checkpoint(1),scope:'all'})],
  ['duplicate key',c=>c.line('{"t":"checkpoint","seq":1,"seq":1,"phase":"before_resources"}\n')],
  ['invalid utf8',c=>c.stdout.write(Buffer.from([0x7b,0x22,0xff,0x22,0x7d,0x0a]))],
  ['oversized checkpoint line',c=>c.line({...checkpoint(1),phase:'before_resources'+' '.repeat(300)})],
  ['not json',c=>c.line('checkpoint 1\n')],
  ['unknown frame type',c=>c.line({t:'publish',seq:1})],
  ['string seq',c=>c.line({t:'checkpoint',seq:'1',phase:'before_resources'})],
  ['frame after report',c=>{c.line(report);c.line(checkpoint(1))}],
  ['second report',c=>{c.line(report);c.line(report)}],
  ['trailing partial line',c=>c.stdout.write('{"t":"report"')],
 ]
 for(const [name,act] of violations)it('fails closed on '+name+' and asks the child to stop',async()=>{
  const m=await launcherModule(),h=harness(m),p=h.launched.process;act(h.child);await flush();h.child.close(0)
  expect(await p.done).toEqual({kind:'violation',reason:'frame_invalid'});expect(h.seen.length).toBeLessThanOrEqual(1)
  // A trailing partial line is only detectable once the child has already exited; there is nothing left to stop.
  const live=name!=='trailing partial line'
  expect(h.child.written.filter(w=>w==='{"t":"stop"}\n')).toHaveLength(live?1:0);expect(h.child.ended).toBe(live?1:0);expect(h.child.written.some(w=>w.includes('continue'))).toBe(false)
 })
 it('treats any stderr byte as a violation',async()=>{const m=await launcherModule(),h=harness(m);h.child.stderr.write('x');h.child.line(report);await flush();h.child.close(0);expect(await h.launched.process.done).toEqual({kind:'violation',reason:'stderr_output'})})
 it('refuses unbounded output',async()=>{const m=await launcherModule(),h=harness(m);h.child.stdout.write('x'.repeat(270000));await flush();h.child.close(0);expect(await h.launched.process.done).toEqual({kind:'violation',reason:'output_too_large'})})
 it('reports exit without report and a report with a failing exit code as violations',async()=>{
  const m=await launcherModule()
  const a=harness(m);a.child.line(checkpoint(1));await flush();a.child.close(null);expect(await a.launched.process.done).toEqual({kind:'violation',reason:'exited_without_report'})
  const b=harness(m);b.child.line(report);await flush();b.child.close(1);expect(await b.launched.process.done).toEqual({kind:'violation',reason:'exited_without_report'})
 })
 it('maps a spawn error to spawn_failed',async()=>{const m=await launcherModule(),h=harness(m);h.child.emit('error',Object.assign(Error('ENOENT'),{code:'ENOENT'}));expect(await h.launched.process.done).toEqual({kind:'violation',reason:'spawn_failed'})})
 it('makes stop idempotent, ignores continue after stop and kills only its own live child once',async()=>{
  const m=await launcherModule(),h=harness(m),p=h.launched.process;h.child.line(checkpoint(1));await flush()
  p.stop();p.stop();p.continue(1);await flush()
  expect(h.child.written.slice(1)).toEqual(['{"t":"stop"}\n']);expect(h.child.ended).toBe(1)
  p.kill();p.kill();expect(h.child.kills).toBe(1);h.child.close(null);await p.done;p.kill();expect(h.child.kills).toBe(1)
 })
 it('never writes after the child stdin errors',async()=>{const m=await launcherModule(),h=harness(m),p=h.launched.process;h.child.stdin.destroy(Object.assign(Error('EPIPE'),{code:'EPIPE'}));await flush();expect(()=>{p.continue(1);p.stop()}).not.toThrow();h.child.close(null);expect((await p.done).kind).toBe('violation')})
})
