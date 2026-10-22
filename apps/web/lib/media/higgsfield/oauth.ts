import 'server-only'
import {createHash,randomBytes} from 'node:crypto'
import {auth,refreshAuthorization,type OAuthClientProvider,type OAuthClientMetadata,type StoredOAuthClientInformation,type StoredOAuthTokens,type OAuthDiscoveryState,type OAuthClientInformationContext} from '@modelcontextprotocol/client'
import {assertHiggsfieldUrl,createHiggsfieldFetch,HIGGSFIELD_ISSUER,HIGGSFIELD_MCP_URL,requireHiggsfieldConfig} from './config'
import {sealProviderPayload,openProviderPayload} from './crypto'
import {createHiggsfieldStore,type HiggsfieldStore} from './store'
import {HiggsfieldError,type HiggsfieldFailure} from './types'

export interface OAuthPayload {
 clientInformation?:StoredOAuthClientInformation
 tokens?:StoredOAuthTokens
 discovery?:OAuthDiscoveryState
 codeVerifier?:string
 expiresAt?:number
}
function assertIssuer(ctx?:OAuthClientInformationContext) {
 if(ctx && ctx.issuer!==HIGGSFIELD_ISSUER)throw new HiggsfieldError('invalid_endpoint')
}
function checkDiscovery(s:OAuthDiscoveryState) {
 if(s.authorizationServerUrl!==HIGGSFIELD_ISSUER)throw new HiggsfieldError('invalid_endpoint')
 if(s.authorizationServerMetadata?.issuer!==HIGGSFIELD_ISSUER)throw new HiggsfieldError('invalid_endpoint')
 if(s.resourceMetadata?.resource!==HIGGSFIELD_MCP_URL)throw new HiggsfieldError('invalid_endpoint')
 for(const [key,value] of Object.entries(s.authorizationServerMetadata??{}))
  if(key.endsWith('_endpoint')&&typeof value==='string')assertHiggsfieldUrl(value,'issuer')
}
class Provider implements OAuthClientProvider {
 authorizationUrl?:string
 constructor(readonly redirectUrl:string,readonly stateValue:string,readonly payload:OAuthPayload) {}
 get clientMetadata():OAuthClientMetadata {return {client_name:'Omnira The Prompt',redirect_uris:[this.redirectUrl],grant_types:['authorization_code','refresh_token'],response_types:['code'],token_endpoint_auth_method:'none',scope:'openid email offline_access'}}
 state(){return this.stateValue}
 clientInformation(ctx?:OAuthClientInformationContext){assertIssuer(ctx);return this.payload.clientInformation}
 saveClientInformation(value:StoredOAuthClientInformation,ctx?:OAuthClientInformationContext){assertIssuer(ctx);this.payload.clientInformation=value}
 tokens(ctx?:OAuthClientInformationContext){assertIssuer(ctx);return this.payload.tokens}
 saveTokens(value:StoredOAuthTokens,ctx?:OAuthClientInformationContext){
  assertIssuer(ctx)
  this.payload.tokens={...value,refresh_token:value.refresh_token??this.payload.tokens?.refresh_token}
  this.payload.expiresAt=Date.now()+(value.expires_in??0)*1000
 }
 redirectToAuthorization(url:URL){
  assertHiggsfieldUrl(url,'issuer')
  if(url.pathname!=='/oauth/authorize'||url.searchParams.get('state')!==this.stateValue||url.searchParams.get('redirect_uri')!==this.redirectUrl)throw new HiggsfieldError('invalid_endpoint')
  url.searchParams.set('response_mode','query');this.authorizationUrl=url.href
 }
 saveCodeVerifier(value:string){this.payload.codeVerifier=value}
 codeVerifier(){if(!this.payload.codeVerifier)throw new HiggsfieldError('state_invalid');return this.payload.codeVerifier}
 saveDiscoveryState(s:OAuthDiscoveryState){checkDiscovery(s);this.payload.discovery=s}
 discoveryState(){if(this.payload.discovery)checkDiscovery(this.payload.discovery);return this.payload.discovery}
}

export function createHiggsfieldOAuthDriver(delegate:typeof fetch=fetch) {
 return {
  async begin(state:string,redirectUri:string) {
   const p=new Provider(redirectUri,state,{})
   const outcome=await auth(p,{serverUrl:HIGGSFIELD_MCP_URL,scope:'openid email offline_access',resourceMetadataUrl:new URL('https://mcp.higgsfield.ai/.well-known/oauth-protected-resource/mcp'),fetchFn:createHiggsfieldFetch(delegate)})
   if(outcome!=='REDIRECT'||!p.authorizationUrl||!p.payload.codeVerifier||!p.payload.discovery)throw new HiggsfieldError('invalid_response')
   return {authorizationUrl:p.authorizationUrl,payload:p.payload}
  },
  async finish(payload:OAuthPayload,code:string,redirectUri:string,issuer?:string) {
   if(issuer!==HIGGSFIELD_ISSUER)throw new HiggsfieldError('invalid_endpoint')
   const p=new Provider(redirectUri,'',structuredClone(payload)),fetchFn=createHiggsfieldFetch(delegate)
   const outcome=await auth(p,{serverUrl:HIGGSFIELD_MCP_URL,authorizationCode:code,iss:issuer,scope:'openid email offline_access',fetchFn})
   if(outcome!=='AUTHORIZED'||!p.payload.tokens?.access_token||!p.payload.tokens.refresh_token||p.payload.tokens.token_type.toLowerCase()!=='bearer')throw new HiggsfieldError('invalid_response')
   delete p.payload.codeVerifier
   // Bind only authenticated userinfo; never trust a decoded, unverified ID token.
   let subject:string|null=null
   try {
    const discovery=await fetchFn(HIGGSFIELD_ISSUER+'/.well-known/openid-configuration')
    const oidc=await discovery.json()
    if(oidc.issuer!==HIGGSFIELD_ISSUER||typeof oidc.userinfo_endpoint!=='string')throw new HiggsfieldError('invalid_response')
    const endpoint=assertHiggsfieldUrl(oidc.userinfo_endpoint,'issuer')
    const response=await fetchFn(endpoint,{headers:{authorization:'Bearer '+p.payload.tokens.access_token}})
    const identity=await response.json()
    if(response.ok&&typeof identity.sub==='string'&&identity.sub.length>0&&identity.sub.length<=512)subject=identity.sub
   } catch { /* usable read-only connection, explicitly unverified identity */ }
   return {payload:p.payload,subject}
  },
  async refresh(payload:OAuthPayload,deadline=Date.now()+20000) {
   if(!payload.tokens?.refresh_token||!payload.clientInformation||!payload.discovery)throw new HiggsfieldError('reconnect_required')
   checkDiscovery(payload.discovery)
   const tokens=await refreshAuthorization(HIGGSFIELD_ISSUER,{metadata:payload.discovery.authorizationServerMetadata,clientInformation:payload.clientInformation,refreshToken:payload.tokens.refresh_token,resource:HIGGSFIELD_MCP_URL,fetchFn:createHiggsfieldFetch(delegate,Math.max(0,deadline-Date.now()))})
   if(!tokens.access_token||tokens.token_type.toLowerCase()!=='bearer')throw new HiggsfieldError('reconnect_required')
   return {...payload,tokens:{...tokens,refresh_token:tokens.refresh_token??payload.tokens.refresh_token},expiresAt:Date.now()+(tokens.expires_in??0)*1000}
  },
  async revoke(payload:OAuthPayload) {
   try {
    if(!payload.tokens?.refresh_token||!payload.clientInformation)return
    const body=new URLSearchParams({token:payload.tokens.refresh_token,token_type_hint:'refresh_token',client_id:payload.clientInformation.client_id})
    await createHiggsfieldFetch(delegate,5000)(HIGGSFIELD_ISSUER+'/oauth/token/revoke',{method:'POST',body})
   } catch { /* local revocation has already succeeded */ }
  }
 }
}
export type HiggsfieldOAuthDriver=ReturnType<typeof createHiggsfieldOAuthDriver>
export function stateHash(state:string){return createHash('sha256').update(state).digest('hex')}
export function createHiggsfieldOAuthService(store:HiggsfieldStore=createHiggsfieldStore(),driver:HiggsfieldOAuthDriver=createHiggsfieldOAuthDriver(),authorizeProject:(id:string)=>Promise<boolean>=async()=>false) {
 return {
  async begin(input:{projectId:string;actorId:string}) {
   const config=requireHiggsfieldConfig()
   if(!await authorizeProject(input.projectId))throw new HiggsfieldError('access_denied')
   const connection=await store.readConnection(input.projectId)
   const state=randomBytes(32).toString('base64url'),hash=stateHash(state)
   const begun=await driver.begin(state,config.redirectUri)
   await store.createOAuthAttempt({state_hash:hash,project_id:input.projectId,actor_id:input.actorId,connection_version:connection?.connection_version??0,encrypted_payload:sealProviderPayload({projectId:input.projectId,recordKind:'oauth',recordId:hash},begun.payload)})
   return {authorizationUrl:begun.authorizationUrl}
  },
  async finish(input:{state:string;actorId:string;code?:string;error?:string;issuer?:string}):Promise<{code:HiggsfieldFailure|'connected';projectId?:string}> {
   try {
    const config=requireHiggsfieldConfig()
    if(!/^[A-Za-z0-9_-]{43,128}$/.test(input.state))throw new HiggsfieldError('state_invalid')
    const hash=stateHash(input.state)
    const peek=await store.peekOAuthAttempt(hash,input.actorId)
    if(!peek||!await authorizeProject(peek.project_id))throw new HiggsfieldError('access_denied')
    const attempt=await store.consumeOAuthAttempt(hash,input.actorId)
    if(input.error)return {code:'access_denied',projectId:attempt.project_id}
    const connection=await store.readConnection(attempt.project_id)
    if(connection?.connection_version!==attempt.connection_version)throw new HiggsfieldError('connection_changed')
    if(!input.code||input.code.length>2048)throw new HiggsfieldError('state_invalid')
    const payload=openProviderPayload({projectId:attempt.project_id,recordKind:'oauth',recordId:hash},attempt.encrypted_payload) as OAuthPayload
    const result=await driver.finish(payload,input.code,config.redirectUri,input.issuer)
    await store.saveConnectionCAS({projectId:attempt.project_id,version:attempt.connection_version,payload:sealProviderPayload({projectId:attempt.project_id,recordKind:'connection',recordId:String(attempt.connection_version+1)},result.payload),subject:result.subject,identityVerified:result.subject!==null})
    return {code:'connected',projectId:attempt.project_id}
   } catch(error) {return {code:error instanceof HiggsfieldError?error.code:'provider_unavailable'}}
  }
 }
}
