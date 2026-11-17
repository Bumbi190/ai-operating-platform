import 'server-only'
import {createHash,createPublicKey,randomBytes,verify as verifySignature} from 'node:crypto'
import {verifyVercelOidcToken} from '@vercel/oidc'
import {WebsiteBuildError} from '../store'
import {validateProspectContent} from './validation'
import type {ProspectCompany} from './types'

export const HARVEY_EVIDENCE_SCOPE='omnira.webbuilder.scb.evidence.v1'
export const EdforsProjectId='a8d240af-e58e-446d-b293-6cae1fd6daa8'
const HARVEY_VERCEL_PROJECT_ID='prj_ZwTfAGuJBW8iCjfSzBqx0Jwjz03T'
const HARVEY_VERCEL_OWNER_ID='team_NlGVrs9ZItxkK4nMgRblBCI4'
const HARVEY_OIDC_ISSUER='https://oidc.vercel.com/bumbi190s-projects'
const HARVEY_OIDC_SUBJECT='owner:bumbi190s-projects:project:ai-operating-platform-web:environment:preview'
const noncePattern=/^[A-Za-z0-9_-]{43}$/
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const clockSkewMs=15_000
const nonceTtlMs=300_000
export type HarveyEvidence={
  v:1;scope:typeof HARVEY_EVIDENCE_SCOPE;projectId:string;nonce:string;issuedAt:number;expiresAt:number;company:ProspectCompany
}
export type HarveyTokenClaims={iss?:unknown;sub?:unknown;aud?:unknown;exp?:unknown;iat?:unknown;jti?:unknown;project_id?:unknown;owner_id?:unknown;environment?:unknown}
export type HarveyBridgePackage={evidence:HarveyEvidence;token:string;signature:string}
export const HARVEY_SIGNING_DOMAIN='omnira.harvey.webbuilder.scb.signed-proof.v1'
const encoded32=/^[A-Za-z0-9_-]{43}$/
const signature64=/^[A-Za-z0-9_-]{86}$/
/** Only a PUBLIC verifying key is configured locally. No SCB or Harvey signing secret is imported. */
function trustedHarveyPublicKey(env:Record<string,string|undefined>){
  try{
    const raw=env.WEBBUILDER_HARVEY_PUBLIC_JWK
    if(!raw||raw.length>1024)return null
    const jwk=JSON.parse(raw) as Record<string,unknown>
    if(!jwk||typeof jwk!=='object'||Array.isArray(jwk)||
       Object.keys(jwk).sort().join(',')!=='crv,kty,x,y'||
       jwk.kty!=='EC'||jwk.crv!=='P-256'||
       typeof jwk.x!=='string'||typeof jwk.y!=='string'||
       !encoded32.test(jwk.x)||!encoded32.test(jwk.y)||
       Buffer.from(jwk.x,'base64url').length!==32||Buffer.from(jwk.y,'base64url').length!==32)return null
    const key=createPublicKey({key:jwk as import('node:crypto').JsonWebKey,format:'jwk'})
    return key.asymmetricKeyType==='ec'&&key.asymmetricKeyDetails?.namedCurve==='prime256v1'?key:null
  }catch{return null}
}
export function canonicalHarveyProof(evidence:HarveyEvidence,oidcToken:string,host:string):string{
  if(!/^ai-operating-platform-[a-z0-9]+-bumbi190s-projects\.vercel\.app$/.test(host))throw new Error('invalid Harvey host')
  return HARVEY_SIGNING_DOMAIN+'\n'+host+'\n'+JSON.stringify(evidence)+'\n'+oidcToken
}
const pending=new Map<string,{projectId:string;userId:string;issuedAt:number}>()
export function harveyBridgeConfigured(env:Record<string,string|undefined>=process.env){
  if(env.WEBBUILDER_HARVEY_BRIDGE_ENABLED!=='true'||env.VERCEL||env.VERCEL_ENV||env.SCB_API_KEY)return false
  const origin=env.WEBBUILDER_HARVEY_BRIDGE_ORIGIN
  if(!origin)return false
  try{
    const url=new URL(origin)
    return url.protocol==='https:'&&/^ai-operating-platform-[a-z0-9]+-bumbi190s-projects\.vercel\.app$/.test(url.hostname)&&url.pathname==='/'&&!url.search&&!url.hash&&!url.username&&!url.password&&!url.port&&
      Boolean(trustedHarveyPublicKey(env))
  }catch{return false}
}
export function evidenceAudience(evidence:HarveyEvidence):string{
  return 'urn:omnira:webbuilder:scb-evidence:v1:'+createHash('sha256').update(JSON.stringify(evidence)).digest('hex')
}
export function beginHarveyBridge(userId:string,projectId:string,env:Record<string,string|undefined>=process.env,now=Date.now()){
  if(!harveyBridgeConfigured(env)||!uuid.test(userId)||projectId!==EdforsProjectId)throw new WebsiteBuildError('DISCOVERY_SOURCE_NOT_CONFIGURED',503)
  for(const [key,v] of pending)if(now-v.issuedAt>nonceTtlMs)pending.delete(key)
  if(pending.size>=24)throw new WebsiteBuildError('DISCOVERY_RATE_LIMITED',429)
  const nonce=randomBytes(32).toString('base64url')
  pending.set(nonce,{projectId,userId,issuedAt:now})
  const remote=new URL('/api/atlas/handlarborsen/lead-finder/webbuilder-scb-bridge',env.WEBBUILDER_HARVEY_BRIDGE_ORIGIN)
  remote.searchParams.set('projectId',projectId)
  remote.searchParams.set('nonce',nonce)
  return {url:remote.toString()}
}
function checkCompany(raw:unknown):ProspectCompany{
  const company=validateProspectContent({version:1,company:raw,website:null,capture:null,improvements:[],design:null,build:null,demo:null}).company
  if(company.source!=='scb'||company.orgnr!=='5566391735'||company.municipalityCode!=='1293'||!company.sniCodes.includes('47.811')||company.inactive||!/^scb\/\d{1,20}$/.test(company.sourceId)||company.sourceId!=='scb/'+company.cfar)throw new WebsiteBuildError('INVALID_SOURCE_RECEIPT',400)
  return company
}
export async function finishHarveyBridge(
  body:unknown,local:{projectId:string;userId:string},verify?:(token:string,audience:string)=>Promise<HarveyTokenClaims>,now=Date.now(),
  env:Record<string,string|undefined>=process.env
):Promise<ProspectCompany>{
  if(!body||typeof body!=='object'||Array.isArray(body))throw new WebsiteBuildError('INVALID_SOURCE_RECEIPT',400)
  const record=body as Record<string,unknown>
  if(Object.keys(record).sort().join(',')!=='evidence,signature,token'||typeof record.token!=='string'||record.token.length>5000||record.token.length<60||
     typeof record.signature!=='string'||!signature64.test(record.signature))throw new WebsiteBuildError('INVALID_SOURCE_RECEIPT',400)
  const e=record.evidence as HarveyEvidence|null
  if(!e||typeof e!=='object'||Array.isArray(e)||Object.keys(e).sort().join(',')!=='company,expiresAt,issuedAt,nonce,projectId,scope,v')throw new WebsiteBuildError('INVALID_SOURCE_RECEIPT',400)
  if(e.v!==1||e.scope!==HARVEY_EVIDENCE_SCOPE||e.projectId!==local.projectId||e.projectId!==EdforsProjectId||!noncePattern.test(e.nonce)||!Number.isSafeInteger(e.issuedAt)||!Number.isSafeInteger(e.expiresAt)||e.expiresAt-e.issuedAt!==nonceTtlMs||e.expiresAt<=now||e.issuedAt>now+clockSkewMs)throw new WebsiteBuildError('INVALID_SOURCE_RECEIPT',400)
  const stored=pending.get(e.nonce)
  if(!stored||stored.projectId!==local.projectId||stored.userId!==local.userId||stored.issuedAt>now||now-stored.issuedAt>nonceTtlMs)throw new WebsiteBuildError('INVALID_SOURCE_RECEIPT',400)
  pending.delete(e.nonce) // single use even if proof subsequently fails
  // Vercel OIDC alone identifies the shared Vercel *project*, not the Harvey branch.
  // A P-256 signature from the owner-approved, branch-scoped Harvey deployment is required too.
  const key=trustedHarveyPublicKey(env)
  if(!harveyBridgeConfigured(env)||!key)throw new WebsiteBuildError('INVALID_SOURCE_RECEIPT',400)
  try{
    const host=new URL(env.WEBBUILDER_HARVEY_BRIDGE_ORIGIN!).hostname
    const signature=Buffer.from(record.signature,'base64url')
    if(signature.length!==64||!verifySignature('sha256',Buffer.from(canonicalHarveyProof(e,record.token,host),'utf8'),
       {key,dsaEncoding:'ieee-p1363'},signature))throw new Error('invalid signature')
  }catch{throw new WebsiteBuildError('INVALID_SOURCE_RECEIPT',400)}
  const company=checkCompany(e.company)
  if(Date.parse(company.retrievedAt)>now+clockSkewMs||now-Date.parse(company.retrievedAt)>10*60_000)throw new WebsiteBuildError('INVALID_SOURCE_RECEIPT',400)
  const audience=evidenceAudience(e)
  let claims:HarveyTokenClaims
  try {
    claims=verify?await verify(record.token,audience):
      (await verifyVercelOidcToken(record.token,{issuer:HARVEY_OIDC_ISSUER,audience,subject:HARVEY_OIDC_SUBJECT,projectId:HARVEY_VERCEL_PROJECT_ID,ownerId:HARVEY_VERCEL_OWNER_ID,environment:'preview',clockTolerance:'5s'})).payload as HarveyTokenClaims
  }catch{throw new WebsiteBuildError('INVALID_SOURCE_RECEIPT',400)}
  if(claims.iss!==HARVEY_OIDC_ISSUER||claims.sub!==HARVEY_OIDC_SUBJECT||claims.aud!==audience||claims.jti!==e.nonce||claims.owner_id!==HARVEY_VERCEL_OWNER_ID||claims.project_id!==HARVEY_VERCEL_PROJECT_ID||claims.environment!=='preview'||typeof claims.exp!=='number'||claims.exp*1000<=now||typeof claims.iat!=='number'||claims.iat*1000>now+clockSkewMs)throw new WebsiteBuildError('INVALID_SOURCE_RECEIPT',400)
  return company
}
