import {test} from 'node:test'
import assert from 'node:assert/strict'
import {fixtureStorageCors} from './cors.mjs'
test('advertises only the exact owned app origin for private browser uploads',()=>{
 const headers=fixtureStorageCors('http://localhost:54406','http://localhost:54406')
 assert.equal(headers['access-control-allow-origin'],'http://localhost:54406')
 assert.match(headers['access-control-allow-methods'],/PUT/)
 assert.match(headers['access-control-allow-headers'],/authorization/)
 assert.deepEqual(fixtureStorageCors('http://localhost:54406','https://foreign.example'),{})
})
test('refuses non-local or credentialed app origin configuration',()=>{
 for(const origin of ['https://hosted.example','http://192.168.1.2:54406','http://localhost:80','http://user@localhost:54406','http://localhost:54406/path'])
  assert.throws(()=>fixtureStorageCors(origin,origin),/owned loopback app/)
})
