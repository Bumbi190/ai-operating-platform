/**
 * Database-free host identity regression suite.
 * Replays the fixture's injected qualification tests without starting Docker,
 * touching the network, using production credentials, or changing its native
 * host identity lock. The full Windows PostgreSQL suite remains separate.
 */
import {afterAll,describe,it,expect} from 'vitest'
import {mkdtempSync,readFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {EventEmitter} from 'node:events'
import {join} from 'node:path'
import {ExecutionLeasePostgres} from './fixtures/sdf-execution-lease-postgres'

describe('PG fixture backend identity lock (no Docker; injected qualification)',()=>{
 const DAEMON='097b04099237066832a5574e26cb1708df26ff5007ae0165f7135bea76df3601',A='a'.repeat(64),B='b'.repeat(64),dirs:string[]=[]
 afterAll(()=>{for(const d of dirs)rmSync(d,{recursive:true,force:true})})
 const answer=(backend:string,over:Record<string,unknown>={})=>({status:'qualified_for_health_probe',reasons:[],targetChecks:[{id:'docker',ok:true,reasons:[]},{id:'backend',ok:true,reasons:[]}],docker:{backendIdentityHash:backend,daemonIdentityHash:DAEMON},...over})
 function make(initial:unknown){
  const state={answer:initial as unknown,calls:0,onQualify:undefined as undefined|(()=>void)},docker={spawned:[] as string[][],resolved:0}
  const spawn=((args:string[])=>{docker.spawned.push(args);let done!:(v:{stdout:string})=>void;const p:any=new Promise(r=>{done=r});const stdout=new EventEmitter()
   p.child={stdout,stdin:{write:(s:string)=>{if(s.includes('LEASE_LOCK_READY'))setTimeout(()=>stdout.emit('data',Buffer.from('LEASE_LOCK_READY\n')),5)},end:()=>{setTimeout(()=>{docker.resolved++;done({stdout:'t'})},100)}}};return p}) as any
  const dir=mkdtempSync(join(tmpdir(),'pg-identity-'));dirs.push(dir)
  const f=new ExecutionLeasePostgres({dir,spawn,hostQualify:()=>{state.calls++;state.onQualify?.();if(state.answer instanceof Error)throw state.answer;return state.answer}})
  return{f,state,docker,receipt:()=>JSON.parse(readFileSync(join(dir,'receipt.json'),'utf8'))}
 }
 const running=(m:ReturnType<typeof make>)=>{m.f.qualify('start_lock');m.f.started=true;m.f.id='c'.repeat(64)}
 it('locks the first verified backend and accepts a new verified backend only in a new run',()=>{
  const one=make(answer(A)),two=make(answer(B))
  one.f.qualify('start_lock');one.f.qualify('again');two.f.qualify('start_lock')
  expect([one.f.backendIdentity,two.f.backendIdentity,one.f.sealed,two.f.sealed]).toEqual([A,B,null,null])
 })
 it('rejects a backend process change during a run, seals, and withholds cleanup without further Docker calls',async()=>{
  const m=make(answer(A));running(m);m.state.answer=answer(B)
  expect(()=>m.f.sql('select 1;')).toThrow('test_docker_backend_changed')
  expect(m.f.sealed).toBe('backend_changed_at_before_exec');expect(m.f.backendIdentity).toBe(A)
  m.state.answer=answer(A);const calls=m.state.calls
  expect(()=>m.f.sql('select 1;')).toThrow('test_docker_peer_sealed');await expect(m.f.parallel(['select 1;'])).rejects.toThrow('test_docker_peer_sealed');await expect(m.f.hold('select 1;')).rejects.toThrow('test_docker_peer_sealed')
  expect(()=>m.f.stop()).toThrow('pg_cleanup_withheld:backend_changed_at_before_exec')
  expect(m.state.calls).toBe(calls);expect(m.docker.spawned).toEqual([]);expect(m.f.started).toBe(true)
  expect(m.receipt()).toMatchObject({status:'cleanup_withheld_backend_changed',lockedBackendIdentityHash:A,sealed:'backend_changed_at_before_exec',details:{containerMayRemain:true,removeIssued:false,containerId:'c'.repeat(64)}})
 })
 it('rejects a wrong binary hash, changed daemon, malformed identity or failed qualification',()=>{
  const bad=[answer(A,{status:'blocked',reasons:['target_failed'],targetChecks:[{id:'docker',ok:true,reasons:[]},{id:'backend',ok:false,reasons:['sha256_mismatch']}]}),answer(A,{status:'blocked',reasons:['target_failed'],targetChecks:[{id:'docker',ok:false,reasons:['sha256_mismatch']},{id:'backend',ok:true,reasons:[]}]}),answer(A,{targetChecks:[{id:'docker',ok:true,reasons:[]}]}),answer(A,{docker:{backendIdentityHash:A,daemonIdentityHash:'f'.repeat(64)}}),answer('A'.repeat(64)),answer(A,{reasons:['acl_writable']}),Error('qualify_crashed')]
  for(const b of bad){
   const fresh=make(b);expect(()=>fresh.f.qualify('start_lock')).toThrow('test_docker_peer_unqualified');expect([fresh.f.backendIdentity,fresh.f.sealed]).toEqual([null,null])
   const mid=make(answer(A));running(mid);mid.state.answer=b;expect(()=>mid.f.sql('select 1;')).toThrow('test_docker_peer_unqualified');expect(mid.f.sealed).toBe('unqualified_at_before_exec');expect(()=>mid.f.stop()).toThrow('pg_cleanup_withheld')
  }
 })
 it('qualifies only immediately before and after an approved window and rejects a process change inside it',async()=>{
  const m=make(answer(A));running(m);expect(m.state.calls).toBe(1)
  await expect(m.f.window('broker_expiry_barrier',2000,async()=>{const r=await m.f.parallel(['select 1;']);const release=await m.f.hold('select 1;');await release();m.state.answer=answer(B);return r})).rejects.toThrow('test_docker_backend_changed')
  expect(m.state.calls).toBe(3);expect(m.f.peerChecks.map(c=>c.label)).toEqual(['start_lock','window_open:broker_expiry_barrier','window_close:broker_expiry_barrier'])
  expect(m.f.sealed).toBe('backend_changed_at_window_close:broker_expiry_barrier');expect(m.f.windows.map(w=>w.outcome)).toEqual(['post_check_failed'])
  const spawned=m.docker.spawned.length;expect(()=>m.f.sql('select 1;')).toThrow('test_docker_peer_sealed');expect(()=>m.f.stop()).toThrow('pg_cleanup_withheld');expect(m.docker.spawned.length).toBe(spawned)
  expect(m.receipt()).toMatchObject({status:'cleanup_withheld_backend_changed',lockedBackendIdentityHash:A,details:{containerMayRemain:true}})
 })
 it('runs the post-check when the window body throws, after every started parallel and held operation settled',async()=>{
  const m=make(answer(A));running(m);let atClose:{spawned:number;resolved:number}|null=null
  m.state.onQualify=()=>{if(m.state.calls===3)atClose={spawned:m.docker.spawned.length,resolved:m.docker.resolved}}
  await expect(m.f.window('lock_contention',2000,async()=>{void m.f.parallel(['select pg_sleep(1);']).catch(()=>undefined);await m.f.hold('lock table x');throw Error('body_failed')})).rejects.toThrow('body_failed')
  expect(atClose).toEqual({spawned:2,resolved:2});expect(m.f.sealed).toBeNull();expect(m.f.windows.map(w=>w.outcome)).toEqual(['closed_with_test_error'])
  await expect(m.f.window('lock_contention',2000,async()=>{m.state.answer=answer(B);throw Error('body_failed_again')})).rejects.toThrow('test_docker_backend_changed')
  expect(m.f.sealed).toBe('backend_changed_at_window_close:lock_contention')
 })
 it('limits windows to the two approved tests, bounds them, refuses nesting and refuses new calls after expiry',async()=>{
  const m=make(answer(A));running(m)
  await expect(m.f.window('serializes_race',1000,async()=>1)).rejects.toThrow('pg_window_not_approved')
  for(const ms of [0,-1,1.5,15001])await expect(m.f.window('lock_contention',ms,async()=>1)).rejects.toThrow('pg_window_bound')
  expect(m.state.calls).toBe(1)
  await expect(m.f.window('lock_contention',1000,async()=>m.f.window('broker_expiry_barrier',1000,async()=>1))).rejects.toThrow('pg_window_nested')
  await expect(m.f.window('lock_contention',50,async()=>{await new Promise(r=>setTimeout(r,80));return m.f.sql('select 1;')})).rejects.toThrow('pg_window_timeout:lock_contention')
  expect(m.f.windows.map(w=>w.outcome)).toEqual(['closed_with_test_error','timeout']);expect(m.f.sealed).toBeNull();expect(m.f.commands).toEqual([])
  expect(await m.f.window('lock_contention',1000,async()=>'ok')).toBe('ok')
 })
})