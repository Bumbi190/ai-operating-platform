// TEST-ONLY CLOSED REPLAY: This is an ephemeral in-memory signer, NOT a
// deployable issuer, managed KMS integration or working HTTPS OIDC endpoint.
// Only the disposable parent replay runner imports it. Private RSA keys never
// enter PostgREST, Vitest, a browser, a worker or a JSON response.
import {generateKeyPairSync,sign} from 'node:crypto'

const issuer='omnira-schedule-fixture'
const audience='authenticated'
const oldKid='calendar-rpc-rotation-old-v1'
const newKid='calendar-rpc-rotation-active-v2'
const roles=new Set([
 'social_schedule_operator_review_fixture',
 'social_schedule_broker_review_fixture',
])
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
function denied(){throw Error('CALENDAR_ROTATION_FIXTURE_DENIED')}
function keyPair(kid){
 const pair=generateKeyPairSync('rsa',{modulusLength:2048,publicExponent:0x10001})
 return {privateKey:pair.privateKey,
  publicJwk:Object.freeze({...pair.publicKey.export({format:'jwk'}),
   alg:'RS256',kid,use:'sig',key_ops:['verify']})}
}

export function createCalendarRotationFixture({
 expectedSubject,expectedProject,now=()=>Date.now(),
}={}){
 // The fixture may NEVER be mounted in a real application execution path.
 if(process.env.NODE_ENV==='production'||!uuid.test(expectedSubject??'')||
  !uuid.test(expectedProject??'')||typeof now!=='function')denied()
 const old=keyPair(oldKid),next=keyPair(newKid)
 let stage='legacy'
 const exposed=()=>{
  const keys=stage==='legacy'?[old.publicJwk]:
   stage==='overlap'?[old.publicJwk,next.publicJwk]:[next.publicJwk]
  return Object.freeze({keys:Object.freeze(keys)})
 }
 const issue=({role,subject,projectId,ttlSeconds=120}={})=>{
  if(!roles.has(role)||subject!==expectedSubject||projectId!==expectedProject||
   !Number.isSafeInteger(ttlSeconds)||ttlSeconds<30||ttlSeconds>180)denied()
  const nowSec=Math.floor(now()/1000)
  if(!Number.isSafeInteger(nowSec))denied()
  const selected=stage==='legacy'?old:next
  const selectedKid=stage==='legacy'?oldKid:newKid
  const claims={
   role,sub:subject,omnira_project:projectId,iss:issuer,aud:audience,
   iat:nowSec,nbf:nowSec,exp:nowSec+ttlSeconds,
  }
  const signed=[{alg:'RS256',typ:'JWT',kid:selectedKid},claims]
   .map(value=>Buffer.from(JSON.stringify(value)).toString('base64url')).join('.')
  return signed+'.'+sign('RSA-SHA256',Buffer.from(signed),selected.privateKey).toString('base64url')
 }
 return Object.freeze({
  stage:()=>stage,
  publicJwks:exposed,
  activateNew:()=>{
   if(stage!=='legacy')denied()
   stage='overlap'
  },
  retireOld:()=>{
   if(stage!=='overlap')denied()
   stage='retired'
  },
  issue,
 })
}

export const calendarRotationFixturePublic={
 issuer,audience,oldKid,newKid,
}
