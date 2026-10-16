import 'server-only'
import type {createAdminClient} from '@/lib/supabase/admin'
import type {SocialLaunchPrincipal} from '@/lib/social-launch/types'
import {ConnectionError,type Provider,type Grant,type Candidate,type ConnectionView} from './types'
type Db=ReturnType<typeof createAdminClient>
export type BeginInput={projectId:string;provider:Provider;planRevisionId:string;expectedBindingId:string|null;stateHash:string;verifier:string}
export type ConsumedIntent={intentId:string;projectId:string;provider:Provider;planRevisionId:string;expectedBindingId:string|null;verifier:string}
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i
export function connectionFields(value:unknown,keys:string[]):asserts value is Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!keys.includes(k)))throw new ConnectionError('INVALID_BODY')}
export function connectionId(value:unknown):asserts value is string{if(typeof value!=='string'||!uuid.test(value))throw new ConnectionError('INVALID_BODY')}
export function connectionProvider(value:unknown):asserts value is Provider{if(!['linkedin','pinterest','x'].includes(value as string))throw new ConnectionError('INVALID_BODY')}
function scoped(p:SocialLaunchPrincipal,projectId:string){connectionId(p.userId);connectionId(projectId);if(!p.allowedProjectIds.includes(projectId))throw new ConnectionError('NOT_FOUND')}
function bounded(value:unknown,max:number){if(typeof value!=='string'||!value||value.length>max||/[\u0000-\u001f\u007f]/.test(value))throw new ConnectionError('INVALID_BODY')}
function future(value:unknown){bounded(value,40);if(!Number.isFinite(Date.parse(value as string))||Date.parse(value as string)<=Date.now())throw new ConnectionError('INVALID_BODY')}
function grant(value:Grant,provider?:Provider){
 connectionFields(value,['accessToken','refreshToken','scopes','expiresAt','refreshExpiresAt','candidates']);bounded(value.accessToken,16384)
 if(value.refreshToken!==null)bounded(value.refreshToken,16384);future(value.expiresAt);if(value.refreshExpiresAt!==null)future(value.refreshExpiresAt)
 if(!Array.isArray(value.scopes)||value.scopes.length>20||!value.scopes.every(s=>typeof s==='string'&&/^[A-Za-z0-9_:.-]{1,200}$/.test(s))||!Array.isArray(value.candidates)||value.candidates.length<1||value.candidates.length>100)throw new ConnectionError('INVALID_BODY')
 const seen=new Set<string>()
 for(const c of value.candidates){
  connectionFields(c,['key','accountId','accountLabel','destinationId','destinationLabel'])
  for(const id of [c.key,c.accountId])if(typeof id!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(id))throw new ConnectionError('INVALID_BODY')
  if(seen.has(c.key))throw new ConnectionError('INVALID_BODY');seen.add(c.key);bounded(c.accountLabel,200)
  if(c.destinationId!==null&&(typeof c.destinationId!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(c.destinationId)))throw new ConnectionError('INVALID_BODY')
  if(c.destinationLabel!==null)bounded(c.destinationLabel,200)
 }
}
const codes=['INVALID_BODY','NOT_FOUND','CONFLICT','PLAN_REVIEW_REQUIRED','BINDING_CHANGED','EXPIRED','ACCOUNT_IN_USE','UNAVAILABLE','CONFIGURATION_REQUIRED','COST_POLICY_REQUIRED','PROVIDER_DENIED','SCOPE_MISSING','IDENTITY_UNVERIFIED','INVENTORY_LIMIT'] as const
async function call<T>(db:Db,p:SocialLaunchPrincipal,name:string,input:unknown):Promise<T>{
 connectionId(p.userId)
 const {data,error}=await (db as unknown as {rpc:(name:string,args:Record<string,unknown>)=>Promise<{data:unknown;error:{message?:string;code?:string}|null}>}).rpc(name,{p_principal:p,p_input:input})
 if(error){
  const known=codes.find(code=>error.message?.includes('SOCIAL_CONNECTION_'+code))
  const code=known??(error.code==='P0002'||error.code==='42501'?'NOT_FOUND':error.code==='23505'?(error.message?.includes('social_account_bindings_account_single_project')?'ACCOUNT_IN_USE':'CONFLICT'):['22P02','23502','23514'].includes(error.code??'')?'INVALID_BODY':'UNAVAILABLE')
  throw new ConnectionError(code)
 }
 if(!data)throw new ConnectionError('UNAVAILABLE')
 return data as T
}
export async function beginConnection(db:Db,p:SocialLaunchPrincipal,input:BeginInput):Promise<{intentId:string}>{
 connectionFields(input,['projectId','provider','planRevisionId','expectedBindingId','stateHash','verifier']);scoped(p,input.projectId);connectionProvider(input.provider);connectionId(input.planRevisionId)
 if(input.provider==='x')throw new ConnectionError('COST_POLICY_REQUIRED')
 if(input.expectedBindingId!==null)connectionId(input.expectedBindingId)
 if(typeof input.stateHash!=='string'||!/^[a-f0-9]{64}$/.test(input.stateHash)||typeof input.verifier!=='string'||!/^[A-Za-z0-9_-]{43,128}$/.test(input.verifier))throw new ConnectionError('INVALID_BODY')
 return call(db,p,'social_connection_begin',input)
}
export async function consumeConnection(db:Db,p:SocialLaunchPrincipal,input:{provider:Provider;stateHash:string}):Promise<ConsumedIntent>{
 connectionFields(input,['provider','stateHash']);connectionProvider(input.provider)
 if(input.provider==='x')throw new ConnectionError('COST_POLICY_REQUIRED')
 if(typeof input.stateHash!=='string'||!/^[a-f0-9]{64}$/.test(input.stateHash))throw new ConnectionError('INVALID_BODY')
 return call(db,p,'social_connection_consume',input)
}
export async function stageConnection(db:Db,p:SocialLaunchPrincipal,input:{intentId:string;grant:Grant}):Promise<ConnectionView>{
 connectionFields(input,['intentId','grant']);connectionId(input.intentId);grant(input.grant)
 return call(db,p,'social_connection_stage',input)
}
export async function readConnection(db:Db,p:SocialLaunchPrincipal,input:{projectId:string;intentId:string}):Promise<ConnectionView>{
 connectionFields(input,['projectId','intentId']);scoped(p,input.projectId);connectionId(input.intentId)
 return call(db,p,'social_connection_read',input)
}
export async function commitConnection(db:Db,p:SocialLaunchPrincipal,input:{projectId:string;intentId:string;candidateKey:string}):Promise<ConnectionView>{
 connectionFields(input,['projectId','intentId','candidateKey']);scoped(p,input.projectId);connectionId(input.intentId)
 if(typeof input.candidateKey!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(input.candidateKey))throw new ConnectionError('INVALID_BODY')
 return call(db,p,'social_connection_commit',input)
}
