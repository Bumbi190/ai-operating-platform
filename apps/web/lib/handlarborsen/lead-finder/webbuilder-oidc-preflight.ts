import 'server-only'
import {createHash,randomBytes,timingSafeEqual} from 'node:crypto'
import {exchangeVercelOidcToken,getContext,verifyVercelOidcToken} from '@vercel/oidc'

export const HARVEY_OIDC_PREFLIGHT_PATH='/api/atlas/handlarborsen/lead-finder/webbuilder-oidc-preflight'
const branch='codex/atlas-harvey-sales-20261017'
const projectId='prj_WTzaRAskqTqYhJLVfoPtIVNAA1iS'
const ownerId='team_NlGVrs9ZItxkK4nMgRblBCI4'
const issuer='https://oidc.vercel.com/bumbi190s-projects'
const subject='owner:bumbi190s-projects:project:harvey-oidc-test:environment:preview'
const hostPattern=/^harvey-oidc-test-[a-z0-9]+-bumbi190s-projects\.vercel\.app$/
const shaPattern=/^[a-f0-9]{40}$/
const idPattern=/^dpl_[A-Za-z0-9]{20,64}$/
const headers={'cache-control':'private, no-store','referrer-policy':'no-referrer','x-content-type-options':'nosniff'}
type Env=Record<string,string|undefined>
type Identity={deploymentId:string;host:string;branch:string;commit:string}
type Claims=Record<string,unknown>
export type PreflightDeps={
 env?:Env
 now?:()=>number
}
const fail=(status:number)=>Response.json({scope:'harvey-oidc-preflight',status:'FAIL'},{status,headers})

// Reject provisioned production authority by name without reading any secret values.
const forbiddenConfig=/^(NEXT_PUBLIC_SUPABASE_|SUPABASE_|THE_PROMPT_.*(KEY|URL)|DATABASE_URL$|DIRECT_URL$|CRON_SECRET$|SCB_.*KEY$|AWS_BEDROCK_.*ROLE_ARN$|AWS_(ACCESS_KEY_ID|SECRET_ACCESS_KEY|SESSION_TOKEN)$)|SERVICE_ROLE|PRIVATE_JWK|P256.*PRIVATE/

function identity(env:Env):Identity|null{
 if(Object.keys(env).some(key=>forbiddenConfig.test(key)))return null
 const commit=env.VERCEL_GIT_COMMIT_SHA??'',host=env.VERCEL_URL??'',deploymentId=env.VERCEL_DEPLOYMENT_ID??''
 if(env.HARVEY_OIDC_PREFLIGHT_ENABLED!=='true'||env.VERCEL!=='1'||env.VERCEL_ENV!=='preview'||
    env.VERCEL_TARGET_ENV&&env.VERCEL_TARGET_ENV!=='preview'||
    env.VERCEL_PROJECT_ID!==projectId||env.VERCEL_GIT_COMMIT_REF!==branch||
    !shaPattern.test(commit)||commit!==env.HARVEY_OIDC_PREFLIGHT_APPROVED_SHA||
    !hostPattern.test(host)||!idPattern.test(deploymentId))return null
 return {deploymentId,host,branch,commit}
}

/** Separate test credential: no Supabase identity, cookies, sessions or external auth request.
 * Owner provisions only its context-bound SHA-256 digest and an explicit <= five-minute window.
 * Never generate or store a live credential here. This is not a durable single-use credential.
 */
function authorize(request:Request,env:Env,current:Identity,now:number):boolean{
 const bearer=request.headers.get('authorization')??''
 if(!/^Bearer hvo_test_[A-Za-z0-9_-]{43}$/.test(bearer))return false
 const digest=env.HARVEY_OIDC_PREFLIGHT_TEST_AUTH_SHA256??''
 const from=env.HARVEY_OIDC_PREFLIGHT_TEST_AUTH_NOT_BEFORE??''
 const until=env.HARVEY_OIDC_PREFLIGHT_TEST_AUTH_EXPIRES_AT??''
 if(!/^[a-f0-9]{64}$/.test(digest)||!/^\d{1,11}$/.test(from)||!/^\d{1,11}$/.test(until))return false
 const notBefore=Number(from),expiresAt=Number(until)
 if(!Number.isSafeInteger(notBefore)||!Number.isSafeInteger(expiresAt)||
    String(notBefore)!==from||String(expiresAt)!==until||
    expiresAt<=notBefore||expiresAt-notBefore>300||now<notBefore||now>=expiresAt)return false
 const actual=createHash('sha256').update(JSON.stringify({
  projectId,ownerId,branch,commit:current.commit,path:HARVEY_OIDC_PREFLIGHT_PATH,
  notBefore,expiresAt,credential:bearer.slice(7),
 })).digest()
 return timingSafeEqual(actual,Buffer.from(digest,'hex'))
}

async function expectedIdentity(request:Request):Promise<Identity|null>{
 if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')return null
 const length=request.headers.get('content-length')
 if(length!==null&&(!/^\d+$/.test(length)||Number(length)>1024))return null
 if(!request.body)return null
 const reader=request.body.getReader(),chunks:Uint8Array[]=[]
 let size=0
 try{
  for(;;){
   const part=await reader.read()
   if(part.done)break
   size+=part.value.length
   if(size>1024){await reader.cancel();return null}
   chunks.push(part.value)
  }
 }finally{reader.releaseLock()}
 try{
  const value=JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string,unknown>
  if(!value||typeof value!=='object'||Array.isArray(value)||
     Object.keys(value).sort().join(',')!=='branch,commit,deploymentId,host'||
     !Object.values(value).every(v=>typeof v==='string'))return null
  return value as Identity
 }catch{return null}
}

/** These optional claim names are NOT promised by Vercel. Missing != verified.
 * Runtime identity and an audience chosen by this function are not issuer-attested Git provenance.
 */
function optionalIdentityClaims(claims:Claims,current:Identity){
 const fields={deployment_id:current.deploymentId,deployment_url:current.host,
  git_commit_ref:current.branch,git_commit_sha:current.commit}
 const checked:Record<string,'matched'|'absent'>={}
 for(const [key,value] of Object.entries(fields)){
  if(Object.hasOwn(claims,key)){
   if(claims[key]!==value)throw new Error('identity mismatch')
   checked[key]='matched'
  }else checked[key]='absent'
 }
 return checked
}

/** Only the platform request context is a permitted source. No CLI, token file or env fallback. */
async function getRuntimeProof(options:{audience:string;jti:string;skipCache:true}):Promise<string>{
 const token=getContext().headers?.['x-vercel-oidc-token']
 if(!token||token.length>8192)throw new Error('runtime proof unavailable')
 return exchangeVercelOidcToken({token,...options})
}

export async function handleHarveyOidcPreflight(request:Request,deps:PreflightDeps={}):Promise<Response>{
 try{
  const env=deps.env??process.env,current=identity(env)
  if(!current)return fail(404)
  const url=new URL(request.url),origin='https://'+current.host
  if(url.origin!==origin||url.pathname!==HARVEY_OIDC_PREFLIGHT_PATH||url.search||
     request.headers.get('origin')!==origin)return fail(403)
  if(request.method!=='POST')return fail(405)
  const authNow=Math.floor((deps.now??Date.now)()/1000)
  if(!Number.isSafeInteger(authNow))return fail(503)
  if(!authorize(request,env,current,authNow))return fail(403)
  const expected=await expectedIdentity(request)
  if(!expected||Object.entries(current).some(([key,value])=>expected[key as keyof Identity]!==value))return fail(400)
  const nonce=randomBytes(32).toString('base64url')
  const audience='urn:omnira:harvey:oidc-preflight:v1:'+createHash('sha256')
   .update(JSON.stringify({...current,nonce})).digest('hex')
  // Never import or call the SCB/P-256 bridge. No token is returned or logged.
  const token=await getRuntimeProof({audience,jti:nonce,skipCache:true})
  if(typeof token!=='string'||token.length>8192)throw new Error('invalid proof')
  const now=Math.floor((deps.now??Date.now)()/1000)
  if(!Number.isSafeInteger(now))return fail(503)
  // Recheck expiry after the asynchronous exchange; do not validate at request-start time.
  if(!authorize(request,env,current,now))return fail(403)
  const {payload}=await verifyVercelOidcToken(token,{issuer,audience,subject,projectId,ownerId,
   environment:'preview',algorithms:['RS256'],clockTolerance:5,maxTokenAge:'5m',currentDate:new Date(now*1000)})
  const claims=payload as Claims
  // Vercel documents function-token validity of up to two hours. Freshness is a separate five-minute gate.
  if(claims.iss!==issuer||claims.sub!==subject||claims.aud!==audience||claims.jti!==nonce||
     claims.project_id!==projectId||claims.owner_id!==ownerId||claims.environment!=='preview'||
     !Number.isSafeInteger(claims.iat)||!Number.isSafeInteger(claims.exp)||
     (claims.iat as number)>now+5||(claims.iat as number)<now-300||
     (claims.exp as number)<=now||(claims.exp as number)<=(claims.iat as number)||(claims.exp as number)-(claims.iat as number)>7200)throw new Error('invalid claims')
  const identityClaims=optionalIdentityClaims(claims,current)
  return Response.json({scope:'harvey-oidc-preflight',status:'PASS',
   oidc:{signature:'verified',issuer,audience:'request-bound',projectId,environment:'preview',
    maxAcceptedAgeSeconds:300,tokenLifetimeSeconds:(claims.exp as number)-(claims.iat as number)},
   deployment:{...current,source:'runtime-compared-to-operator-expectation',tokenClaims:identityClaims},
   scbCalled:false,p256Signed:false,businessDatabaseCalled:false},{headers})
 }catch{
  // SDK errors can contain tokens, URLs or credentials: never echo/log them.
  return fail(503)
 }
}
