import { beforeEach, describe, expect, it, vi } from 'vitest'
import { randomUUID } from 'node:crypto'

const state=vi.hoisted(()=>({
  user: null as null | { ok:true; userId:string; allowedProjectIds:string[] },
  adminCalls:0, issued:0, lastInput:null as unknown,
}))
vi.mock('@/lib/auth/project-access',()=>({
  resolveProjectAccess:async()=>state.user??{
    ok:false,response:Response.json({error:'Unauthorized'},{status:401}),
  },
}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>{
  state.adminCalls++;return {}
}}))
vi.mock('@/lib/website-build/assets/tickets',async importOriginal=>{
  const real=await importOriginal<typeof import('@/lib/website-build/assets/tickets')>()
  return {...real,issueReferenceTicket:async(_db:unknown,_principal:unknown,input:unknown)=>{
    state.issued++;state.lastInput=input
    return {ticketId:randomUUID(),bucket:'atlas-reference-staging',path:'incoming/private',token:'private-test-token',mimeType:'image/png',expiresAt:new Date().toISOString()}
  }}
})
import { POST, GET } from '@/app/api/website-build/references/tickets/route'

const projectId=randomUUID(),conversationId=randomUUID(),draftId=randomUUID()
const body={projectId,conversationId,draftId,slot:0,mimeType:'image/png'}
function post(value:unknown,origin='http://localhost'){
  return new Request('http://localhost/api/website-build/references/tickets',{
    method:'POST',headers:{host:'localhost',origin,'content-type':'application/json'},
    body:JSON.stringify(value),
  })
}
beforeEach(()=>{vi.stubEnv('ATLAS_REFERENCE_UPLOAD_ENABLED','true');
  state.user={ok:true,userId:randomUUID(),allowedProjectIds:[projectId]}
  state.issued=0;state.adminCalls=0;state.lastInput=null
})
describe('website reference ticket HTTP boundary',()=>{
  it('is off by default and does not touch storage before activation',async()=>{
    vi.stubEnv('ATLAS_REFERENCE_UPLOAD_ENABLED','false')
    const status=await GET(new Request('http://localhost/api/website-build/references/tickets'))
    expect(status.status).toBe(200)
    expect(await status.json()).toEqual({available:false,reason:'not_activated'})
    const posted=await POST(post(body))
    expect(posted.status).toBe(503)
    expect(state.adminCalls).toBe(0)
    expect(state.issued).toBe(0)
  })
  it('denies before reading privileged data when the session is missing',async()=>{
    state.user=null
    const response=await POST(post(body))
    expect(response.status).toBe(401)
    expect(state.adminCalls).toBe(0)
    expect(state.issued).toBe(0)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
  })
  it('rejects cross-origin and forged extra owner/path fields before storage or ticket creation',async()=>{
    const forged=await POST(post({...body,ownerId:randomUUID()}))
    expect(forged.status).toBe(400)
    const external=await POST(post(body,'https://evil.example'))
    expect(external.status).toBe(403)
    const overlong=await POST(post({x:'x'.repeat(70_000)}))
    expect(overlong.status).toBe(413)
    expect(state.adminCalls).toBe(0)
    expect(state.issued).toBe(0)
  })
  it('returns only a scoped upload token with private no-store headers',async()=>{
    const result=await POST(post(body))
    expect(result.status).toBe(201)
    expect(result.headers.get('cache-control')).toBe('private, no-store')
    expect(state.issued).toBe(1)
    expect(state.lastInput).toEqual(body)
    const json=await result.json()
    expect(json).toMatchObject({bucket:'atlas-reference-staging',token:'private-test-token'})
    expect(json).not.toHaveProperty('service_role')
  })
})
