import {describe,expect,it,vi} from 'vitest'
import {parseDiscoveryQuery,parseDiscoveryPromotion,publicWebsite} from '../sales/discovery/validate'
import {buildOverpassQuery,discoverPublicBusinesses,parseOverpassResponse,MAX_PROVIDER_BYTES,OVERPASS_ENDPOINT,OVERPASS_USER_AGENT,discoveryEndpoint,discoverySourceConfigured,discoveryApiKey,discoveryProviderHeaders} from '../sales/discovery/provider'
import {discoveryBaselineReasons} from '../sales/discovery/exclusions'
import {HANDLARBORSEN_PROJECT_ID} from '../atlas/handlarborsen-test-data/contracts'
import {documentedPilotHistoryEntries} from '../handlarborsen/lead-finder/documented-pilot-history'
const query={city:'stockholm',category:'car_dealer',radiusKm:5,limit:20} as const
const projectId='10000000-0000-4000-8000-000000000001',candidateId='20000000-0000-4000-8000-000000000001'
const element=(id=1,tags:Record<string,string>={})=>({type:'node',id,lat:59.3293,lon:18.0686,tags:{name:'Synthetic Business AB',shop:'car',website:'https://business.example.com',email:'public@business.example.com',...tags}})
describe('bounded public business discovery',()=>{
 it('requires an explicitly configured production source and rejects unsafe or community backends',()=>{
  expect(discoveryEndpoint({NODE_ENV:'test'})).toBe(OVERPASS_ENDPOINT)
  expect(discoveryEndpoint({NODE_ENV:'production',ATLAS_SALES_DISCOVERY_OVERPASS_URL:'https://maps.example.com/api/interpreter'})).toBe('https://maps.example.com/api/interpreter')
  expect(discoverySourceConfigured({NODE_ENV:'production',ATLAS_SALES_DISCOVERY_OVERPASS_URL:'https://maps.example.com/api/interpreter'})).toBe(true)
  for(const env of [{NODE_ENV:'production'},{VERCEL:'1'},{NODE_ENV:'production',ATLAS_SALES_DISCOVERY_OVERPASS_URL:OVERPASS_ENDPOINT},{NODE_ENV:'production',ATLAS_SALES_DISCOVERY_OVERPASS_URL:'http://maps.example.com/api/interpreter'},{NODE_ENV:'production',ATLAS_SALES_DISCOVERY_OVERPASS_URL:'https://127.0.0.1/private'},{ATLAS_SALES_DISCOVERY_OVERPASS_URL:''}]){expect(()=>discoveryEndpoint(env)).toThrow('DISCOVERY_SOURCE_NOT_CONFIGURED');expect(discoverySourceConfigured(env)).toBe(false)}
 })
 it('supports overpass.ch with a separate API key and never requires the secret in the URL',()=>{
  const env={NODE_ENV:'production',ATLAS_SALES_DISCOVERY_OVERPASS_URL:'https://api.overpass.ch/v1/interpreter',ATLAS_SALES_DISCOVERY_OVERPASS_KEY:'synthetic-secret-key'}
  const endpoint=discoveryEndpoint(env)
  expect(endpoint).toBe('https://api.overpass.ch/v1/interpreter')
  expect(discoveryApiKey(env)).toBe('synthetic-secret-key')
  expect(discoveryProviderHeaders(endpoint,env)).toMatchObject({'x-api-key':'synthetic-secret-key','user-agent':OVERPASS_USER_AGENT})
  expect(endpoint).not.toContain('synthetic-secret-key')
  expect(discoverySourceConfigured(env)).toBe(true)
  expect(discoverySourceConfigured({...env,ATLAS_SALES_DISCOVERY_OVERPASS_KEY:''})).toBe(false)
  expect(discoverySourceConfigured({...env,ATLAS_SALES_DISCOVERY_OVERPASS_URL:'https://api.overpass.ch/v1/synthetic-secret-key/interpreter'})).toBe(false)
 })
 it.each([' short ','bad\nkey'])('rejects malformed provider key %j',key=>{
  expect(()=>discoveryApiKey({ATLAS_SALES_DISCOVERY_OVERPASS_KEY:key})).toThrow('DISCOVERY_SOURCE_NOT_CONFIGURED')
 })
 it('sends an overpass.ch key only in the provider header',async()=>{
  vi.stubEnv('NODE_ENV','production');vi.stubEnv('ATLAS_SALES_DISCOVERY_OVERPASS_URL','https://api.overpass.ch/v1/interpreter');vi.stubEnv('ATLAS_SALES_DISCOVERY_OVERPASS_KEY','synthetic-secret-key')
  const fetcher=vi.fn<typeof fetch>(async()=>Response.json({elements:[element()]}))
  try{
   expect((await discoverPublicBusinesses(query,fetcher)).candidates).toHaveLength(1)
   const [url,init]=fetcher.mock.calls[0]
   expect(url).toBe('https://api.overpass.ch/v1/interpreter')
   expect(init?.headers).toMatchObject({'x-api-key':'synthetic-secret-key','user-agent':OVERPASS_USER_AGENT})
   expect(String(init?.body)).not.toContain('synthetic-secret-key')
   expect(String(url)).not.toContain('synthetic-secret-key')
  }finally{vi.unstubAllEnvs()}
 })
 it('refuses missing deployment source before external fetch',async()=>{
  vi.stubEnv('VERCEL','1');vi.stubEnv('ATLAS_SALES_DISCOVERY_OVERPASS_URL','')
  const fetcher=vi.fn<typeof fetch>()
  try{await expect(discoverPublicBusinesses(query,fetcher)).rejects.toMatchObject({code:'DISCOVERY_SOURCE_NOT_CONFIGURED',status:503});expect(fetcher).not.toHaveBeenCalled()}finally{vi.unstubAllEnvs()}
 })

 it.each(['http://localhost.localdomain/','https://router.home.arpa/'])('rejects local aliases %s in public source links',url=>{
  expect(publicWebsite(url)).toBeNull()
  expect(parseOverpassResponse({elements:[element(7,{website:url})]},query)[0].websiteUrl).toBeNull()
 })

 it('accepts only configured city/category and finite numeric bounds',()=>{
  expect(parseDiscoveryQuery(query)).toEqual(query)
  for(const bad of [{...query,city:'world'},{...query,category:'[out:json]'},{...query,radiusKm:26},{...query,radiusKm:0},{...query,radiusKm:'5'},{...query,limit:26},{...query,limit:1.5},{...query,url:'https://attacker.example.com'}])expect(()=>parseDiscoveryQuery(bad)).toThrow('INVALID_BODY')
 })
 it('generates one bounded fixed-menu query',()=>{
  const q=buildOverpassQuery(query)
  expect(q).toContain('[timeout:10]');expect(q).toContain('[maxsize:16777216]');expect(q).toContain('["shop"="car"]');expect(q).toContain('(around:5000,59.3293,18.0686)');expect(q).toContain('out tags center 20;')
 })
 it('drops malformed rows, unsafe links and duplicate businesses without inventing contact data',()=>{
  const found=parseOverpassResponse({elements:[element(),element(2),element(3,{name:'Second AB',website:'http://127.0.0.1/private',email:'bad\r\n@example.com'}),{...element(4),id:'4'},element(5,{name:''})]},query)
  expect(found).toHaveLength(2)
  expect(found[0]).toMatchObject({sourceId:'node/1',sourceUrl:'https://www.openstreetmap.org/node/1',email:'public@business.example.com'})
  expect(found[1]).toMatchObject({sourceId:'node/3',websiteUrl:null,email:null})
  expect(found.every(c=>!('confirmed' in c)&&!('history' in c))).toBe(true)
 })
 it('refuses incomplete provider data or output above the requested cap',()=>{
  expect(()=>parseOverpassResponse({remark:'runtime error: timeout',elements:[]},query)).toThrow('DISCOVERY_PROVIDER_UNAVAILABLE')
  expect(()=>parseOverpassResponse({elements:Array.from({length:21},(_,i)=>element(i+1))},query)).toThrow('DISCOVERY_RESPONSE_TOO_LARGE')
 })
 it('uses fixed HTTPS POST with redirects disabled and no credentials',async()=>{
  const fetcher=vi.fn<typeof fetch>(async()=>Response.json({elements:[element()]}))
  expect((await discoverPublicBusinesses(query,fetcher)).candidates).toHaveLength(1)
  const [url,init]=fetcher.mock.calls[0]
  expect(url).toBe(OVERPASS_ENDPOINT);expect(init).toMatchObject({method:'POST',redirect:'error',credentials:'omit',cache:'no-store'});expect(init?.signal).toBeInstanceOf(AbortSignal)
  expect(init?.headers).toMatchObject({'user-agent':OVERPASS_USER_AGENT})
  expect(OVERPASS_USER_AGENT).toBe('Omnira-Harvey-B2B/1.0 (+https://github.com/Bumbi190/ai-operating-platform)')
  expect(String(init?.body)).not.toContain('http')
 })
 it('surfaces 429 and cancels oversized streamed data',async()=>{
  await expect(discoverPublicBusinesses(query,async()=>new Response('',{status:429}))).rejects.toMatchObject({code:'DISCOVERY_RATE_LIMITED',status:429})
  const cancel=vi.fn(),stream=new ReadableStream<Uint8Array>({start(c){c.enqueue(new Uint8Array(MAX_PROVIDER_BYTES+1))},cancel})
  await expect(discoverPublicBusinesses(query,async()=>new Response(stream))).rejects.toMatchObject({code:'DISCOVERY_RESPONSE_TOO_LARGE'})
  expect(cancel).toHaveBeenCalledOnce()
 })
 it('applies documented HB exclusions only to HB; a nonmatch is never a history assertion',()=>{
  const name=documentedPilotHistoryEntries()[0].companyName!
  expect(discoveryBaselineReasons(HANDLARBORSEN_PROJECT_ID,{name,websiteUrl:null})).toContain('already_contacted')
  expect(discoveryBaselineReasons(projectId,{name,websiteUrl:null})).toEqual([])
  expect(discoveryBaselineReasons(HANDLARBORSEN_PROJECT_ID,{name:'Synthetic Unmatched AB',websiteUrl:null})).toEqual([])
 })
 it('requires human verification and rejects automatic history/confirmation bypasses',()=>{
  const value={projectId,candidateId,expectedVersion:1,companyName:'Synthetic Business AB',branchName:'',email:'verified@business.example.com',websiteUrl:'https://business.example.com/',reviewNote:'Business and recipient independently verified.',businessConfirmed:true,emailConfirmed:true,offerKind:'general_service',pilotMonths:null}
  expect(parseDiscoveryPromotion(value)).toMatchObject({offerKind:'general_service',pilotMonths:null,emailConfirmed:true})
  for(const bad of [{...value,emailConfirmed:false},{...value,businessConfirmed:false},{...value,history:'not_contacted'},{...value,confirmed:true},{...value,offerKind:'pilot',pilotMonths:null},{...value,websiteUrl:'https://localhost/'}])expect(()=>parseDiscoveryPromotion(bad)).toThrow('INVALID_BODY')
 })
})
