import {generateKeyPairSync,sign,randomUUID} from 'node:crypto'
import {canonicalRequestPayload,sha256Hex} from '@/lib/atlas/code-broker/protocol'
import type {StoredBroker,BrokerPublicJwk} from '@/lib/atlas/code-broker/types'
import type {BrokerStore} from '@/lib/atlas/code-broker/store'
import type {BrokerBuildPolicy} from '@/lib/atlas/code-broker/policy'
import {publicJwkThumbprint} from '@/lib/atlas/code-broker/crypto'
export const LEASE_PATH='/api/atlas/code-work/broker/execution-lease'
export const TOKEN=Buffer.alloc(32,6).toString('base64url')
export function leaseFixture(){return {
 schema:'atlas.code_work_execution_lease.v1',
 binding:{workId:'50000000-0000-4000-8000-000000000001',repositoryId:'github.com/bumbi190/ai-operating-platform',pinnedBaseSha:'a'.repeat(40),admissionHash:'b'.repeat(64),claimId:'60000000-0000-4000-8000-000000000001',fence:1},
 projectId:'10000000-0000-4000-8000-000000000001',
 authorityPins:{missionId:'20000000-0000-4000-8000-000000000001',missionVersion:1,missionHash:'c'.repeat(64),delegationEnvelopeId:'30000000-0000-4000-8000-000000000001',delegationHash:'d'.repeat(64),workPackageId:'40000000-0000-4000-8000-000000000001',workPackageHash:'e'.repeat(64)},
 state:'claimed',stateVersion:3,serverNowMs:1800000000000,leaseUntilMs:1800000090000,authorizationExpiresAtMs:1800000300000,runtimeExpiresAtMs:1800001200000,productionAuthority:false
}}
export const claimFixture=()=>{const l=leaseFixture();return{workId:l.binding.workId,claimId:l.binding.claimId,fence:1,claimToken:TOKEN}}
export function signedLeaseHarness(){
 const pair=generateKeyPairSync('ec',{namedCurve:'P-256'}),publicJwk=pair.publicKey.export({format:'jwk'}) as BrokerPublicJwk,now=new Date(1800000000000)
 let row:StoredBroker={brokerId:'70000000-0000-4000-8000-000000000001',enrollmentId:'80000000-0000-4000-8000-000000000001',ownerUserId:leaseFixture().projectId,hostId:'90000000-0000-4000-8000-000000000001',publicJwk,keyThumbprint:publicJwkThumbprint(publicJwk),algorithm:'ES256',protocolVersion:1,brokerVersion:'0.1.0',buildSha256:'f'.repeat(64),hostLabel:'synthetic',localUidHash:'1'.repeat(64),osVersion:'Windows fixture',status:'active',allowedRepositoryIds:[leaseFixture().binding.repositoryId],approvedAt:now.toISOString(),approvedBy:leaseFixture().projectId,lastSeenAt:null,expiresAt:null,revokedAt:null,revokedBy:null,revokedReason:null,requestCounter:0,lastRequestJti:null,lastRequestAt:null,createdAt:now.toISOString(),updatedAt:now.toISOString()}
 const policy:BrokerBuildPolicy={protocolVersion:1,brokerVersion:'0.1.0',allowedBuildSha256:new Set([row.buildSha256]),allowedRepositoryIds:row.allowedRepositoryIds}
 let reads=0
 const store={brokerById:async(id:string)=>{reads++;return id===row.brokerId?row:null},acceptRequest:async(v:any)=>{reads++;if(v.requestCounter!==row.requestCounter+1||v.hostId!==row.hostId||row.status!=='active')throw Error('replay');row={...row,requestCounter:v.requestCounter};return row}} as unknown as BrokerStore
 return{get broker(){return row},revoke(){row={...row,status:'revoked'}},get reads(){return reads},auth:{store,policy,now:()=>now},
 request(raw=JSON.stringify(claimFixture()),options:{path?:string;method?:string;counter?:number}={}){
  const path=options.path??LEASE_PATH,method=options.method??'POST',counter=options.counter??row.requestCounter+1,jti=randomUUID(),timestamp=now.toISOString()
  const sig=sign('sha256',Buffer.from(canonicalRequestPayload({...row,counter,jti,timestamp,method,path,bodySha256:sha256Hex(raw)})),pair.privateKey).toString('base64url')
  return new Request('https://omnira.test'+path,{method,headers:{'content-type':'application/json','x-omnira-broker-id':row.brokerId,'x-omnira-broker-host-id':row.hostId,'x-omnira-broker-protocol':'1','x-omnira-broker-version':row.brokerVersion,'x-omnira-broker-build-sha256':row.buildSha256,'x-omnira-broker-counter':String(counter),'x-omnira-broker-jti':jti,'x-omnira-broker-timestamp':timestamp,'x-omnira-broker-signature':sig},...(method==='GET'?{}:{body:raw})})
 }}
}
