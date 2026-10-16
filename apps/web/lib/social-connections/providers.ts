import 'server-only'
import type {Provider,OAuthConfig,Grant,Candidate,ConnectionSetup} from './types'
import {ConnectionError} from './types'
export const REQUIRED_SCOPES:Record<Provider,string[]>={linkedin:['r_organization_admin','w_organization_social'],pinterest:['user_accounts:read','boards:read','pins:read','pins:write'],x:['tweet.read','users.read','tweet.write','offline.access']}
const consoles:Record<Provider,string>={linkedin:'https://www.linkedin.com/developers/apps',pinterest:'https://developers.pinterest.com/apps/',x:'https://console.x.com/'}
const endpoints:Record<Provider,string>={linkedin:'https://www.linkedin.com/oauth/v2/authorization',pinterest:'https://www.pinterest.com/oauth/',x:'https://x.com/i/oauth2/authorize'}
const idPattern=/^[A-Za-z0-9_-]{1,64}$/
type Obj=Record<string,unknown>
const fail=(code:ConstructorParameters<typeof ConnectionError>[0]):never=>{throw new ConnectionError(code)}
function object(v:unknown):Obj{if(!v||typeof v!=='object'||Array.isArray(v))return fail('IDENTITY_UNVERIFIED');return v as Obj}
function label(v:unknown){if(typeof v!=='string'||!v.trim()||v.length>200||/[\u0000-\u001f\u007f]/.test(v))return fail('IDENTITY_UNVERIFIED');return v.trim()}
function accountId(v:unknown){if(typeof v!=='string'||!idPattern.test(v))return fail('IDENTITY_UNVERIFIED');return v}
function secret(v:unknown){if(typeof v!=='string'||!v||v.length>16384||/[\u0000-\u0020\u007f]/.test(v))return fail('IDENTITY_UNVERIFIED');return v}
const callback=(provider:Provider)=>'https://app.omniraos.se/api/social-connections/'+provider+'/callback'
export function providerConfig(provider:Provider):OAuthConfig|null{
 const prefix=provider.toUpperCase(),clientId=process.env[prefix+'_CLIENT_ID'],clientSecret=process.env[prefix+'_CLIENT_SECRET']
 if(!clientId||!clientSecret)return null
 try{return {clientId:secret(clientId),clientSecret:secret(clientSecret)}}catch{return null}
}
export function connectionSetup(provider:Provider):ConnectionSetup{
 const configured=!!providerConfig(provider)
 return {provider,configured,reason:provider==='x'?'cost_policy_required':configured?'ready':'app_configuration_missing',consoleUrl:consoles[provider],callbackUrl:callback(provider)}
}
export function authorizationUrl(provider:Provider,config:OAuthConfig,state:string,challenge:string):string{
 if(!/^[A-Za-z0-9_-]{43}$/.test(state)||!/^[A-Za-z0-9_-]{43}$/.test(challenge))return fail('INVALID_BODY')
 const url=new URL(endpoints[provider]);url.searchParams.set('client_id',config.clientId);url.searchParams.set('redirect_uri',callback(provider));url.searchParams.set('response_type','code');url.searchParams.set('state',state);url.searchParams.set('scope',REQUIRED_SCOPES[provider].join(provider==='pinterest'?',':' '))
 if(provider==='x'){url.searchParams.set('code_challenge',challenge);url.searchParams.set('code_challenge_method','S256')}
 return url.toString()
}
async function json(url:string,init:RequestInit,fetcher:typeof fetch):Promise<Obj>{
 try{
  const response=await fetcher(url,{...init,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(8000)})
  if(!response.ok)return fail(response.status===401||response.status===403?'PROVIDER_DENIED':'UNAVAILABLE')
  const reader=response.body?.getReader();if(!reader)return fail('UNAVAILABLE')
  const chunks:Uint8Array[]=[];let size=0
  try{for(;;){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>1048576){await reader.cancel();return fail('INVENTORY_LIMIT')}chunks.push(value)}}finally{reader.releaseLock()}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}
  return object(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes)))
 }catch(e){if(e instanceof ConnectionError)throw e;return fail('UNAVAILABLE')}
}
function scopes(value:unknown,provider:Provider){
 if(typeof value!=='string')return fail('SCOPE_MISSING')
 const list=value.split(/[ ,]+/).filter(Boolean)
 if(!REQUIRED_SCOPES[provider].every(s=>list.includes(s)))return fail('SCOPE_MISSING')
 return list
}
const linkedHeaders=(token:string)=>({Authorization:'Bearer '+secret(token),'LinkedIn-Version':'202604','X-Restli-Protocol-Version':'2.0.0'})
async function linkedScopes(config:OAuthConfig,token:string,fetcher:typeof fetch){
 const data=await json('https://www.linkedin.com/oauth/v2/introspectToken',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:config.clientId,client_secret:config.clientSecret,token})},fetcher)
 if(data.active!==true)return fail('PROVIDER_DENIED')
 return scopes(data.scope,'linkedin')
}
async function linkedCandidates(token:string,fetcher:typeof fetch):Promise<Candidate[]>{
 const headers=linkedHeaders(token),ids=new Set<string>();let finished=false
 for(let page=0;page<5;page++){
  const url=new URL('https://api.linkedin.com/rest/organizationAcls')
  for(const [key,value] of Object.entries({q:'roleAssignee',role:'ADMINISTRATOR',state:'APPROVED',count:'100',start:String(page*100)}))url.searchParams.set(key,value)
  const data=await json(url.toString(),{headers},fetcher)
  if(!Array.isArray(data.elements))return fail('IDENTITY_UNVERIFIED')
  for(const raw of data.elements){
   const entry=object(raw),urn=typeof entry.organization==='string'?entry.organization:''
   if(entry.state==='APPROVED'&&entry.role==='ADMINISTRATOR'&&/^urn:li:organization:[0-9]{1,64}$/.test(urn))ids.add(urn.slice('urn:li:organization:'.length))
  }
  if(ids.size>100)return fail('INVENTORY_LIMIT')
  const total=data.paging&&typeof data.paging==='object'?(data.paging as Obj).total:null
  if(data.elements.length<100||typeof total==='number'&&(page+1)*100>=total){finished=true;break}
 }
 if(!finished)return fail('INVENTORY_LIMIT')
 if(!ids.size)return fail('IDENTITY_UNVERIFIED')
 const data=await json('https://api.linkedin.com/rest/organizations?ids=List('+[...ids].join(',')+')',{headers},fetcher),results=object(data.results)
 return [...ids].map(id=>{const org=object(results[id]);if(String(org.id)!==id)return fail('IDENTITY_UNVERIFIED');return {key:id,accountId:id,accountLabel:label(org.localizedName),destinationId:null,destinationLabel:null}})
}
async function pinterestCandidates(token:string,fetcher:typeof fetch):Promise<Candidate[]>{
 const headers={Authorization:'Bearer '+secret(token)},account=await json('https://api.pinterest.com/v5/user_account',{headers},fetcher)
 const id=accountId(account.id),username=label(account.username)
 if(account.account_type!=='BUSINESS')return fail('IDENTITY_UNVERIFIED')
 const name=label(account.business_name||username),candidates=new Map<string,Candidate>(),seen=new Set<string>();let bookmark:string|null=null,finished=false
 for(let page=0;page<5;page++){
  const url=new URL('https://api.pinterest.com/v5/boards');url.searchParams.set('page_size','100');if(bookmark)url.searchParams.set('bookmark',bookmark)
  const data=await json(url.toString(),{headers},fetcher)
  if(!Array.isArray(data.items))return fail('IDENTITY_UNVERIFIED')
  for(const raw of data.items){
   const board=object(raw),owner=board.owner&&typeof board.owner==='object'?(board.owner as Obj).username:null
   if(typeof owner!=='string'||owner.toLowerCase()!==username.toLowerCase()||board.privacy!=='PUBLIC')continue
   const boardId=accountId(board.id);candidates.set(boardId,{key:boardId,accountId:id,accountLabel:name,destinationId:boardId,destinationLabel:label(board.name)})
  }
  if(candidates.size>100)return fail('INVENTORY_LIMIT')
  if(data.bookmark==null||data.bookmark===''){finished=true;break}
  if(typeof data.bookmark!=='string'||data.bookmark.length>2048||seen.has(data.bookmark))return fail('INVENTORY_LIMIT')
  bookmark=data.bookmark;seen.add(bookmark)
 }
 if(!finished)return fail('INVENTORY_LIMIT')
 if(!candidates.size)return fail('IDENTITY_UNVERIFIED')
 return [...candidates.values()]
}
function expiry(value:unknown){if(typeof value!=='number'||!Number.isSafeInteger(value)||value<=0||value>366*86400)return fail('IDENTITY_UNVERIFIED');return new Date(Date.now()+value*1000).toISOString()}
export async function exchangeAndDiscover(provider:Provider,config:OAuthConfig,input:{code:string;verifier:string},fetcher:typeof fetch=fetch):Promise<Grant>{
 if(provider==='x')return fail('COST_POLICY_REQUIRED')
 if(!input.code||input.code.length>4096||/[\u0000-\u001f\u007f]/.test(input.code))return fail('INVALID_BODY')
 const form=new URLSearchParams({grant_type:'authorization_code',code:input.code,redirect_uri:callback(provider)}),headers:Record<string,string>={'content-type':'application/x-www-form-urlencoded'}
 let endpoint:string
 if(provider==='linkedin'){endpoint='https://www.linkedin.com/oauth/v2/accessToken';form.set('client_id',config.clientId);form.set('client_secret',config.clientSecret)}
 else{endpoint='https://api.pinterest.com/v5/oauth/token';headers.Authorization='Basic '+Buffer.from(config.clientId+':'+config.clientSecret).toString('base64');form.set('continuous_refresh','true')}
 const data=await json(endpoint,{method:'POST',headers,body:form},fetcher),accessToken=secret(data.access_token),expiresAt=expiry(data.expires_in)
 const grantedScopes=provider==='linkedin'?await linkedScopes(config,accessToken,fetcher):scopes(data.scope,provider)
 const candidates=provider==='linkedin'?await linkedCandidates(accessToken,fetcher):await pinterestCandidates(accessToken,fetcher)
 return {accessToken,refreshToken:data.refresh_token==null?null:secret(data.refresh_token),scopes:grantedScopes,expiresAt,refreshExpiresAt:data.refresh_token_expires_in==null?null:expiry(data.refresh_token_expires_in),candidates}
}
export async function attestDestination(provider:Provider,config:OAuthConfig,token:string,candidate:Candidate,fetcher:typeof fetch=fetch):Promise<void>{
 if(provider==='x')return fail('COST_POLICY_REQUIRED')
 if(provider==='linkedin')await linkedScopes(config,token,fetcher)
 const candidates=provider==='linkedin'?await linkedCandidates(token,fetcher):await pinterestCandidates(token,fetcher)
 if(!candidates.some(c=>c.accountId===candidate.accountId&&c.key===candidate.key&&c.destinationId===candidate.destinationId))return fail('IDENTITY_UNVERIFIED')
}
export function parseXAccount(value:unknown):Candidate{
 const data=object(object(value).data),id=accountId(data.id)
 return {key:id,accountId:id,accountLabel:label(data.name||data.username),destinationId:null,destinationLabel:null}
}
