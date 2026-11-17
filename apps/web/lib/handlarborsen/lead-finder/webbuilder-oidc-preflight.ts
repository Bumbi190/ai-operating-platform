import 'server-only'
import {createHash,randomBytes} from 'node:crypto'
import {createClient} from '@supabase/supabase-js'
import {exchangeVercelOidcToken,getContext,verifyVercelOidcToken} from '@vercel/oidc'
import {isPlatformOperatorEmail} from '@/lib/auth/platform-operator'

export const HARVEY_OIDC_PREFLIGHT_PATH='/api/atlas/handlarborsen/lead-finder/webbuilder-oidc-preflight'
const branch='codex/atlas-harvey-sales-20261017'
const projectId='prj_ZwTfAGuJBW8iCjfSzBqx0Jwjz03T'
const ownerId='team_NlGVrs9ZItxkK4nMgRblBCI4'
const issuer='https://oidc.vercel.com/bumbi190s-projects'
const subject='owner:bumbi190s-projects:project:ai-operating-platform-web:environment:preview'
const hostPattern=/^ai-operating-platform-[a-z0-9]+-bumbi190s-projects\.vercel\.app$/
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

function identity(env:Env):Identity|null{
 const commit=env.VERCEL_GIT_COMMIT_SHA??'',host=env.VERCEL_URL??'',deploymentId=env.VERCEL_DEPLOYMENT_ID??''
 if(env.HARVEY_OIDC_PREFLIGHT_ENABLED!=='true'||env.VERCEL!=='1'||env.VERCEL_ENV!=='preview'||
    env.VERCEL_TARGET_ENV&&env.VERCEL_TARGET_ENV!=='preview'||
    env.VERCEL_PROJECT_ID!==projectId||env.VERCEL_GIT_COMMIT_REF!==branch||
    !shaPattern.test(commit)||commit!==env.HARVEY_OIDC_PREFLIGHT_APPROVED_SHA||
    !hostPattern.test(host)||!idPattern.test(deploymentId))return null
 return {deploymentId,host,branch,commit}
}

/** Explicit user JWT: Auth GET only, no cookie refresh, admin client or project/database reads.
 * Keep the existing operator allowlist; no machine key or SSO-header fallback.
 */
async function authorize(request:Request,env:Env):Promise<boolean>{
 const bearer=request.headers.get('authorization')??''
 if(!/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(bearer)||bearer.length>8192)return false
 const url=env.NEXT_PUBLIC_SUPABASE_URL??'',anon=env.NEXT_PUBLIC_SUPABASE_ANON_KEY??''
 if(!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url)||!anon)return false
 const client=createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}})
 // An explicit JWT prevents getUser() from refreshing a stored session.
 const {data,error}=await client.auth.getUser(bearer.slice(7))
 return !error&&Boolean(data.user?.id)&&isPlatformOperatorEmail(data.user?.email)
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
  if(!await authorize(request,env))return fail(403)
  const expected=await expectedIdentity(request)
  if(!expected||Object.entries(current).some(([key,value])=>expected[key as keyof Identity]!==value))return fail(400)
  const nonce=randomBytes(32).toString('base64url')
  const audience='urn:omnira:harvey:oidc-preflight:v1:'+createHash('sha256')
   .update(JSON.stringify({...current,nonce})).digest('hex')
  // Never import or call the SCB/P-256 bridge. No token is returned or logged.
  const token=await getRuntimeProof({audience,jti:nonce,skipCache:true})
  if(typeof token!=='string'||token.length>8192)throw new Error('invalid proof')
  const now=Math.floor((deps.now??Date.now)()/1000)
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
  // SDK/Auth errors can contain tokens, URLs or credentials: never echo/log them.
  return fail(503)
 }
}
