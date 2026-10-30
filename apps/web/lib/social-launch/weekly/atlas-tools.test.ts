import {it,expect,vi} from 'vitest'
const s=vi.hoisted(()=>({get:vi.fn(async()=>({plan:{slots:[]},publicationAuthority:false})),save:vi.fn(async()=>({status:'editorial_review_required'}))}))
vi.mock('./service',()=>({getWeeklyContext:s.get,prepareWeeklyDrafts:s.save,WeeklyError:class extends Error{}}))
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({})}))
import {handleWeeklyMarketingTool,WEEKLY_MARKETING_TOOLS} from './atlas-tools'
const p={userId:'owner',allowedProjectIds:['project']}
it('passes only server supplied conversation and principal to read tool',async()=>{
 const r=await handleWeeklyMarketingTool('get_family_marketing_week',{projectId:'project',weekStart:'2026-11-02'},p,'conversation',{} as any)
 expect(r).toMatchObject({publicationAuthority:false});expect(s.get).toHaveBeenCalledWith({},p,{projectId:'project',weekStart:'2026-11-02',conversationId:'conversation'})
})
it('rejects missing conversation and authority overrides before any saving',async()=>{
 s.save.mockClear()
 expect(await handleWeeklyMarketingTool('prepare_family_marketing_week',{projectId:'project',principal:p},p,'conversation',{} as any)).toMatchObject({code:'INVALID_BODY'})
 expect(await handleWeeklyMarketingTool('get_family_marketing_week',{projectId:'project',weekStart:'2026-11-02'},p,null,{} as any)).toMatchObject({code:'NOT_FOUND'});expect(s.save).not.toHaveBeenCalled()
})
it('tools expose no approve, dispatch, credential or generated-media operation',()=>{
 expect(WEEKLY_MARKETING_TOOLS.map(t=>t.name)).toEqual(['get_family_marketing_week','prepare_family_marketing_week'])
 const schema=JSON.stringify(WEEKLY_MARKETING_TOOLS.map(t=>t.input_schema));for(const field of ['token','confirmed','scheduledAt','decisionId','principal','conversationId'])expect(schema).not.toContain('"'+field+'"')
})
