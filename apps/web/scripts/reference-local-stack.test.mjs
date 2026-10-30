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
