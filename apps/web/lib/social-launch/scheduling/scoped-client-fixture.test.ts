import {afterEach,beforeEach,expect,it,vi} from 'vitest'
import {createScopedScheduleFixtureClient} from './scoped-client-fixture'

const now=1792672800 // synthetic clock; never a live credential
const subject='00000000-0000-4000-8000-000000000010'
const payload={
  role:'social_schedule_rpc_only_fixture',iss:'omnira-schedule-fixture',
  aud:'authenticated',sub:subject,iat:now,exp:now+300,
}
const jwt=(overrides:Record<string,unknown>={},headerChanges:Record<string,unknown>={})=>[
  Buffer.from(JSON.stringify({alg:'RS256',typ:'JWT',kid:'calendar-rpc-ephemeral-v1',...headerChanges})).toString('base64url'),
  Buffer.from(JSON.stringify({...payload,...overrides})).toString('base64url'),
  'signature-only-in-unit-fixture',
].join('.')
const config=(custom:Record<string,unknown>={})=>({
  url:'https://schedule-fixture.invalid',
  publishableKey:'sb_publishable_fixture_only',
  expectedSubject:subject,
  getAccessToken:async()=>jwt(),
  now:()=>now*1000,
  transport:vi.fn(async()=>new Response('{"ok":true}',{
    headers:{'content-type':'application/json'},status:200,
  })),
  ...custom,
})
beforeEach(()=>vi.stubEnv('NODE_ENV','test'))
afterEach(()=>vi.unstubAllEnvs())

it('keeps the publishable apikey separate from the subject-bound JWT and uses no-store',async()=>{
  const options=config()
  const db=createScopedScheduleFixtureClient(options)
  const response=await db.rpc('social_schedule_peek',{p_input:{projectIds:[]}})
  expect(response.error).toBeNull()
  expect(options.transport).toHaveBeenCalledTimes(1)
  const [url,init]=options.transport.mock.calls[0] as unknown as [RequestInfo|URL,RequestInit]
  expect(new URL(String(url)).pathname).toBe('/rest/v1/rpc/social_schedule_peek')
  const headers=new Headers(init.headers)
  expect(headers.get('authorization')).toBe('Bearer '+jwt())
  expect(headers.get('apikey')).toBe('sb_publishable_fixture_only')
  expect(headers.get('authorization')).not.toContain('service_role')
  expect(init.cache).toBe('no-store')
})

it('fails closed before network on wrong identity, expired claims or malformed JWT',async()=>{
  const consoleErrors=vi.spyOn(console,'error').mockImplementation(()=>{})
  for(const token of [
    jwt({role:'service_role'}),jwt({role:'authenticated'}),jwt({sub:'00000000-0000-4000-8000-000000000011'}),
    jwt({sub:null}),jwt({iss:'unknown'}),jwt({aud:'service_role'}),
    jwt({}, {alg:'HS256'}),jwt({}, {kid:'unknown-key'}),jwt({}, {kid:null}),
    jwt({exp:now-1}),
    jwt({exp:now+3600}),jwt({iat:now+100}),jwt({nbf:now+100}),
    'not-a-jwt','a.b.c',jwt().replace(/\.[^.]*$/,'.'),
  ]){
    const options=config({getAccessToken:async()=>token})
    const result=await createScopedScheduleFixtureClient(options)
      .rpc('social_schedule_peek',{p_input:{projectIds:[]}})
    expect(result.error,token.slice(0,15)).not.toBeNull()
    expect(options.transport).not.toHaveBeenCalled()
  }
  consoleErrors.mockRestore()
})

it('refuses elevated keys, insecure origins, callback mistakes, or a production invocation',()=>{
  for(const input of [
    {publishableKey:'sb_secret_not_for_scheduler'},
    {publishableKey:'legacy-service-role-jwt'},
    {url:'http://schedule-fixture.invalid'},
    {url:'https://not-the-owned-test-origin.invalid'},
    {url:'https://schedule-fixture.invalid/path'},
    {url:'https://evil.invalid@real.invalid'},
    {expectedSubject:'not-a-uuid'},
    {getAccessToken:null},
  ])expect(()=>createScopedScheduleFixtureClient(config(input))).toThrow('SOCIAL_SCHEDULE_FIXTURE_IDENTITY_DENIED')
  vi.stubEnv('NODE_ENV','production')
  expect(()=>createScopedScheduleFixtureClient(config())).toThrow('SOCIAL_SCHEDULE_FIXTURE_IDENTITY_DENIED')
})

it('fetches a fresh short-lived token for each rpc rather than storing session state',async()=>{
  let issued=0
  const options=config({getAccessToken:async()=>{issued++;return jwt()}})
  const db=createScopedScheduleFixtureClient(options)
  expect((await db.rpc('social_schedule_peek',{p_input:{projectIds:[]}})).error).toBeNull()
  expect((await db.rpc('social_schedule_receipt',{p_input:{jobId:subject}})).error).toBeNull()
  // supabase-js may also request a token when its unused Realtime client initializes.
  expect(issued).toBeGreaterThanOrEqual(2)
  expect(options.transport).toHaveBeenCalledTimes(2)
})

it('exposes only the six scheduler RPCs, never a database or Storage client',async()=>{
  const options=config()
  const db=createScopedScheduleFixtureClient(options)
  expect(Object.keys(db)).toEqual(['rpc'])
  expect('from' in db).toBe(false)
  expect('storage' in db).toBe(false)
  expect('auth' in db).toBe(false)
  for(const rpc of ['social_publication_step','social_schedule_claim_unchecked_fixture','social_publication_reconciliation_complete']){
    await expect(db.rpc(rpc,{p_input:{}})).rejects.toThrow('SOCIAL_SCHEDULE_FIXTURE_RPC_DENIED')
  }
  expect(options.transport).not.toHaveBeenCalled()
})
