import {it,expect,vi} from 'vitest'
const mocks=vi.hoisted(()=>({rpc:vi.fn().mockResolvedValue({data:'APPROVED',error:null}),feedback:vi.fn(),memory:vi.fn()}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({rpc:mocks.rpc,from:()=>{const q:any={select:()=>q,eq:()=>q,single:async()=>({data:{id:'approval',project_id:'project',run_id:'run',kind:'sales_reply_review',content:'metadata only'}})};return q}})}))
vi.mock('@/lib/auth/project-access',()=>({resolveProjectAccess:async()=>({ok:true,allowedProjectIds:['project']}),assertProjectAllowed:()=>true,projectForbidden:()=>new Response(null,{status:403})}))
vi.mock('@/lib/ai/memory/feedback-store',()=>({saveFeedback:mocks.feedback}))
vi.mock('@/lib/atlas/memory/record-event',()=>({recordMemoryEvent:mocks.memory}))
vi.mock('@/lib/article/approval',()=>({ARTICLE_APPROVAL_KIND:'article_publish',publishApprovedArticle:vi.fn()}))
import {PATCH} from '@/app/api/approvals/[id]/route'
it('generic review requires the private version-bound reply view and writes no feedback or memory',async()=>{
 const r=await PATCH(new Request('https://fixture.invalid/api/approvals/approval',{method:'PATCH',body:JSON.stringify({action:'approved',reviewer_notes:'private canary'})}) as never,{params:{id:'approval'}})
 expect(r.status).toBe(409);expect(await r.json()).toMatchObject({code:'PRIVATE_REPLY_REVIEW_REQUIRED'});expect(mocks.rpc).not.toHaveBeenCalled();expect(mocks.feedback).not.toHaveBeenCalled();expect(mocks.memory).not.toHaveBeenCalled()
})
