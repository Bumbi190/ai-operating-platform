import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {randomBytes} from 'node:crypto'
import {createServer} from 'node:http'
import type {AddressInfo} from 'node:net'
import {MetaManualProvider} from '../publication/provider'
import {createPrivilegedPublicationBrokerFixture} from './privileged-publication-broker-fixture'
import type {ApprovedScheduleSnapshot} from './types'

const job='20000000-0000-4000-8000-000000000016'
const claimId='20000000-0000-4000-8000-000000000017'
const publicationId='30000000-0000-4000-8000-000000000017'
const project='8f673c09-1c8f-4d78-876e-4c14bf1c89b3'
const revisionId='20000000-0000-4000-8000-000000000013'
const assetId='20000000-0000-4000-8000-000000000019'
const bindingId='20000000-0000-4000-8000-000000000018'
const now=Date.parse('2026-10-22T20:00:00.000Z')
const secret='BROKER_PRIVATE_SYNTHETIC_TOKEN'
const url='https://broker-fixture.invalid/v1/facebook-photo'
const imageUrl='https://app.omniraos.se/api/social-publication-media?publicationId='+publicationId+'&key='+'a'.repeat(43)
const claim={jobId:job,claimId,version:4}

function approved():ApprovedScheduleSnapshot{
 return {projectId:project,approvalId:'20000000-0000-4000-8000-000000000015',
 manifestSha256:'c'.repeat(64),
 item:{postId:'20000000-0000-4000-8000-000000000012',revisionId,
  sha256:'b'.repeat(64),decisionId:'20000000-0000-4000-8000-000000000020',
  planRevisionId:'20000000-0000-4000-8000-000000000011',
  bindingId,accountId:'12345',channel:'facebook',asset:{id:assetId,sha256:'d'.repeat(64)},
  localMinute:'2026-10-22T22:00',scheduledAt:'2026-10-22T20:00:00.000Z',
  expiresAt:'2026-10-22T20:10:00.000Z',
  occasionId:'20000000-0000-4000-8000-000000000099',kind:'ordinary',releaseCondition:null},
 revision:{id:revisionId,sequence:1,sha256:'b'.repeat(64),
  planRevisionId:'20000000-0000-4000-8000-000000000011',
  draft:{channel:'facebook',format:'image',title:'Synthetic',text:'Synthetic caption',
   linkUrl:null,mediaIds:[assetId],mediaBrief:'',scheduledAt:'2026-10-22T20:00:00.000Z'},
  media:[{id:assetId,kind:'image',mimeType:'image/jpeg',sha256:'d'.repeat(64),width:600,height:600}],
  binding:{id:bindingId,accountId:'12345',label:'Synthetic page'},createdAt:'2026-10-22T19:00:00.000Z'},
 publication:{id:publicationId,projectId:project,postId:'20000000-0000-4000-8000-000000000012',
  revisionId,sha256:'b'.repeat(64),decisionId:'20000000-0000-4000-8000-000000000020',
  bindingId,channel:'facebook',accountId:'12345',accountLabel:'Synthetic page',
  state:'publishing',version:2,containerId:null,providerId:null,permalink:null,
  failureCode:null,confirmation:null,requestedAt:'2026-10-22T19:59:00.000Z',
  updatedAt:'2026-10-22T19:59:00.000Z',authoritySource:'scheduled',jobId:job}}
}
function setup(custom:Record<string,unknown>={}){
 const current=approved()
 const key=randomBytes(36).toString('base64url')
 const mediaDb={} as any
 const authorizeClaim=vi.fn(async()=>({snapshot:current,leaseExpiresAt:new Date(now+90000).toISOString(),claim}))
 const verifyImage=vi.fn(async()=>({width:600,height:600,bytes:new Uint8Array([1,2,3])}))
 const committed=new Set<string>()
 const reserveIntent=vi.fn(async(value:typeof claim,pub:string)=>{
  const key=value.jobId+'|'+pub
  if(committed.has(key))return false
  committed.add(key)
  return true
 })
 const resolveCredential=vi.fn(async()=>({projectId:project,channel:'facebook' as const,
  bindingId,accountId:'12345',token:secret,apiBase:'https://graph.facebook.com/v21.0'}))
 const providerPost=vi.fn(async(_url:string,init:RequestInit)=>{
  expect(new Headers(init.headers).get('authorization')).toBe('Bearer '+secret)
  return Response.json({post_id:'12345_99999'})
 })
 const deps={brokerKey:key,expectedProjectId:project,mediaDb,authorizeClaim,reserveIntent,
  verifyImage,resolveCredential,provider:new MetaManualProvider(providerPost),
  now:()=>now,...custom}
 const broker=createPrivilegedPublicationBrokerFixture(deps)
 const body={claim,publicationId,text:'Synthetic caption',imageUrl}
 const request=(override:Record<string,unknown>={},authorization=key)=>
  new Request(url,{method:'POST',headers:{authorization:'Bearer '+authorization,
   'content-type':'application/json'},body:JSON.stringify({...body,...override})})
 return {deps,broker,key,request,body,providerPost}
}
beforeEach(()=>vi.stubEnv('NODE_ENV','test'))
afterEach(()=>vi.unstubAllEnvs())

it('does not expose the underlying Meta token, client or Storage and publishes once with SQL authority',async()=>{
 const s=setup()
 expect(Object.keys(s.broker)).toEqual(['handle'])
 const response=await s.broker.handle(s.request())
 expect(response.status).toBe(200)
 const body=await response.json()
 expect(body).toEqual({post_id:'12345_99999'})
 expect(JSON.stringify(body)).not.toContain(secret)
 expect('mediaDb' in s.broker).toBe(false)
 expect('resolveCredential' in s.broker).toBe(false)
 expect(s.deps.authorizeClaim).toHaveBeenCalledTimes(2)
 expect(s.deps.reserveIntent).toHaveBeenCalledTimes(1)
 expect(s.deps.verifyImage).toHaveBeenCalledTimes(1)
 expect(s.deps.resolveCredential).toHaveBeenCalledTimes(1)
 expect(s.providerPost).toHaveBeenCalledTimes(1)
 // A fresh handler has no memory of the original attempt, but the
 // shared committed reservation survives and prevents another send.
 const restarted=createPrivilegedPublicationBrokerFixture(s.deps)
 expect((await restarted.handle(s.request())).status).toBe(403)
 expect(s.deps.reserveIntent).toHaveBeenCalledTimes(2)
 const retry=await s.broker.handle(s.request())
 expect(retry.status).toBe(403)
 expect(s.providerPost).toHaveBeenCalledTimes(1)
})

it('denies missing auth and malformed/unrelated input before even consulting SQL',async()=>{
 const s=setup()
 for(const [override,auth] of [
  [{},'wrong-broker-key'],
  [{claim:{...claim,jobId:'not-uuid'}},s.key],
  [{claim:{...claim,version:0}},s.key],
  [{publicationId:'10000000-0000-4000-8000-000000000001'},s.key],
  [{text:1},s.key],
  [{imageUrl:'http://example.com/poison'},s.key],
  [{more:'unapproved'},s.key],
 ] as const) {
  const response=await s.broker.handle(s.request(override,auth))
  expect(response.status).toBe(403)
 }
 expect(s.deps.authorizeClaim).not.toHaveBeenCalled()
 expect(s.deps.verifyImage).not.toHaveBeenCalled()
 expect(s.deps.resolveCredential).not.toHaveBeenCalled()
})

it('requires a current, server-authorized publication and exact channel, asset/account binding',async()=>{
 for(const alter of [
  (x:ApprovedScheduleSnapshot)=>{x.projectId='10000000-0000-4000-8000-000000000001'},
  (x:ApprovedScheduleSnapshot)=>{x.publication!.state='requested'},
  (x:ApprovedScheduleSnapshot)=>{x.publication!.bindingId='20000000-0000-4000-8000-000000000099'},
  (x:ApprovedScheduleSnapshot)=>{x.publication!.accountId='98765'},
  (x:ApprovedScheduleSnapshot)=>{x.publication!.jobId='20000000-0000-4000-8000-000000000021'},
  (x:ApprovedScheduleSnapshot)=>{x.revision.draft.channel='instagram'},
  (x:ApprovedScheduleSnapshot)=>{x.item.asset.id='20000000-0000-4000-8000-000000000098'},
 ]){
  const snapshot=approved();alter(snapshot)
  const s=setup({authorizeClaim:vi.fn(async()=>({
   snapshot,leaseExpiresAt:new Date(now+90000).toISOString(),claim,
  }))})
  expect((await s.broker.handle(s.request())).status).not.toBe(200)
  expect(s.deps.resolveCredential).not.toHaveBeenCalled()
  expect(s.providerPost).not.toHaveBeenCalled()
 }
})

it('refuses on revocation between credential lookup and dispatch without calling Meta',async()=>{
 const snap=approved(),revoked=approved()
 revoked.publication!.state='uncertain'
 let attempts=0
 const authorizeClaim=vi.fn(async()=>{
  attempts++
  return {snapshot:attempts===1?snap:revoked,leaseExpiresAt:new Date(now+90000).toISOString(),claim}
 })
 const s=setup({authorizeClaim})
 expect((await s.broker.handle(s.request())).status).toBe(403)
 expect(attempts).toBe(2)
 expect(s.deps.resolveCredential).toHaveBeenCalledTimes(1)
 expect(s.providerPost).not.toHaveBeenCalled()
 expect((await s.broker.handle(s.request())).status).toBe(403)
 expect(attempts).toBe(2)
})

it('cannot retry after unknown provider outcome or concurrent dispatch',async()=>{
 const post=vi.fn(async()=>{throw Error('Synthetic network lost after provider might publish')})
 const s=setup({provider:new MetaManualProvider(post)})
 const responses=await Promise.all([s.broker.handle(s.request()),s.broker.handle(s.request())])
 expect(responses.map(x=>x.status).sort()).toEqual([403,503])
 expect(post).toHaveBeenCalledTimes(1)
 expect((await s.broker.handle(s.request())).status).toBe(403)
})

it('rejects an expired lease and never reads account tokens',async()=>{
 const s=setup({authorizeClaim:vi.fn(async()=>({
  snapshot:approved(),leaseExpiresAt:new Date(now-100).toISOString(),claim,
 }))})
 expect((await s.broker.handle(s.request())).status).toBe(403)
 expect(s.deps.resolveCredential).not.toHaveBeenCalled()
 expect(s.providerPost).not.toHaveBeenCalled()
})

it('is not constructible outside test mode',()=>{
 vi.stubEnv('NODE_ENV','production')
 const s=setup
 expect(()=>s()).toThrow()
})

it('serves the same safe contract over a real loopback HTTP request, without a Meta token response',async()=>{
 const s=setup()
 const server=createServer(async(req,res)=>{
  try{
   const chunks:Buffer[]=[]
   for await(const chunk of req)chunks.push(Buffer.from(chunk))
   // The test-only gateway maps its local loopback path to the pinned
   // broker-origin Request. No internet endpoint is contacted.
   const inbound=new Request(url,{method:req.method,headers:{
    authorization:req.headers.authorization??'',
    'content-type':req.headers['content-type']??'',
   },body:Buffer.concat(chunks).toString('utf8')})
   const answer=await s.broker.handle(inbound)
   res.statusCode=answer.status
   res.setHeader('content-type','application/json')
   res.end(await answer.text())
  }catch{res.statusCode=503;res.end('{"code":"BROKER_UNAVAILABLE"}')}
 })
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve))
 try{
  const address=server.address() as AddressInfo
  const post=()=>fetch('http://127.0.0.1:'+address.port+'/v1/facebook-photo',{
   method:'POST',headers:{authorization:'Bearer '+s.key,'content-type':'application/json'},
   body:JSON.stringify(s.body),
  })
  const response=await post()
  expect(response.status).toBe(200)
  const payload=await response.text()
  expect(JSON.parse(payload)).toEqual({post_id:'12345_99999'})
  expect(payload).not.toContain(secret)
  expect((await post()).status).toBe(403)
  expect(s.providerPost).toHaveBeenCalledTimes(1)
 }finally{
  await new Promise<void>((resolve,reject)=>server.close(err=>err?reject(err):resolve()))
 }
})

it('rejects a malformed SQL authorization response without throwing or accessing private resources',async()=>{
 const s=setup({authorizeClaim:vi.fn(async()=>null)})
 expect((await s.broker.handle(s.request())).status).toBe(403)
 expect(s.deps.resolveCredential).not.toHaveBeenCalled()
 expect(s.deps.verifyImage).not.toHaveBeenCalled()
 expect(s.providerPost).not.toHaveBeenCalled()
})

it('denies parallel calls from two independently constructed broker processes sharing one durable reservation',async()=>{
 const s=setup()
 const other=createPrivilegedPublicationBrokerFixture(s.deps)
 const responses=await Promise.all([s.broker.handle(s.request()),other.handle(s.request())])
 expect(responses.map(x=>x.status).sort()).toEqual([200,403])
 expect(s.providerPost).toHaveBeenCalledTimes(1)
 expect(s.deps.reserveIntent).toHaveBeenCalledTimes(2)
})

it('refuses before provider I/O if the SQL reservation was already committed or its ACK was lost',async()=>{
 for(const [reserveIntent,expectedStatus] of [
  [vi.fn(async()=>false),403],
  [vi.fn(async()=>{throw Error('DB committed, but HTTP ACK was lost')}),503],
 ]){
  const s=setup({reserveIntent})
  const response=await s.broker.handle(s.request())
  expect(response.status).toBe(expectedStatus)

  expect(s.providerPost).not.toHaveBeenCalled()
  expect(s.deps.resolveCredential).toHaveBeenCalledTimes(1)
 }
})
