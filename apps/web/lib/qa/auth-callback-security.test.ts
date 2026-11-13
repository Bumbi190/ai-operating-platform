import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest'
import {NextRequest} from 'next/server'

const boundary=vi.hoisted(()=>({
 exchange:vi.fn(),create:vi.fn(),cookies:vi.fn(),set:vi.fn(),
 cookieValues:[{name:'sb-session',value:'SYNTHETIC-EXISTING-SESSION'}],
 options:null as null|{cookies:{getAll:()=>unknown;setAll:(cookies:Array<{name:string;value:string;options:Record<string,unknown>}>)=>void}},
}))
vi.mock('@supabase/ssr',()=>({createServerClient:(...args:unknown[])=>{
 boundary.create(...args);boundary.options=args[2] as typeof boundary.options
 return {auth:{exchangeCodeForSession:boundary.exchange}}
}}))
vi.mock('next/headers',()=>({cookies:boundary.cookies}))
import {GET} from '@/app/auth/callback/route'

let logged:unknown[][]
beforeEach(()=>{
 vi.clearAllMocks();boundary.options=null
 boundary.cookies.mockResolvedValue({getAll:()=>boundary.cookieValues,set:boundary.set})
 boundary.exchange.mockResolvedValue({data:{user:{id:'synthetic-user'},session:null},error:null})
 logged=[]
 for(const method of ['error','warn','log','info','debug'] as const)
  vi.spyOn(console,method).mockImplementation((...values:unknown[])=>{logged.push(values)})
})
afterEach(()=>vi.restoreAllMocks())
const request=(query:string)=>new NextRequest('https://omnira.test/auth/callback'+query)
const logs=()=>logged.flat().map(value=>typeof value==='string'?value:JSON.stringify(value)).join('\n')

describe('auth callback: logs exclude authentication inputs',()=>{
 it.each([
  ['access_denied','SYNTHETIC-AUTH-CODE'],
  ['SYNTHETIC-ERROR-VALUE','refresh_token=SYNTHETIC-REFRESH-TOKEN'],
  ['bad\r\n[INFO] forged owner','Bearer SYNTHETIC-ACCESS-TOKEN'],
  ['<script>forged-log</script>','Syntetiskt Åberg & Söner – login@example.invalid'],
 ])('keeps provider error redirects without logging external values %#',async(error,description)=>{
  const params=new URLSearchParams({error,error_description:description,code:'SYNTHETIC-CODE-QUERY',access_token:'SYNTHETIC-ACCESS-QUERY',refresh_token:'SYNTHETIC-REFRESH-QUERY'})
  const response=await GET(request('?'+params))
  const location=new URL(response.headers.get('location')!)
  expect(response.status).toBe(307)
  expect(location.origin).toBe('https://omnira.test')
  expect(location.pathname).toBe('/login')
  expect(location.searchParams.get('error')).toBe(description)
  expect(boundary.create).not.toHaveBeenCalled()
  expect(logged.length).toBeGreaterThan(0)
  for(const value of [error,description,'SYNTHETIC-CODE-QUERY','SYNTHETIC-ACCESS-QUERY','SYNTHETIC-REFRESH-QUERY'])
   expect(logs()).not.toContain(value)
 })
 it('keeps the provider error fallback when no description was supplied',async()=>{
  const response=await GET(request('?error=SYNTHETIC-PROVIDER-ERROR'))
  expect(new URL(response.headers.get('location')!).searchParams.get('error')).toBe('SYNTHETIC-PROVIDER-ERROR')
  expect(logs()).not.toContain('SYNTHETIC-PROVIDER-ERROR')
 })
 it('keeps failed PKCE confirmation without logging SDK error text or code',async()=>{
  boundary.exchange.mockResolvedValue({data:{user:null,session:null},error:{message:'code=SYNTHETIC-PKCE-CODE refresh_token=SYNTHETIC-REFRESH\r\n[INFO] forged',status:400}})
  const response=await GET(request('?code=SYNTHETIC-PKCE-CODE&next=%2Forganization'))
  expect(response.headers.get('location')).toBe('https://omnira.test/auth/confirm?code=SYNTHETIC-PKCE-CODE&next=%2Forganization')
  expect(boundary.exchange).toHaveBeenCalledWith('SYNTHETIC-PKCE-CODE')
  expect(logged.length).toBeGreaterThan(0)
  for(const value of ['SYNTHETIC-PKCE-CODE','SYNTHETIC-REFRESH','[INFO] forged'])expect(logs()).not.toContain(value)
 })
})
describe('auth callback: unchanged redirect and session contracts',()=>{
 it.each([
  ['%2Fdashboard','https://omnira.test/dashboard'],
  ['%2Fatlas','https://omnira.test/atlas'],
  ['%2Forganization','https://omnira.test/organization'],
  ['%2Fviewer%2Fhandlarborsen','https://omnira.test/viewer/handlarborsen'],
  ['https%3A%2F%2Fevil.invalid','https://omnira.test/dashboard'],
  ['%2F%2Fevil.invalid','https://omnira.test/dashboard'],
 ])('redirects a successful code exchange to the reviewed destination %#',async(next,expected)=>{
  const response=await GET(request('?code=SYNTHETIC-VALID-CODE&next='+next))
  expect(response.status).toBe(307)
  expect(response.headers.get('location')).toBe(expected)
  expect(boundary.exchange).toHaveBeenCalledWith('SYNTHETIC-VALID-CODE')
  expect(logged).toEqual([])
 })
 it('preserves current cookies and forwards the issued session cookie options',async()=>{
  boundary.exchange.mockImplementation(async()=>{
   expect(boundary.options!.cookies.getAll()).toEqual([{name:'sb-session',value:'SYNTHETIC-EXISTING-SESSION'}])
   boundary.options!.cookies.setAll([{name:'sb-session',value:'SYNTHETIC-NEW-SESSION',options:{httpOnly:true,path:'/',sameSite:'lax'}}])
   return {data:{user:{id:'synthetic-user'},session:null},error:null}
  })
  const response=await GET(request('?code=SYNTHETIC-VALID-CODE&next=%2Fdashboard'))
  expect(response.headers.get('location')).toBe('https://omnira.test/dashboard')
  expect(boundary.set).toHaveBeenCalledWith('sb-session','SYNTHETIC-NEW-SESSION',{httpOnly:true,path:'/',sameSite:'lax'})
  expect(logged).toEqual([])
 })
 it('preserves success when the cookie store rejects a cookie update',async()=>{
  boundary.set.mockImplementationOnce(()=>{throw Error('SYNTHETIC-COOKIE-DETAIL')})
  boundary.exchange.mockImplementation(async()=>{
   boundary.options!.cookies.setAll([{name:'sb-session',value:'SYNTHETIC-NEW-SESSION',options:{path:'/'}}])
   return {data:{user:{id:'synthetic-user'},session:null},error:null}
  })
  const response=await GET(request('?code=SYNTHETIC-VALID-CODE'))
  expect(response.headers.get('location')).toBe('https://omnira.test/dashboard')
  expect(logged).toEqual([])
 })
 it('keeps no-code fallback without attempting session exchange',async()=>{
  const response=await GET(request('?next=%2Forganization'))
  expect(response.headers.get('location')).toBe('https://omnira.test/auth/confirm?next=%2Forganization')
  expect(boundary.create).not.toHaveBeenCalled()
  expect(logged).toEqual([])
 })
 it('rejects an unreviewed no-code return URL',async()=>{
  const response=await GET(request('?next=https%3A%2F%2Fevil.invalid'))
  expect(response.headers.get('location')).toBe('https://omnira.test/auth/confirm?next=%2Fdashboard')
  expect(boundary.create).not.toHaveBeenCalled()
 })
})
