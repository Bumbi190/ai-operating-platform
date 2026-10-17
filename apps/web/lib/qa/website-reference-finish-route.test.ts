import {beforeEach,describe,expect,it,vi} from 'vitest'
import {randomUUID} from 'node:crypto'
const state=vi.hoisted(()=>({authenticated:true,dbCalls:0,finalized:0}))
vi.mock('@/lib/auth/project-access',()=>({
  resolveProjectAccess:async()=>state.authenticated?{ok:true,userId:'owner',allowedProjectIds:[]}:
    {ok:false,response:Response.json({error:'Unauthorized'},{status:401})},
}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>{state.dbCalls++;return{}}}))
vi.mock('@/lib/website-build/assets/finalize',async importOriginal=>{
  const original=await importOriginal<typeof import('@/lib/website-build/assets/finalize')>()
  return {...original,finalizeReferenceTicket:async()=>{state.finalized++;return{status:'ready',ticketId:'ticket',assetId:'asset'}}}
})
import {POST} from '@/app/api/website-build/references/finish/route'
const sample={projectId:randomUUID(),conversationId:randomUUID(),ticketId:randomUUID()}
function request(value:unknown,origin='http://localhost'){
  return new Request('http://localhost/api/website-build/references/finish',{method:'POST',headers:{host:'localhost',origin,'content-type':'application/json'},body:JSON.stringify(value)})
}
beforeEach(()=>{state.authenticated=true;state.dbCalls=0;state.finalized=0})
describe('private reference completion route',()=>{
  it('denies unauthenticated requests before any privileged work',async()=>{
    state.authenticated=false
    const response=await POST(request(sample))
    expect(response.status).toBe(401)
    expect(state.dbCalls).toBe(0)
    expect(state.finalized).toBe(0)
  })
  it('rejects CSRF, unknown fields and oversized JSON before service access',async()=>{
    expect((await POST(request(sample,'https://evil.example'))).status).toBe(403)
    expect((await POST(request({...sample,ownerId:'forged'}))).status).toBe(400)
    expect((await POST(request({data:'x'.repeat(70_000)}))).status).toBe(413)
    expect(state.dbCalls).toBe(0)
  })
  it('returns a private canonical Asset receipt without publishing or leaking storage',async()=>{
    const response=await POST(request(sample))
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('private, no-store')
    expect(await response.json()).toEqual({status:'ready',ticketId:'ticket',assetId:'asset'})
    expect(state.finalized).toBe(1)
  })
})
