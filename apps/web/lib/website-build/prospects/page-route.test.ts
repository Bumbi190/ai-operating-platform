import {beforeEach,describe,expect,it,vi} from 'vitest'

const controls=vi.hoisted(()=>({
  enabled:vi.fn(),
  load:vi.fn(),
  notFound:vi.fn(()=>{throw Error('NEXT_NOT_FOUND')}),
  redirect:vi.fn((path:string)=>{throw Error('NEXT_REDIRECT:'+path)}),
}))
vi.mock('next/navigation',()=>({notFound:controls.notFound,redirect:controls.redirect}))
vi.mock('@/lib/website-build/prospects/api',()=>({prospectsEnabled:controls.enabled}))
vi.mock('@/lib/website-build/studio/loader',()=>({loadStudioView:controls.load}))
vi.mock('@/components/website-build/ProspectBoard',()=>({ProspectBoard:vi.fn(()=>null)}))

import ProspectsPage from '@/app/(platform)/build/prospects/page'
import {ProspectBoard} from '@/components/website-build/ProspectBoard'

const first='11111111-1111-4111-8111-111111111111'
const second='22222222-2222-4222-8222-222222222222'
const outsider='33333333-3333-4333-8333-333333333333'
const owned=[{id:first,name:'Eget testprojekt'},{id:second,name:'Eget annat projekt'}]
const visit=(query:Record<string,string|string[]|undefined>={})=>
  ProspectsPage({searchParams:Promise.resolve(query)})

beforeEach(()=>{
  vi.clearAllMocks()
  controls.enabled.mockReturnValue(true)
  controls.load.mockResolvedValue({projects:owned})
})

describe('WebBuilder prospect page – owner-only, fail-closed entry',()=>{
  it('does not read projects or mount the board when the feature flag is disabled',async()=>{
    controls.enabled.mockReturnValue(false)
    await expect(visit()).rejects.toThrow('NEXT_NOT_FOUND')
    expect(controls.load).not.toHaveBeenCalled()
    expect(ProspectBoard).not.toHaveBeenCalled()
  })
  it('redirects a guest to the existing local login without mounting prospect data',async()=>{
    controls.load.mockResolvedValue(null)
    await expect(visit()).rejects.toThrow('NEXT_REDIRECT:/login')
    expect(ProspectBoard).not.toHaveBeenCalled()
  })
  it('uses only already-authorized active Studio projects for the default selection',async()=>{
    const page=await visit()
    expect(controls.load).toHaveBeenCalledTimes(1)
    expect(controls.load).toHaveBeenCalledWith({},'active')
    expect(page).toMatchObject({type:ProspectBoard,props:{projects:owned,initialProjectId:first}})
  })
  it('supports the projectId forwarded by the existing /build navigation',async()=>{
    const page=await visit({projectId:second})
    expect(page).toMatchObject({type:ProspectBoard,props:{projects:owned,initialProjectId:second}})
  })
  it('hides an unowned projectId rather than selecting or leaking it',async()=>{
    await expect(visit({projectId:outsider})).rejects.toThrow('NEXT_NOT_FOUND')
    expect(ProspectBoard).not.toHaveBeenCalled()
  })
  it('refuses malformed, duplicated and unrelated query selectors',async()=>{
    for(const query of [{projectId:'bad-id'},{projectId:[first,second]},{projectId:first,unexpected:'yes'}]){
      await expect(visit(query)).rejects.toThrow('NEXT_NOT_FOUND')
    }
    expect(controls.load).not.toHaveBeenCalled()
  })
  it('shows no prospect board when the owner has no active projects',async()=>{
    controls.load.mockResolvedValue({projects:[]})
    const page=await visit()
    expect(page).toMatchObject({type:'main'})
    expect(ProspectBoard).not.toHaveBeenCalled()
  })
  it('does not expose exception details or prospect data if the existing loader fails',async()=>{
    controls.load.mockRejectedValue(Error('private database failure'))
    const page=await visit()
    expect(page).toMatchObject({type:'main'})
    expect(JSON.stringify(page)).not.toContain('private database failure')
  })
})
