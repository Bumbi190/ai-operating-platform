import 'server-only'
import {createClient} from '@supabase/supabase-js'
import type {Database} from '@/lib/supabase/types'

// Isolated replay only. Not wired to the scheduled production route.
// The fixture role has no production credential or persistent database grant.
const fixtureRole='social_schedule_rpc_only_fixture'
const fixtureIssuer='omnira-schedule-fixture'
const denied=():never=>{throw new Error('SOCIAL_SCHEDULE_FIXTURE_IDENTITY_DENIED')}
type TokenClaims={role?:unknown;sub?:unknown;iss?:unknown;aud?:unknown;iat?:unknown;nbf?:unknown;exp?:unknown}
export type ScopedScheduleFixtureOptions={
  url:string
  publishableKey:string
  expectedSubject:string
  getAccessToken:()=>Promise<string>
  transport:typeof fetch
  now?:()=>number
}
function checkedToken(value:unknown,subject:string,now:number):string{
  if(typeof value!=='string')return denied()
  if(value.length>8192)denied()
  const parts=value.split('.')
  if(parts.length!==3||parts.some(part=>!part||!/^[A-Za-z0-9_-]+$/.test(part)))denied()
  let header:{alg?:unknown;typ?:unknown}={},claims:TokenClaims={}
  try{
    header=JSON.parse(Buffer.from(parts[0],'base64url').toString('utf8'))
    claims=JSON.parse(Buffer.from(parts[1],'base64url').toString('utf8'))
  }catch{return denied()}
  if(!header||header.alg!=='HS256'||header.typ!=='JWT'||
    !claims||claims.role!==fixtureRole||claims.sub!==subject||
    claims.iss!==fixtureIssuer||claims.aud!=='authenticated'||
    !Number.isInteger(claims.iat)||!Number.isInteger(claims.exp)||
    typeof claims.iat!=='number'||typeof claims.exp!=='number'||
    claims.iat>now+30||claims.iat<now-600||
    claims.exp<now+15||claims.exp>now+600||
    claims.exp-claims.iat>600||
    claims.nbf!==undefined&&(!Number.isInteger(claims.nbf)||typeof claims.nbf!=='number'||claims.nbf>now+30))denied()
  // Claims parsing is only an early fail-closed check. PostgREST MUST
  // verify JWT signature/role with its configured trusted signing key.
  return value
}
export function createScopedScheduleFixtureClient(options:ScopedScheduleFixtureOptions){
  if(process.env.NODE_ENV!=='test')denied()
  let parsed:URL
  try{parsed=new URL(options.url)}catch{return denied()}
  if(parsed.origin!=='https://schedule-fixture.invalid'||parsed.username||parsed.password||parsed.port||
    parsed.pathname!=='/'||parsed.search||parsed.hash||
    !/^sb_publishable_[A-Za-z0-9_-]{6,}$/.test(options.publishableKey)||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(options.expectedSubject)||
    typeof options.getAccessToken!=='function'||typeof options.transport!=='function')denied()
  const client=createClient<Database>(options.url,options.publishableKey,{
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
    accessToken:async()=>{
      let token:unknown
      try{token=await options.getAccessToken()}catch{denied()}
      return checkedToken(token,options.expectedSubject,Math.floor((options.now?.()??Date.now())/1000))
    },
    global:{fetch:(input,init)=>options.transport(input,{...init,cache:'no-store'})},
  })
  // Hand the worker an RPC-only facade: it cannot even call from(), storage,
  // auth or non-scheduler functions from this test client.
  const allowed=new Set([
    'social_schedule_claim','social_schedule_authorize_write','social_schedule_step',
    'social_schedule_peek','social_schedule_receipt','social_schedule_recover_checkpoint',
  ])
  return Object.freeze({
    rpc:async(name:string,args:Record<string,unknown>)=>{
      if(!allowed.has(name))throw new Error('SOCIAL_SCHEDULE_FIXTURE_RPC_DENIED')
      // The generated Database type predates these fixture-only RPC entries.
      return client.rpc(name as never,args as never)
    },
  })
}
