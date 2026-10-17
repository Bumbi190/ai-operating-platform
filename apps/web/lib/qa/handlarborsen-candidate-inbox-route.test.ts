import { beforeEach,describe,expect,it,vi } from 'vitest'
const mocked = vi.hoisted(()=>({
  enabled:vi.fn(()=>true),
  mark:vi.fn(async ():Promise<any>=>({status:'updated',read:true})),
}))
vi.mock('@/lib/atlas/project-analytics/handlarborsen-candidate-inbox-service',()=>({
  competitorInboxEnabled:mocked.enabled,
  markCompetitorInboxRead:mocked.mark,
}))
import { POST as ownerPost,maxDuration as maxOwnerDuration } from '@/app/api/projects/[slug]/competitors/inbox/route'
import { POST as collabPost,maxDuration as maxCollabDuration } from '@/app/api/organization/projects/[slug]/competitors/inbox/route'

const headers={origin:'https://omniraos.se',host:'omniraos.se','content-type':'application/json'}
const body={host:'tradingsolutions.se',read:true}
const ownerURL='https://omniraos.se/api/projects/handlarborsen/competitors/inbox'
const collabURL='https://omniraos.se/api/organization/projects/handlarborsen/competitors/inbox'
const call=(action:typeof ownerPost,origin:string,payload:unknown=body,requestHeaders:Record<string,string>=headers,slug='handlarborsen')=>
  action(new Request(origin,{method:'POST',headers:requestHeaders,body:JSON.stringify(payload)}),{params:{slug}})

beforeEach(()=>{
  mocked.enabled.mockReset().mockReturnValue(true)
  mocked.mark.mockReset().mockResolvedValue({status:'updated',read:true})
})
describe('scoped per-recipient in-app inbox acknowledgement routes',()=>{
  it('does not accept any POST while the future feature flag is off',async()=>{
    mocked.enabled.mockReturnValue(false)
    expect((await call(ownerPost,ownerURL)).status).toBe(409)
    expect((await call(collabPost,collabURL)).status).toBe(409)
    expect(mocked.mark).not.toHaveBeenCalled()
    expect(maxOwnerDuration).toBeLessThanOrEqual(15)
    expect(maxCollabDuration).toBeLessThanOrEqual(15)
  })
  it('rejects forged projects, origins, unsupported requests and free URL parameters',async()=>{
    for(const [post,url] of [[ownerPost,ownerURL],[collabPost,collabURL]] as const){
      expect((await call(post,url,body,headers,'familje-stunden')).status).toBe(404)
      expect((await call(post,url,body,{...headers,origin:'https://attacker.example'})).status).toBe(403)
      expect((await call(post,url,body,{...headers,'content-type':'text/plain'})).status).toBe(400)
      expect((await call(post,url+'?recipient=someone')).status).toBe(400)
      expect((await call(post,url,body,{...headers,'content-length':'9000'})).status).toBe(400)
    }
    expect(mocked.mark).not.toHaveBeenCalled()
  })
  it('passes only server-chosen audience and parsed request data',async()=>{
    expect((await call(ownerPost,ownerURL)).status).toBe(200)
    expect((await call(collabPost,collabURL)).status).toBe(200)
    expect(mocked.mark).toHaveBeenNthCalledWith(1,'owner',body)
    expect(mocked.mark).toHaveBeenNthCalledWith(2,'collaborator',body)
  })
  it('does not translate read denials into successful receipts',async()=>{
    for(const [status,expected] of [
      ['unauthorized',401],['forbidden',403],['invalid',422],
      ['not_found',404],['disabled',409],['unavailable',503],
      ['unchanged',200],
    ] as const){
      mocked.mark.mockResolvedValueOnce({status})
      const response=await call(collabPost,collabURL)
      expect(response.status).toBe(expected)
    }
  })
})
