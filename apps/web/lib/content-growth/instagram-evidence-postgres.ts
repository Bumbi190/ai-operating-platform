/**
 * Real PostgreSQL transport for the isolated local staging target only.
 * The app's runtime factory remains hard-disabled. No URL, environment-based
 * credentials, shared service-role client, production target or generic SQL API.
 * The database's scoped RPCs remain the authority; names are not authorization.
 */
import 'server-only'
import postgres from 'postgres'
import { X509Certificate } from 'node:crypto'
import { checkServerIdentity } from 'node:tls'
import {enqueueLocalInstagramEvidence,type LocalEvidenceQueueCommand} from './instagram-evidence-store'

type FixtureConfig=Readonly<{mode:'local-isolated-staging';user:string;password:string}>
  | Readonly<{mode:'local-isolated-tls';user:string;password:string;caPem:string}>
type Request=Readonly<{batchId:string;eventKey:string}>
type DeliveryRequest=Request&Readonly<{token:string}>
type Rows=readonly {reply?:unknown}[]
type Client=ReturnType<typeof postgres>
const socket='/var/run/postgresql/.s.PGSQL.5432'
const tlsHost='growth-staging.invalid'
// Budget is per loaded module instance, not a distributed connection limit.
let activeOperations=0
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const batch=/^[A-Za-z0-9_-]{1,128}$/
const key=/^[a-f0-9]{64}$/
const tokenValid=(s:unknown):s is string=>typeof s==='string'&&uuid.test(s)&&s!=='00000000-0000-0000-0000-000000000000'
const count=(n:unknown):n is number=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0&&n<=1000
const exact=(v:Record<string,unknown>,keys:string[])=>Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k))
const object=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v)
const plainStatuses=new Set(['denied_scope','missing','busy','done','stopped','exhausted','stale_claim'])
const stopReasons=new Set(['batch_or_cutoff','invalid_payload','publication_missing','invalid_interval','outside_window','invalid_metrics','conflict','capacity','after_cutoff','halted','sealed'])
type PlainStatus='denied_scope'|'missing'|'busy'|'done'|'stopped'|'exhausted'|'stale_claim'
type WorkerReply=
  | Readonly<{status:PlainStatus}>
  | Readonly<{status:'claimed';token:string;attempt:number}>
  | Readonly<{status:'done';retained:number;replayed:number;authorizesPilot:false}>
  | Readonly<{status:'stopped';reason:string;retained?:0;authorizesPilot?:false}>
  | Readonly<{status:'invalid_request'}>
  | Readonly<{status:'uncertain';reason:'transport_error'|'unexpected_reply'}>
const uncertain=(reason:'transport_error'|'unexpected_reply'):WorkerReply=>({status:'uncertain',reason})
function validateConfig(c:FixtureConfig,purpose:'ingress'|'worker'){
  if(!c||(c.mode!=='local-isolated-staging'&&c.mode!=='local-isolated-tls')||
    typeof c.user!=='string'||!new RegExp('^ge_stage_'+purpose+'(?:_[a-z0-9]{1,16})?$').test(c.user)||
    typeof c.password!=='string'||!/^[0-9a-f]{48}$/.test(c.password))
    throw Error('Invalid local evidence connection configuration')
  if(c.mode==='local-isolated-tls'){
    try{
      if(typeof c.caPem!=='string'||c.caPem.length>16384||
        !/^-----BEGIN CERTIFICATE-----\r?\n[A-Za-z0-9+/=\r\n]+-----END CERTIFICATE-----\r?\n?$/.test(c.caPem))
        throw Error('Invalid CA')
      const ca=new X509Certificate(c.caPem)
      if(!ca.ca||!ca.checkIssued(ca)||!ca.verify(ca.publicKey))throw Error('Invalid CA')
      return {user:c.user,password:c.password,ca:ca.toString()}
    }catch{throw Error('Invalid local evidence TLS trust anchor')}
  }
  return {user:c.user,password:c.password}
}
function runner(c:FixtureConfig,purpose:'ingress'|'worker'){
  const identity=validateConfig(c,purpose)
  let active=false
  return async (operation:(sql:Client)=>PromiseLike<Rows>):Promise<unknown>=>{
    if(active||activeOperations>=2)throw Error('Local evidence transport unavailable')
    active=true
    activeOperations++
    let sql:Client|undefined
    try{
      // Prevent driver fallback to a process-wide PG host/credential/config.
      // Check names only; do not read values or consult config files.
      if(Object.keys(process.env).some(k=>/^PG/i.test(k)||/^NODE_TLS_REJECT_UNAUTHORIZED$/i.test(k)))throw Error('Local evidence transport environment rejected')
      sql=postgres({
        ...(identity.ca ? {
          host:'127.0.0.1',ssl:{
            ca:identity.ca,rejectUnauthorized:true,minVersion:'TLSv1.2' as const,servername:tlsHost,
            checkServerIdentity:(_host:string,cert:import('node:tls').PeerCertificate)=>{
              const error=checkServerIdentity(tlsHost,cert)
              if(error)return error
              try{
                if(new X509Certificate(cert.raw).checkHost(tlsHost,{subject:'never',wildcards:false})!==tlsHost)
                  return Error('Invalid local evidence server identity')
              }catch{return Error('Invalid local evidence server identity')}
              return undefined
            },
          },sslnegotiation:'postgres' as const,channel_binding:'require' as const,
        } : {host:'/var/run/postgresql',path:socket,ssl:false as const,channel_binding:'disable' as const}),
        port:5432,database:'postgres',user:identity.user,password:identity.password,
        max:1,min:0,max_pipeline:1,prepare:false,fetch_types:false,infer:false,
        connect_timeout:3,queue_timeout:2,query_timeout:6,cancel_timeout:1,idle_timeout:2,max_lifetime:30,
        debug:false,onnotice:false,
        connection:{application_name:'omnira-growth-local-'+purpose,statement_timeout:5000,lock_timeout:1500,
          idle_in_transaction_session_timeout:5000,default_transaction_isolation:'read committed'},
      })
      const rows=await operation(sql)
      return rows.length===1&&object(rows[0])&&exact(rows[0],['reply'])?rows[0].reply:undefined
    }catch{throw Error('Local evidence transport uncertain')}
    finally{
      try{if(sql)await sql.end({timeout:1})}
      catch{throw Error('Local evidence transport uncertain')}
      finally{active=false;activeOperations--}
    }
  }
}
function validRequest(v:Request):boolean{
  return !!v&&typeof v.batchId==='string'&&batch.test(v.batchId)&&typeof v.eventKey==='string'&&key.test(v.eventKey)
}
function decode(v:unknown,operation:'claim'|'deliver'):WorkerReply{
  if(!object(v)||typeof v.status!=='string')return uncertain('unexpected_reply')
  if(exact(v,['status'])&&plainStatuses.has(v.status)&&
    !(operation==='claim'&&v.status==='stale_claim')&&!(operation==='deliver'&&v.status==='busy'))
    return {status:v.status as PlainStatus}
  if(operation==='claim'&&v.status==='claimed'&&exact(v,['status','token','attempt'])&&
    tokenValid(v.token)&&typeof v.attempt==='number'&&Number.isInteger(v.attempt)&&v.attempt>=1&&v.attempt<=3)
    return {status:'claimed',token:v.token,attempt:v.attempt}
  if(operation==='deliver'&&v.status==='done'&&exact(v,['status','retained','replayed','authorizesPilot'])&&
    count(v.retained)&&count(v.replayed)&&v.retained+v.replayed<=1000&&v.authorizesPilot===false)
    return {status:'done',retained:v.retained,replayed:v.replayed,authorizesPilot:false}
  if(v.status==='stopped'&&typeof v.reason==='string'&&stopReasons.has(v.reason)){
    if(exact(v,['status','reason'])&&v.reason==='batch_or_cutoff')return {status:'stopped',reason:v.reason}
    if(operation==='deliver'&&exact(v,['status','reason','retained','authorizesPilot'])&&v.retained===0&&v.authorizesPilot===false)
      return {status:'stopped',reason:v.reason,retained:0,authorizesPilot:false}
  }
  return uncertain('unexpected_reply')
}
export function createLocalEvidencePostgresIngress(config:FixtureConfig){
  const run=runner(config,'ingress')
  return Object.freeze({
    enqueue(command:LocalEvidenceQueueCommand){
      return enqueueLocalInstagramEvidence(command,clean=>run(sql=>sql`SELECT ge_stage_api.enqueue(${clean.envelope.target.batchId}::text,${clean.eventKey}::text,${JSON.stringify(clean.envelope)}::text::jsonb) AS reply`))
    },
  })
}
export function createLocalEvidencePostgresWorker(config:FixtureConfig){
  const run=runner(config,'worker')
  return Object.freeze({
    async claim(request:Request):Promise<WorkerReply>{
      if(!validRequest(request))return {status:'invalid_request'}
      const {batchId,eventKey}=request
      try{return decode(await run(sql=>sql`SELECT ge_stage_api.claim(${batchId}::text,${eventKey}::text) AS reply`),'claim')}
      catch{return uncertain('transport_error')}
    },
    async deliver(request:DeliveryRequest):Promise<WorkerReply>{
      if(!validRequest(request)||!tokenValid(request.token))return {status:'invalid_request'}
      const {batchId,eventKey,token}=request
      try{return decode(await run(sql=>sql`SELECT ge_stage_api.deliver(${batchId}::text,${eventKey}::text,${token}::uuid) AS reply`),'deliver')}
      catch{return uncertain('transport_error')}
    },
  })
}
