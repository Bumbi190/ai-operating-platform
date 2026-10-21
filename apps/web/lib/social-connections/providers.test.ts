import {it,expect,vi} from 'vitest'
import {authorizationUrl,exchangeAndDiscover,attestDestination,parseXAccount,REQUIRED_SCOPES,connectionSetup} from './providers'
const config={clientId:'fixture-app',clientSecret:'fixture-secret'}
const account={id:'123',username:'familjen',account_type:'BUSINESS',business_name:'Familje-Stunden'}
const board={id:'456',name:'Aktiviteter',privacy:'PUBLIC',owner:{username:'familjen'}}
function fixture(provider:'linkedin'|'pinterest',overrides:Record<string,unknown>={}){
 const seen:{url:URL;init:RequestInit|undefined}[]=[]
 const responses:Record<string,unknown>=provider==='linkedin'?{
 '/oauth/v2/accessToken':{access_token:'access-secret',expires_in:3600},
 '/oauth/v2/introspectToken':{active:true,scope:REQUIRED_SCOPES.linkedin.join(',')},
 '/rest/organizationAcls':{elements:[{organization:'urn:li:organization:123',role:'ADMINISTRATOR',state:'APPROVED'}],paging:{start:0,count:100,total:1}},
 '/rest/organizations':{results:{'123':{id:123,localizedName:'Handlarbörsen'}}},
 }:{
 '/v5/oauth/token':{access_token:'access-secret',refresh_token:'refresh-secret',expires_in:3600,refresh_token_expires_in:7200,scope:REQUIRED_SCOPES.pinterest.join(' ')},
 '/v5/user_account':account,
 '/v5/boards':{items:[board],bookmark:null},
 }
 const f=vi.fn(async(input:RequestInfo|URL,init?:RequestInit)=>{const url=new URL(String(input));seen.push({url,init});const data=url.pathname in overrides?overrides[url.pathname]:responses[url.pathname];if(data instanceof Response)return data;return Response.json(data??{})}) as unknown as typeof fetch
 return {f,seen}
}
it('pins callback/origins/scopes and PKCE for X without leaking client secret',()=>{
 for(const provider of ['linkedin','pinterest','x'] as const){
  const url=new URL(authorizationUrl(provider,config,'a'.repeat(43),'b'.repeat(43)))
  expect(url.protocol).toBe('https:');expect(url.searchParams.get('redirect_uri')).toBe('https://app.omniraos.se/api/social-connections/'+provider+'/callback')
  expect(url.searchParams.get('state')).toBe('a'.repeat(43));expect(url.toString()).not.toContain('fixture-secret')
  if(provider==='x'){expect(url.searchParams.get('code_challenge_method')).toBe('S256');expect(url.searchParams.get('code_challenge')).toBe('b'.repeat(43))}
 }
})
it('verifies LinkedIn grant scopes and an approved company administrator before returning choices',async()=>{
 const {f,seen}=fixture('linkedin'),r=await exchangeAndDiscover('linkedin',config,{code:'code',verifier:'v'.repeat(43)},f)
 expect(r.candidates).toEqual([{key:'123',accountId:'123',accountLabel:'Handlarbörsen',destinationId:null,destinationLabel:null}]);expect(r.accessToken).toBe('access-secret')
 expect(seen.find(r=>r.url.pathname==='/rest/organizationAcls')?.init?.headers).toMatchObject({'LinkedIn-Version':'202604','X-Restli-Protocol-Version':'2.0.0'})
 expect(seen.every(r=>r.url.origin==='https://api.linkedin.com'||r.url.origin==='https://www.linkedin.com')).toBe(true)
})
it('requires Pinterest stable business identity and an owned public board',async()=>{
 const {f}=fixture('pinterest'),r=await exchangeAndDiscover('pinterest',config,{code:'code',verifier:'v'.repeat(43)},f)
 expect(r.candidates).toEqual([{key:'456',accountId:'123',accountLabel:'Familje-Stunden',destinationId:'456',destinationLabel:'Aktiviteter'}]);expect(r.refreshToken).toBe('refresh-secret')
})
it.each([
 {provider:'linkedin' as const,overrides:{'/oauth/v2/introspectToken':{active:true,scope:'r_organization_admin'}}},
 {provider:'linkedin' as const,overrides:{'/rest/organizationAcls':{elements:[{organization:'urn:li:organization:123',role:'ANALYST',state:'APPROVED'}]}}},
 {provider:'pinterest' as const,overrides:{'/v5/user_account':{...account,id:undefined}}},
 {provider:'pinterest' as const,overrides:{'/v5/user_account':{...account,account_type:'PERSONAL'}}},
 {provider:'pinterest' as const,overrides:{'/v5/boards':{items:[{...board,owner:{username:'other'}}]}}},
 {provider:'pinterest' as const,overrides:{'/v5/oauth/token':{access_token:'secret',expires_in:0,scope:REQUIRED_SCOPES.pinterest.join(' ')}}},
])('refuses unverified identity or capabilities $provider $overrides',async({provider,overrides})=>{
 const {f}=fixture(provider,overrides);await expect(exchangeAndDiscover(provider,config,{code:'code',verifier:'v'.repeat(43)},f)).rejects.toMatchObject({code:'/oauth/v2/introspectToken' in overrides?'SCOPE_MISSING':'IDENTITY_UNVERIFIED'})
})
it.each([401,403,429,500])('returns a closed error for provider status %i',async status=>{
 const {f}=fixture('pinterest',{'/v5/user_account':new Response('provider-private-secret',{status})})
 await expect(exchangeAndDiscover('pinterest',config,{code:'code',verifier:'v'.repeat(43)},f)).rejects.toMatchObject({code:status===401||status===403?'PROVIDER_DENIED':'UNAVAILABLE'});expect(f).toHaveBeenCalled()
})
it('bounds pagination rather than choosing the first available result',async()=>{
 const {f}=fixture('pinterest',{'/v5/boards':{items:[board],bookmark:'again'}})
 await expect(exchangeAndDiscover('pinterest',config,{code:'code',verifier:'v'.repeat(43)},f)).rejects.toMatchObject({code:'INVENTORY_LIMIT'})
})
it('denies every runtime X request before fetch regardless of configured credentials',async()=>{
 const f=vi.fn();expect(connectionSetup('x').reason).toBe('cost_policy_required')
 await expect(exchangeAndDiscover('x',config,{code:'code',verifier:'v'.repeat(43)},f)).rejects.toMatchObject({code:'COST_POLICY_REQUIRED'})
 await expect(attestDestination('x',config,'secret',{key:'1',accountId:'1',accountLabel:'X',destinationId:null,destinationLabel:null},f)).rejects.toMatchObject({code:'COST_POLICY_REQUIRED'})
 expect(f).not.toHaveBeenCalled();expect(parseXAccount({data:{id:'1',name:'André',username:'andre'}}).accountId).toBe('1')
})
it('refuses a changed bound destination when re-attesting',async()=>{
 const {f}=fixture('pinterest');await expect(attestDestination('pinterest',config,'access-secret',{key:'999',accountId:'123',accountLabel:'Familjen',destinationId:'999',destinationLabel:'Other'},f)).rejects.toMatchObject({code:'IDENTITY_UNVERIFIED'})
})
