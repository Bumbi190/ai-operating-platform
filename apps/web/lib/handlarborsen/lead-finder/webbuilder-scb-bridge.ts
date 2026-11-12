import 'server-only'
import {createHash,createPrivateKey,sign} from 'node:crypto'
import {getVercelOidcToken} from '@vercel/oidc'
import {HANDLARBORSEN_PROJECT_ID} from '@/lib/atlas/handlarborsen-test-data/contracts'
import {resolveProjectAccess} from '@/lib/auth/project-access'
import {scbPreviewSearchApproved,getReadiness} from './readiness'
import {createScbWorkplaceMunicipalityFetcher,fetchScbLegalEntityByOrgnr,SCB_LIVE_HOST} from './scb-client'
import {paginateScb} from './scb-source'
import {evaluateScbCompany,parseLegalOrgnr} from './scb-status-policy'
import type {ScbRegisterRecord} from './types'

export const HARVEY_EVIDENCE_SCOPE='omnira.webbuilder.scb.evidence.v1'
export const HARVEY_PILOT_ORGNR='5566391735'
export const HARVEY_PILOT_MUNICIPALITY='1293'
const ONLY_ALLOWED_ORIGIN='http://localhost:56994'
const MAX_AGE_MS=300_000
const headers={'cache-control':'private, no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff'}
const uid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const noncePattern=/^[A-Za-z0-9_-]{43}$/
const sourceUrl='https://www.scb.se/vara-tjanster/bestall-data-och-statistik/foretagsregistret/'
const reply=(status:number,statusText:string)=>Response.json({status:statusText},{status,headers})
export type HarveyEvidence={
  v:1;scope:typeof HARVEY_EVIDENCE_SCOPE;projectId:string;nonce:string;issuedAt:number;expiresAt:number
  company:{source:'scb';sourceId:string;sourceUrl:string;retrievedAt:string;name:string;branchName:string;orgnr:string;cfar:string;city:string|null;municipalityCode:'1293';sniCodes:string[];restricted:boolean;inactive:false}
}
export function evidenceAudience(evidence:HarveyEvidence):string{
  return 'urn:omnira:webbuilder:scb-evidence:v1:'+createHash('sha256').update(JSON.stringify(evidence)).digest('hex')
}
export const HARVEY_SIGNING_DOMAIN='omnira.harvey.webbuilder.scb.signed-proof.v1'
const deploymentHost=/^ai-operating-platform-[a-z0-9]+-bumbi190s-projects\.vercel\.app$/
const sha40=/^[a-f0-9]{40}$/
/** The owner pins the exact approved commit and a branch-scoped private signer in Vercel.
 * No private signing value is ever included in source, response bodies, or application logs.
 * WEBBUILDER_HARVEY_PRIVATE_JWK must be configured as a Vercel Secret only on PR #386's branch.
 */
export function harveyAttestationReady(env:Record<string,string|undefined>):boolean{
  const commit=env.VERCEL_GIT_COMMIT_SHA??''
  return sha40.test(commit)&&commit===env.HARVEY_WEBBUILDER_APPROVED_SHA&&
    deploymentHost.test(env.VERCEL_URL??'')&&Boolean(env.HARVEY_WEBBUILDER_PRIVATE_JWK?.trim())
}
export function canonicalHarveyProof(evidence:HarveyEvidence,oidcToken:string,host:string):string{
  if(!deploymentHost.test(host))throw new Error('untrusted deployment host')
  return HARVEY_SIGNING_DOMAIN+'\n'+host+'\n'+JSON.stringify(evidence)+'\n'+oidcToken
}
function signHarveyProof(payload:string,env:Record<string,string|undefined>):string{
  try{
    const raw=env.HARVEY_WEBBUILDER_PRIVATE_JWK
    if(!raw||raw.length>3000)throw new Error('signer not configured')
    const parsed=JSON.parse(raw) as Record<string,unknown>
    if(!parsed||parsed.kty!=='EC'||parsed.crv!=='P-256'||typeof parsed.d!=='string'||
       typeof parsed.x!=='string'||typeof parsed.y!=='string')throw new Error('unsupported signer')
    const key=createPrivateKey({key:parsed as import('node:crypto').JsonWebKey,format:'jwk'})
    if(key.asymmetricKeyType!=='ec'||key.asymmetricKeyDetails?.namedCurve!=='prime256v1')throw new Error('unsupported signer')
    return sign('sha256',Buffer.from(payload,'utf8'),{key,dsaEncoding:'ieee-p1363'}).toString('base64url')
  }catch{
    // Never disclose parsing errors, private key material, or lower-level crypto output.
    throw new Error('attestation unavailable')
  }
}
function parseInput(value:URLSearchParams):{projectId:string;nonce:string}|null{
  const keys=[...value.keys()].sort()
  if(keys.join(',')!=='nonce,projectId'||!uid.test(value.get('projectId')??'')||!noncePattern.test(value.get('nonce')??''))return null
  return {projectId:value.get('projectId')!,nonce:value.get('nonce')!}
}
export type BridgeCompany=HarveyEvidence['company']
export type HarveyBridgeDeps={
  env?:Record<string,string|undefined>
  authorized?:()=>Promise<boolean>
  findCompany?:()=>Promise<BridgeCompany|null>
  attest?:(audience:string,nonce:string)=>Promise<string>
  signEvidence?:(canonicalProof:string)=>Promise<string>|string
  now?:()=>number
}
async function fetchPilotCompany():Promise<BridgeCompany|null>{
  // Reuses the same SCB client, mapper, legal status policy and rate limiter as Harvey.
  // Never writes a Harvey candidate, prospect, contact or sales record.
  const results=await paginateScb(createScbWorkplaceMunicipalityFetcher({
    municipalityCode:HARVEY_PILOT_MUNICIPALITY,baseUrl:'https://'+SCB_LIVE_HOST,
    liveApproved:true
  }),{pageSize:5000,maxPages:2,maxRows:10000,maxRetries:0,requestsPerSecond:2})
  const workplaces=results.rows.filter((r:ScbRegisterRecord)=>{
    const legal=parseLegalOrgnr(r.orgnr)
    return legal.ok&&legal.orgnr===HARVEY_PILOT_ORGNR&&r.municipalityCode===HARVEY_PILOT_MUNICIPALITY&&r.sniCodes.includes('47.811')&&/^\d{1,20}$/.test(r.cfar??'')
  })
  // Ambiguous company workplaces are an explicit NO-GO, not a guessed CFAR.
  const unique=[...new Map(workplaces.map(r=>[r.cfar,r])).values()]
  if(unique.length!==1||results.truncated)return null
  const workplace=unique[0]
  const legal=await fetchScbLegalEntityByOrgnr({orgnr:HARVEY_PILOT_ORGNR,baseUrl:'https://'+SCB_LIVE_HOST,liveApproved:true})
  const review=evaluateScbCompany({expectedOrgnr:HARVEY_PILOT_ORGNR,je:legal})
  if(!review.ok||review.status.class!=='ACTIVE_PER_SCB'||review.orgnr!==HARVEY_PILOT_ORGNR||typeof review.legalName!=='string'||review.legalName.trim().length<2||!['49','31','96'].includes(review.legalForm.code??''))return null
  return {source:'scb',sourceId:'scb/'+workplace.cfar,sourceUrl,retrievedAt:new Date().toISOString(),
    name:review.legalName,branchName:workplace.name??'',orgnr:review.orgnr,cfar:workplace.cfar!,
    city:workplace.city??null,municipalityCode:'1293',sniCodes:['47.811'],
    restricted:review.marketing.post.code===2||review.marketing.email.code===2||review.marketing.phone.code===2||review.marketing.phone.code===3,
    inactive:false}
}
function html(projectId:string,nonce:string){
  const form='<form method="post"><input type="hidden" name="projectId" value="'+projectId+'"><input type="hidden" name="nonce" value="'+nonce+'"><button type="submit">Verifiera Edfors Bil hos SCB</button></form>'
  return '<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>Harvey · SCB-verifiering</title></head><body><main><h1>Verifiera Edfors Bil</h1><p>Endast läsning från SCB. Inga kontakter eller produktionsskrivningar.</p>'+form+'</main></body></html>'
}
export async function handleHarveyScbBridge(request:Request,deps:HarveyBridgeDeps={}):Promise<Response>{
  const env=deps.env??process.env
  if(env.VERCEL_ENV!=='preview'||env.VERCEL_GIT_COMMIT_REF!=='codex/atlas-harvey-sales-20261017'||
     !scbPreviewSearchApproved(env)||!getReadiness(env).liveSearchAvailable||!harveyAttestationReady(env))return reply(404,'disabled')
  if(!['GET','POST'].includes(request.method))return reply(405,'method_not_allowed')
  if(request.method==='POST'){
    if(new URL(request.url).search)return reply(400,'invalid_request')
    if(request.headers.get('origin')!==new URL(request.url).origin)return reply(403,'denied')
    const type=(request.headers.get('content-type')??'').split(';')[0].trim().toLowerCase()
    if(type!=='application/x-www-form-urlencoded')return reply(415,'invalid_content_type')
    const len=request.headers.get('content-length')
    if(len!==null&&(!/^\d+$/.test(len)||Number(len)>512))return reply(413,'too_large')
  }
  const authorized=await(deps.authorized??(async()=>{
    const access=await resolveProjectAccess()
    return access.ok&&access.allowedProjectIds.includes(HANDLARBORSEN_PROJECT_ID)
  }))()
  if(!authorized)return reply(403,'denied')
  let params:URLSearchParams
  try{
    if(request.method==='POST'){
      const body=await request.text()
      if(body.length>512)return reply(413,'too_large')
      params=new URLSearchParams(body)
    }else params=new URL(request.url).searchParams
  }catch{return reply(400,'invalid_request')}
  const input=parseInput(params)
  if(!input)return reply(400,'invalid_request')
  if(request.method==='GET')return new Response(html(input.projectId,input.nonce),{
    headers:{...headers,'content-type':'text/html; charset=utf-8','content-security-policy':"default-src 'none'; form-action 'self'; style-src 'unsafe-inline'; base-uri 'none'"}
  })
  let company:BridgeCompany|null
  try{company=await(deps.findCompany??fetchPilotCompany)()}catch{return reply(503,'source_unavailable')}
  if(!company)return reply(409,'identity_unresolved')
  if(company.orgnr!==HARVEY_PILOT_ORGNR||company.municipalityCode!==HARVEY_PILOT_MUNICIPALITY||company.inactive)return reply(409,'identity_unresolved')
  const now=(deps.now??Date.now)()
  const evidence:HarveyEvidence={v:1,scope:HARVEY_EVIDENCE_SCOPE,projectId:input.projectId,nonce:input.nonce,issuedAt:now,expiresAt:now+MAX_AGE_MS,company}
  let token:string,signature:string
  try{
    token=await(deps.attest??((audience,nonce)=>getVercelOidcToken({audience,jti:nonce,skipCache:true})))(evidenceAudience(evidence),input.nonce)
    const payload=canonicalHarveyProof(evidence,token,env.VERCEL_URL!)
    signature=await(deps.signEvidence??(proof=>signHarveyProof(proof,env)))(payload)
    if(!/^[A-Za-z0-9_-]{86}$/.test(signature))throw new Error('invalid signature')
  }catch{return reply(503,'attestation_unavailable')}
  // The fragment never reaches the localhost server in HTTP requests or logs.
  const callback=new URL('/build/prospects',ONLY_ALLOWED_ORIGIN)
  callback.searchParams.set('projectId',input.projectId)
  callback.hash='harveyBridge='+encodeURIComponent(JSON.stringify({evidence,token,signature}))
  return new Response(null,{status:303,headers:{...headers,location:callback.toString()}})
}
