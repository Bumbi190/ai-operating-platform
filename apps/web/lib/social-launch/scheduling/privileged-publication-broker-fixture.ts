import 'server-only'
import {timingSafeEqual} from 'node:crypto'
import type {createAdminClient} from '@/lib/supabase/admin'
import type {MetaManualProvider,ManualCredential} from '../publication/provider'
import type {SocialContentAsset} from '../content/types'
import type {ApprovedScheduleSnapshot} from './types'
import {ScheduleError} from './types'
import {createApprovedScheduleMediaScopeFixture} from './approved-media-scope-fixture'

// ISOLATED CONTRACT PROBE ONLY. This is an in-process HTTP handler, not
// deployment wiring or a distinct service identity. Its dependencies must
// move to a separately authorized server before a real cutover.
type Db=ReturnType<typeof createAdminClient>
type Claim={jobId:string;claimId:string;version:number}
type Authority={snapshot:ApprovedScheduleSnapshot;leaseExpiresAt:string;claim:Claim}
type Credential=ManualCredential&{projectId:string;bindingId:string}
type Image={bytes:Uint8Array;width:number;height:number}
export type BrokerFixtureDependencies={
  brokerKey:string
  expectedProjectId:string
  authorizeClaim:(claim:Claim)=>Promise<Authority>
  // Atomic COMMITTED reservation in a separately authorized database role.
  // A false response means this job/publication was already reserved.
  reserveIntent:(claim:Claim,publicationId:string)=>Promise<boolean>
  mediaDb:Db
  resolveCredential:(projectId:string,channel:'facebook'|'instagram')=>Promise<Credential>
  verifyImage:(db:Db,projectId:string,asset:Pick<SocialContentAsset,'id'|'sha256'>)=>Promise<Image>
  provider:MetaManualProvider
  now?:()=>number
}
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const id=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const deny=()=>Response.json({code:'BROKER_REFUSED'},{status:403,headers:{'cache-control':'no-store'}})
const unavailable=()=>Response.json({code:'BROKER_UNAVAILABLE'},{status:503,headers:{'cache-control':'no-store'}})
function validKeys(value:unknown,keys:string[]):value is Record<string,unknown>{
  return !!value&&typeof value==='object'&&!Array.isArray(value)&&
    Object.keys(value).length===keys.length&&
    Object.keys(value).every(k=>keys.includes(k))
}
function sameSecret(received:string,expected:string){
  const a=Buffer.from(received),b=Buffer.from(expected)
  return a.length===b.length&&a.length>0&&timingSafeEqual(a,b)
}
export function createPrivilegedPublicationBrokerFixture(deps:BrokerFixtureDependencies){
  if(process.env.NODE_ENV!=='test'||!uuid.test(deps.expectedProjectId)||
    !/^[A-Za-z0-9_-]{32,128}$/.test(deps.brokerKey)||
    typeof deps.authorizeClaim!=='function'||typeof deps.reserveIntent!=='function'||
    typeof deps.resolveCredential!=='function'||
    typeof deps.verifyImage!=='function'||!deps.mediaDb||!deps.provider)
    throw new ScheduleError('DISABLED')
  // Local duplicate shielding is additional defense only. The injected
  // SQL reservation provides durability across new handler processes.
  // Its own role/issuer is test-only and not a production credential.
  const attempted=new Set<string>()
  const inFlight=new Set<string>()
  const handle=async(request:Request):Promise<Response>=>{
    if(request.method!=='POST'||request.url!=='https://broker-fixture.invalid/v1/facebook-photo'||
      request.headers.get('content-type')!=='application/json'||
      !sameSecret(request.headers.get('authorization')?.replace(/^Bearer /,'')??'',deps.brokerKey))
      return deny()
    let body:unknown
    try{
      const bytes=await request.text()
      if(bytes.length>4096)return deny()
      body=JSON.parse(bytes)
    }catch{return deny()}
    if(!validKeys(body,['claim','publicationId','text','imageUrl'])||
      !validKeys(body.claim,['jobId','claimId','version']))return deny()
    const c=body.claim
    if(!id.test(String(c.jobId))||!id.test(String(c.claimId))||
      !Number.isSafeInteger(c.version)||Number(c.version)<1||
      !id.test(String(body.publicationId))||typeof body.text!=='string'||
      body.text.length>5000||typeof body.imageUrl!=='string')return deny()
    let url:URL
    try{url=new URL(body.imageUrl)}catch{return deny()}
    if(url.origin!=='https://app.omniraos.se'||
      url.pathname!=='/api/social-publication-media'||
      url.searchParams.get('publicationId')!==body.publicationId||
      url.searchParams.getAll('publicationId').length!==1||
      url.searchParams.getAll('key').length!==1||
      !/^[A-Za-z0-9_-]{43}$/.test(url.searchParams.get('key')??'')||
      [...url.searchParams.keys()].some(k=>!['publicationId','key'].includes(k))||
      url.username||url.password||url.hash)return deny()
    const claim={jobId:String(c.jobId),claimId:String(c.claimId),version:Number(c.version)}
    const key=claim.jobId+'|'+claim.claimId
    if(attempted.has(key)||inFlight.has(key))return deny()
    inFlight.add(key)
    try{
    let authority:Authority
    try{
      authority=await deps.authorizeClaim(claim)
      if(!authority?.claim||!authority.snapshot||typeof authority.leaseExpiresAt!=='string')return deny()
    }catch{return deny()}
    const {snapshot,leaseExpiresAt}=authority
    if(authority.claim.jobId!==claim.jobId||authority.claim.claimId!==claim.claimId||
      authority.claim.version!==claim.version||snapshot?.projectId!==deps.expectedProjectId||
      snapshot.item?.channel!=='facebook'||snapshot.revision?.draft?.format!=='image'||
      snapshot.publication?.state!=='publishing'||snapshot.publication.jobId!==claim.jobId||
      snapshot.publication.id!==body.publicationId||
      snapshot.publication.postId!==snapshot.item.postId||
      snapshot.publication.bindingId!==snapshot.item.bindingId||
      snapshot.publication.accountId!==snapshot.item.accountId||
      snapshot.revision.draft.text!==body.text||
      snapshot.publication.authoritySource!=='scheduled'||
      !Number.isFinite(Date.parse(leaseExpiresAt))||
      Date.parse(leaseExpiresAt)<=(deps.now?.()??Date.now()))return deny()
    // The URL shape was validated before any SQL. Bind to the actual
    // published row, not merely the client-provided publication identifier.
    if(url.searchParams.get('publicationId')!==snapshot.publication.id)return deny()
    // Fail closed on duplicates/concurrency BEFORE any privileged I/O.
    attempted.add(key)
    try{
      const scope=createApprovedScheduleMediaScopeFixture(snapshot,{
        expectedProjectId:deps.expectedProjectId,leaseExpiresAt,
        mediaDb:deps.mediaDb,resolveCredential:deps.resolveCredential,
        verifyImage:deps.verifyImage,now:deps.now,
      })
      await scope.verifyImage(deps.mediaDb,snapshot.projectId,{
        id:snapshot.item.asset.id,sha256:snapshot.item.asset.sha256,
      })
      const credential=await scope.resolveCredential(snapshot.projectId,'facebook')
      // Revocation/lease changes between image/token reads and dispatch
      // must deny a provider call. The SQL RPC must be checked again.
      const fresh=await deps.authorizeClaim(claim)
      if(fresh.claim.jobId!==claim.jobId||fresh.claim.claimId!==claim.claimId||
        fresh.claim.version!==claim.version||
        fresh.snapshot.projectId!==snapshot.projectId||
        fresh.snapshot.manifestSha256!==snapshot.manifestSha256||
        fresh.snapshot.approvalId!==snapshot.approvalId||
        fresh.snapshot.publication?.state!=='publishing'||
        fresh.snapshot.publication.id!==snapshot.publication.id||
        fresh.snapshot.item.asset.id!==snapshot.item.asset.id||
        fresh.snapshot.item.asset.sha256!==snapshot.item.asset.sha256||
        fresh.snapshot.item.accountId!==snapshot.item.accountId||
        fresh.snapshot.item.bindingId!==snapshot.item.bindingId||
        Date.parse(fresh.leaseExpiresAt)<=(deps.now?.()??Date.now()))return deny()
      // This MUST commit in a separate SQL transaction before contacting Meta.
      // A lost reservation ACK may consume the attempt; never auto-retry.
      if(await deps.reserveIntent(claim,snapshot.publication.id)!==true)return deny()
      const receipt=await deps.provider.facebook(credential,{
        text:snapshot.revision.draft.text,linkUrl:snapshot.revision.draft.linkUrl,
        imageUrl:body.imageUrl,
      })
      // Only provider receipt identifiers are returned; never the account
      // token, media bytes, storage URL, provider error or any credential.
      return Response.json({post_id:receipt.providerId},{
        headers:{'cache-control':'no-store','x-content-type-options':'nosniff'},
      })
    }catch{return unavailable()}
    }finally{inFlight.delete(key)}
  }
  return Object.freeze({handle})
}
