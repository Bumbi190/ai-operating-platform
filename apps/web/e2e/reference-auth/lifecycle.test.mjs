import {test} from 'node:test'
import assert from 'node:assert/strict'
import {EventEmitter} from 'node:events'
import {managedProcess,stopManagedProcess,attemptCleanup} from './lifecycle.mjs'
test('captures asynchronous spawn failure immediately without unhandled error',async()=>{
 const child=new EventEmitter();child.stdout=null;child.stderr=null
 const proc=managedProcess('missing',[],{},()=>{queueMicrotask(()=>child.emit('error',new Error('EAGAIN')));return child})
 const result=await proc.done
 assert.equal(result.error.message,'EAGAIN');assert.equal(proc.failure.message,'EAGAIN')
})
test('terminates owned detached descendants even after group leader exits',async()=>{
 const signals=[];let alive=true
 await stopManagedProcess({child:{pid:12001,exitCode:0}},(pid,signal)=>{
  assert.equal(pid,-12001);signals.push(signal)
  if(!alive)throw Object.assign(new Error('gone'),{code:'ESRCH'})
  if(signal==='SIGTERM')alive=false
 })
 assert.deepEqual(signals.filter(signal=>signal!==0),['SIGTERM']);assert.equal(alive,false)
})
test('attempts every cleanup action before surfacing failures',async()=>{
 const calls=[]
 await assert.rejects(()=>attemptCleanup([
  async()=>{calls.push('playwright');throw Error('stop failed')},
  async()=>{calls.push('next');throw Error('group failed')},
  async()=>{calls.push('stack')},
  async()=>{calls.push('temp app')},
 ]),error=>error instanceof AggregateError&&error.errors.length===2)
 assert.deepEqual(calls,['playwright','next','stack','temp app'])
})
