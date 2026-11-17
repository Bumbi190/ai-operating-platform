import {test} from 'node:test'
import assert from 'node:assert/strict'
import {spawnSync} from 'node:child_process'
import {buildRouteRunner} from './website-auth-routes-bundle.mjs'
const ids=['11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222']
const base={drain:false,spendGuard:false,feedback:false,browser:false,worker:false,service:'eyJ0.e30.SYNTHETIC_SERVICE',anon:'eyJ0.e30.SYNTHETIC_ANON',a:{id:ids[0],access_token:'eyJ0.e30.SYNTHETIC_A',refresh_token:'synthetic-refresh-a'},b:{id:ids[1],access_token:'eyJ0.e30.SYNTHETIC_B',refresh_token:'synthetic-refresh-b'},context:{projects:ids,agents:ids,conversations:ids,routeConversation:ids[0]}}
test('cookie harness rejects missing or foreign standalone targets before opening a gateway',()=>{
 const bundle=buildRouteRunner()
 try{
  for(const nextServer of [null,undefined,'https://foreign.invalid/server.js','/tmp/foreign/apps/web/.auth-next-owned/server.js']){
   const child=spawnSync(process.execPath,[bundle.path],{input:JSON.stringify({...base,nextServer})+'\n',encoding:'utf8',timeout:10000})
   assert.equal(child.status,0,'invalid fixture must exit without starting request processing')
   const result=JSON.parse(child.stdout.trim())
   assert.equal(result.completed,false)
   assert.deepEqual(result.checks,[])
   assert.equal(result.failure,'ROUTE_RUNNER_FAILED')
  }
 }finally{bundle.cleanup()}
})
