import {it,expect,vi,beforeEach} from 'vitest'
const f=vi.hoisted(()=>({user:true,allowed:true,reads:0,receipt:null as any}))
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({auth:{getUser:async()=>({data:{user:f.user?{id:'11111111-1111-4111-8111-111111111111'}:null},error:null})}})}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({})}))
vi.mock('@/lib/atlas/isolation',()=>({getAllowedProjectIds:async()=>f.allowed?['11111111-1111-4111-8111-111111111111']:[]}))
vi.mock('../store',()=>({readReceipt:async()=>{f.reads++;return f.receipt},readLocalTextCost:async()=>({localApiFeeUsd:0,totalApiCostUsd:null,totalOperatingCostUsd:null,status:'unverified',guaranteedSavings:false})}))
const {GET}=await import('@/app/api/local-text/jobs/[id]/route')
const id='11111111-1111-4111-8111-111111111111',receipt={id,projectId:id,conversationId:id,state:'reviewing',reasonCode:null,result:{label:'support'},reviewStatus:'pending',selectionId:id,expiresAt:'2099-01-01T00:00:00.000Z',updatedAt:'2026-10-17T00:00:00.000Z'}
const request=()=>new Request('https://omnira.example/api/local-text/jobs/'+id+'?projectId='+id+'&conversationId='+id)
beforeEach(()=>{f.user=true;f.allowed=true;f.reads=0;f.receipt={...receipt}})
it('owned normal session gets no-store current receipt with unreviewed result hidden',async()=>{const response=await GET(request(),{params:{id}});expect(response.status).toBe(200);expect(response.headers.get('cache-control')).toContain('no-store');expect(await response.json()).toMatchObject({type:'local_text_job',result:null})})
it('unauthenticated or foreign project cannot reach private job reader',async()=>{f.user=false;expect((await GET(request(),{params:{id}})).status).toBe(401);f.user=true;f.allowed=false;expect((await GET(request(),{params:{id}})).status).toBe(404);expect(f.reads).toBe(0)})
it('foreign conversation or expired output never appears after reload',async()=>{f.receipt.conversationId='22222222-2222-4222-8222-222222222222';expect((await GET(request(),{params:{id}})).status).toBe(404);f.receipt={...receipt,state:'succeeded',reviewStatus:'approved',expiresAt:'2000-01-01T00:00:00.000Z'};const response=await GET(request(),{params:{id}});expect(await response.json()).toMatchObject({result:null,reasonCode:'PAYLOAD_EXPIRED'})})
