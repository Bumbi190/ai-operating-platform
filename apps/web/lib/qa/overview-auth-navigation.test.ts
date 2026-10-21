import {beforeEach,describe,it,expect,vi} from 'vitest'
import {NextRequest} from 'next/server'
import {middleware} from '@/middleware'
import RootPage from '@/app/page'
import {resolveWorkspace} from '@/lib/atlas/workspace-registry'
import {safeAuthDestination} from '@/lib/auth/safe-redirect'
import {pathToDestination,searchDestinations} from '@/lib/nav/registry'
import {vnextNavItemsFor} from '@/lib/nav/vnext-nav'
import {LEGACY_GLOBAL_NAV} from '@/lib/nav/legacy-nav'
import {buildBreadcrumbs,shouldRenderBreadcrumbs} from '@/lib/nav/breadcrumbs'
import {collaboratorNavHref} from '@/lib/auth/collaborator-navigation'
import {OMNIRA_UI_COOKIE} from '@/lib/ui/generation'
import {loadOverviewModel} from '@/lib/overview/view-model'
const scope=vi.hoisted(()=>({user:{id:'owner'} as {id:string}|null,membership:{role:'owner',revoked_at:null as string|null},adminCalls:0}))
vi.mock('@supabase/ssr',()=>({createServerClient:()=>({auth:{getUser:async()=>({data:{user:scope.user},error:null})},from:()=>{const q:any={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:scope.membership,error:null}),limit:async()=>({data:[{id:'owned'}],error:null})};return q}})}))
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({auth:{getUser:async()=>({data:{user:scope.user},error:null})}})}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>{scope.adminCalls++;throw Error('Unexpected admin read')}}))
vi.mock('next/navigation',()=>({redirect:(path:string)=>{throw Error('REDIRECT:'+path)}}))
beforeEach(()=>{scope.user={id:'owner'};scope.membership={role:'owner',revoked_at:null};scope.adminCalls=0})
describe('overview home and navigation',()=>{
 it('uses the dashboard for default and rejected returns while preserving reviewed links',()=>{
  expect(safeAuthDestination(null)).toBe('/dashboard');expect(safeAuthDestination('//evil.example')).toBe('/dashboard')
  for(const path of ['/dashboard','/atlas','/organization','/viewer/handlarborsen'])expect(safeAuthDestination(path)).toBe(path)
  expect(()=>RootPage()).toThrow('REDIRECT:/dashboard')
 })
 it('separates home commands from Atlas and shares one primary destination',()=>{
  expect(pathToDestination('/dashboard')).toBe('overview')
  for(const term of ['hem','home','start','översikt'])expect(searchDestinations(term)[0]?.id).toBe('overview')
  expect(searchDestinations('atlas')[0]?.id).toBe('atlas')
  for(const surface of ['desktop','mobile'] as const)expect(vnextNavItemsFor(surface).filter(i=>i.primary).map(i=>i.href)).toEqual(['/dashboard'])
  expect(LEGACY_GLOBAL_NAV.filter(i=>i.primary).map(i=>i.href)).toEqual(['/dashboard'])
  expect(buildBreadcrumbs('/projects/test-project')[0].href).toBe('/dashboard')
  expect(shouldRenderBreadcrumbs('/dashboard','vnext')).toBe(false)
  expect(collaboratorNavHref('/dashboard')).toBe('/organization')
 })
 it.each(['legacy','vnext'])('keeps fresh collaborator containment with a %s UI hint',async(ui)=>{
  scope.user={id:'collab'};scope.membership={role:'collaborator',revoked_at:null}
  const request=(path:string)=>new NextRequest('https://omnira.test'+path+'?ui='+ui,{headers:{cookie:OMNIRA_UI_COOKIE+'='+ui}})
  expect((await middleware(request('/dashboard'))).headers.get('location')).toBe('https://omnira.test/organization')
  expect((await middleware(request('/atlas'))).headers.get('location')).toBe('https://omnira.test/organization/atlas')
  scope.membership.revoked_at='2026-10-15T12:00:00Z'
  expect((await middleware(request('/dashboard'))).status).toBe(403)
 })
 it('allows the owner root and stops anonymous finance reads',async()=>{
  const response=await middleware(new NextRequest('https://omnira.test/'))
  expect(response.headers.get('location')).toBeNull()
  scope.user=null;expect(await loadOverviewModel(7)).toBeNull();expect(scope.adminCalls).toBe(0)
  expect((await middleware(new NextRequest('https://omnira.test/dashboard'))).headers.get('location')).toBe('https://omnira.test/login')
 })
})

it('preserves a reviewed destination in the no-code auth callback fallback',async()=>{
 const {GET}=await import('@/app/auth/callback/route')
 const res=await GET(new NextRequest('https://omnira.test/auth/callback?next=%2Forganization'))
 expect(res.headers.get('location')).toBe('https://omnira.test/auth/confirm?next=%2Forganization')
})

it('labels the runtime overview workspace',()=>{expect(resolveWorkspace('/dashboard').label).toBe('Översikt')})
