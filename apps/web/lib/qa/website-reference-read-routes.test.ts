import {beforeEach,describe,expect,it,vi} from 'vitest'
import {randomUUID} from 'node:crypto'
import {WebsiteBuildError} from '@/lib/website-build/store'
const state=vi.hoisted(()=>({user:true,dbCalls:0,reads:0,listed:0,foreign:false}))
vi.mock('@/lib/auth/project-access',()=>({resolveProjectAccess:async()=>state.user?{
  ok:true,userId:'owner-fixture',allowedProjectIds:[],
}:{ok:false,response:Response.json({error:'Unauthorized'},{status:401})}}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>{
  state.dbCalls++;return {}
}}))
vi.mock('@/lib/website-build/assets/read',async original=>{
  const base=await original<typeof import('@/lib/website-build/assets/read')>()
  return {...base,
    listStoredReferences:async()=>{state.listed++;return [{ticketId:randomUUID(),assetId:randomUUID(),issuedAt:'2026-10-17T01:00:00Z'}]},
    readStoredReference:async()=>{state.reads++;if(state.foreign)throw new WebsiteBuildError('NOT_FOUND',404);return new Uint8Array([82,73,70,70])},
  }
})
import {GET as library} from '@/app/api/website-build/references/library/route'
import {GET as image} from '@/app/api/website-build/references/image/route'

const projectId=randomUUID(),conversationId=randomUUID(),ticketId=randomUUID()
function url(which:'library'|'image',extras:Record<string,string>={}){
  return new Request('http://localhost/api/website-build/references/'+which+'?'+
    new URLSearchParams({projectId,conversationId,...(which==='image'?{ticketId}:{}),...extras}))
}
beforeEach(()=>{
  vi.stubEnv('ATLAS_REFERENCE_UPLOAD_ENABLED','true')
  state.user=true;state.dbCalls=0;state.listed=0;state.reads=0;state.foreign=false
})
describe('private reference read HTTP contracts',()=>{
  it('refuses unauthenticated requests without any privileged DB use',async()=>{
    state.user=false
    expect((await library(url('library'))).status).toBe(401)
    expect((await image(url('image'))).status).toBe(401)
    expect(state.dbCalls).toBe(0)
  })
  it('blocks storage and listing entirely before the feature is explicitly enabled',async()=>{
    vi.stubEnv('ATLAS_REFERENCE_UPLOAD_ENABLED','false')
    const r=await library(url('library'))
    expect(await r.json()).toEqual({available:false,items:[]})
    expect((await image(url('image'))).status).toBe(503)
    expect(state.dbCalls).toBe(0)
  })
  it('rejects extra fields and duplicate query inputs before privileged storage reads',async()=>{
    expect((await library(url('library',{ownerId:randomUUID()}))).status).toBe(400)
    expect((await image(url('image',{ownerId:randomUUID()}))).status).toBe(400)
    const duplicate=new Request('http://localhost/api/website-build/references/image?'+
      new URLSearchParams({projectId,conversationId,ticketId})+'&ticketId='+ticketId)
    expect((await image(duplicate)).status).toBe(400)
    expect(state.dbCalls).toBe(0)
  })
  it('serves only a private no-store, nosniff WebP after authorized verification',async()=>{
    const r=await image(url('image'))
    expect(r.status).toBe(200)
    expect(r.headers.get('content-type')).toBe('image/webp')
    expect(r.headers.get('cache-control')).toBe('private, no-store')
    expect(r.headers.get('x-content-type-options')).toBe('nosniff')
    expect(new Uint8Array(await r.arrayBuffer())).toEqual(new Uint8Array([82,73,70,70]))
    expect(state.reads).toBe(1)
  })
  it('uses a generic no-leak error for a foreign asset and lists only opaque IDs',async()=>{
    state.foreign=true
    const hidden=await image(url('image'))
    expect(hidden.status).toBe(404)
    expect((await hidden.text())).not.toContain('owner-fixture')
    const listed=await library(url('library'))
    const result=await listed.json()
    expect(result.available).toBe(true)
    expect(result.items).toHaveLength(1)
    expect(JSON.stringify(result)).not.toContain('media-assets-private')
  })
})
