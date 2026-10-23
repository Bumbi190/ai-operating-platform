import test from 'node:test'
import assert from 'node:assert/strict'
import {createPublicKey,verify} from 'node:crypto'
import {calendarRotationFixturePublic as ids,createCalendarRotationFixture}
 from './calendar-oidc-rotation-fixture.mjs'

const subject='b6718615-5cf3-4833-bceb-2fb79cb53d9b'
const project='8f673c09-1c8f-4d78-876e-4c14bf1c89b3'
const now=Date.parse('2026-10-23T09:30:00Z')
const operator='social_schedule_operator_review_fixture'
const reviewer='social_schedule_broker_review_fixture'
const options={expectedSubject:subject,expectedProject:project,now:()=>now}
const issueRequest={role:operator,subject,projectId:project}
function accepts(token,jwks){
 const parts=token.split('.')
 const header=JSON.parse(Buffer.from(parts[0],'base64url').toString('utf8'))
 const claims=JSON.parse(Buffer.from(parts[1],'base64url').toString('utf8'))
 const jwk=jwks.keys.find(k=>k.kid===header.kid)
 if(!jwk)return false
 return header.alg==='RS256'&&claims.iss===ids.issuer&&
  verify('RSA-SHA256',Buffer.from(parts[0]+'.'+parts[1]),
   createPublicKey({key:jwk,format:'jwk'}),Buffer.from(parts[2],'base64url'))
}
test('public JWKS contains only public RSA verification material',()=>{
 const signer=createCalendarRotationFixture(options)
 const pre=signer.publicJwks()
 assert.equal(pre.keys.length,1)
 assert.equal(pre.keys[0].kid,ids.oldKid)
 assert.equal(pre.keys[0].alg,'RS256')
 assert.ok(!JSON.stringify(pre).includes('privateKey'))
 for(const value of pre.keys){
  assert.equal(value.kty,'RSA')
  assert.ok(value.n.length>100)
  for(const secret of ['d','p','q','dp','dq','qi','oth']){
   assert.equal(Object.hasOwn(value,secret),false,'JWK leaked '+secret)
  }
 }
 assert.deepEqual(Object.keys(signer).sort(),
  ['activateNew','issue','publicJwks','retireOld','stage'])
})
test('activation advertises both keys while new issues use only the new key',()=>{
 const issuer=createCalendarRotationFixture(options)
 const legacy=issuer.issue(issueRequest)
 assert.ok(accepts(legacy,issuer.publicJwks()))
 issuer.activateNew()
 const both=issuer.publicJwks()
 assert.equal(both.keys.length,2)
 assert.deepEqual(both.keys.map(k=>k.kid),[ids.oldKid,ids.newKid])
 assert.ok(accepts(legacy,both))
 const fresh=issuer.issue({...issueRequest,role:reviewer})
 assert.ok(accepts(fresh,both))
 assert.equal(JSON.parse(Buffer.from(fresh.split('.')[0],'base64url').toString('utf8')).kid,ids.newKid)
})
test('retirement withdraws the old public key without invalidating new tokens',()=>{
 const issuer=createCalendarRotationFixture(options)
 const old=issuer.issue(issueRequest)
 issuer.activateNew()
 const fresh=issuer.issue(issueRequest)
 issuer.retireOld()
 const publicKeys=issuer.publicJwks()
 assert.deepEqual(publicKeys.keys.map(k=>k.kid),[ids.newKid])
 assert.equal(accepts(old,publicKeys),false)
 assert.equal(accepts(fresh,publicKeys),true)
 assert.equal(issuer.stage(),'retired')
 assert.ok(accepts(issuer.issue(issueRequest),publicKeys))
 assert.throws(()=>issuer.activateNew(),/DENIED/)
 assert.throws(()=>issuer.retireOld(),/DENIED/)
})
test('issuer refuses role escalation, foreign project/subject, arbitrary or long TTL',()=>{
 const issuer=createCalendarRotationFixture(options)
 for(const request of [
  {...issueRequest,role:'service_role'},
  {...issueRequest,role:'authenticated'},
  {...issueRequest,role:'social_schedule_rpc_only_fixture'},
  {...issueRequest,subject:'20000000-0000-4000-8000-000000000010'},
  {...issueRequest,projectId:'10000000-0000-4000-8000-000000000001'},
  {...issueRequest,ttlSeconds:15},
  {...issueRequest,ttlSeconds:181},
  {...issueRequest,ttlSeconds:60.5},
  {...issueRequest,ttlSeconds:-1},
 ]){
  assert.throws(()=>issuer.issue(request),/DENIED/)
 }
 const decoded=issuer.issue({...issueRequest,ttlSeconds:150}).split('.')
 const claims=JSON.parse(Buffer.from(decoded[1],'base64url').toString('utf8'))
 assert.deepEqual({sub:claims.sub,role:claims.role,aud:claims.aud,project:claims.omnira_project},
  {sub:subject,role:operator,aud:'authenticated',project})
 assert.equal(claims.exp-claims.iat,150)
})
test('refuses enabling an issuer fixture under production NODE_ENV',()=>{
 const was=process.env.NODE_ENV
 try{
  process.env.NODE_ENV='production'
  assert.throws(()=>createCalendarRotationFixture(options),/DENIED/)
 }finally{
  if(was===undefined)delete process.env.NODE_ENV
  else process.env.NODE_ENV=was
 }
})
