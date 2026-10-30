import {test} from 'node:test'
import assert from 'node:assert/strict'
import {assertReferenceLocalConfig} from './reference-local-stack.mjs'
test('requires explicit opt-in before touching Docker',()=>{
 assert.throws(()=>assertReferenceLocalConfig({}),/isolated-local/)
})
test('rejects hosted, LAN, credentialed and malformed endpoints',()=>{
 for(const url of ['https://example.supabase.co','http://192.168.1.2:54321','http://localhost:54321','http://127.0.0.1','http://user:pass@127.0.0.1:54321','http://127.0.0.1:54321/other'])
  assert.throws(()=>assertReferenceLocalConfig({mode:'isolated-local',url}),/loopback/)
})
test('allows a literal loopback endpoint with an explicit port',()=>{
 assert.doesNotThrow(()=>assertReferenceLocalConfig({mode:'isolated-local',url:'http://127.0.0.1:54489'}))
})

const label='fixture.owner',id='test-owned',names=['test-owned-db','test-owned-auth']
function engine({wrongOwner=false,failRemoval=false}={}){
 const resources=new Map([['test-owned-db',{owner:id}],['test-owned-auth',{owner:wrongOwner?'someone-else':id}],['unrelated',{owner:'other'}]])
 let network=true
 const docker=args=>{
  if(args[0]==='ps'){
   const filter=args[args.indexOf('--filter')+1]
   return [...resources].filter(([name,row])=>filter.startsWith('name=')?filter==='name=^/'+name+'$':filter==='label='+label+'='+row.owner).map(([name])=>name).join('\n')
  }
  if(args[0]==='inspect')return resources.get(args.at(-1))?.owner??''
  if(args[0]==='rm'){
   if(failRemoval&&args.at(-1)==='test-owned-auth')throw Error('injected removal failure')
   resources.delete(args.at(-1));return ''
  }
  if(args[0]==='network'){
   if(args[1]==='ls')return network?id:''
   if(args[1]==='inspect')return id
   if(args[1]==='rm'){if([...resources.values()].some(r=>r.owner===id))throw Error('network still in use');network=false;return ''}
  }
  throw Error('Unexpected fixture engine command')
 }
 return {docker,resources,network:()=>network}
}
test('discovers an owned container even if startup failed before returning',async()=>{
 const {cleanupReferenceResources}=await import('./reference-local-stack.mjs')
 const e=engine()
 await cleanupReferenceResources({id,label,names,docker:e.docker})
 assert.deepEqual([...e.resources.keys()],['unrelated']);assert.equal(e.network(),false)
})
test('attempts every owned cleanup after one removal fails',async()=>{
 const {cleanupReferenceResources}=await import('./reference-local-stack.mjs')
 const e=engine({failRemoval:true})
 await assert.rejects(()=>cleanupReferenceResources({id,label,names,docker:e.docker}),/cleanup/)
 assert.equal(e.resources.has('test-owned-db'),false)
 assert.equal(e.resources.has('test-owned-auth'),true)
 assert.equal(e.resources.has('unrelated'),true)
})
test('preserves a mismatched ownership label while cleaning the other resources',async()=>{
 const {cleanupReferenceResources}=await import('./reference-local-stack.mjs')
 const e=engine({wrongOwner:true})
 await assert.rejects(()=>cleanupReferenceResources({id,label,names,docker:e.docker}),/ownership/)
 assert.deepEqual([...e.resources.keys()],['test-owned-auth','unrelated'])
})
