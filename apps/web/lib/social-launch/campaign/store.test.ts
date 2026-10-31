import {beforeEach,expect,it,vi} from 'vitest'
const cost=vi.hoisted(()=>({getRates:vi.fn(),estimate:vi.fn(),enforced:vi.fn()}))
vi.mock('@/lib/cost/rates',()=>({getRates:cost.getRates}))
vi.mock('@/lib/cost/budget-gate',()=>({estimateImageSek:cost.estimate}))
vi.mock('@/lib/cost/spend-gate-flag',()=>({isSpendGateEnforced:cost.enforced}))
import {enqueueCampaign,readCampaign} from './store'
const id='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222'
const p={userId:id,allowedProjectIds:[id]}
const input={projectId:id,campaignId:other,planRevisionId:id,profileRevisionId:id,idempotencyKey:'intent',items:[{title:'Title',text:'Actual copy',imagePrompt:'A dealer',localMinute:'2027-03-02T08:30'}]}
beforeEach(()=>{vi.unstubAllEnvs();vi.stubEnv('SOCIAL_CAMPAIGN_PREPARATION','1');vi.stubEnv('SOCIAL_CAMPAIGN_PROJECT_IDS',id);vi.stubEnv('SOCIAL_CAMPAIGN_IMAGE_ORIGINS','https://cdn.vendor.example');cost.enforced.mockReturnValue(true);cost.getRates.mockResolvedValue({});cost.estimate.mockResolvedValue(1.2)})
it('OFF refuses before pricing or database mutation',async()=>{vi.stubEnv('SOCIAL_CAMPAIGN_PREPARATION','0');const rpc=vi.fn();await expect(enqueueCampaign({rpc} as never,p,id,input)).rejects.toMatchObject({code:'DISABLED'});expect(rpc).not.toHaveBeenCalled()})
it('cannot request a target outside the server allow-list',async()=>{const rpc=vi.fn();await expect(enqueueCampaign({rpc} as never,{...p,allowedProjectIds:[]},id,input)).rejects.toMatchObject({code:'NOT_FOUND'});expect(rpc).not.toHaveBeenCalled()})
it('never queues paid work under an advisory spend gate or excessive fresh price',async()=>{const rpc=vi.fn();cost.enforced.mockReturnValue(false);await expect(enqueueCampaign({rpc} as never,p,id,input)).rejects.toMatchObject({code:'DISABLED'});cost.enforced.mockReturnValue(true);cost.estimate.mockResolvedValue(6);await expect(enqueueCampaign({rpc} as never,p,id,input)).rejects.toMatchObject({code:'COST_LIMIT'});expect(rpc).not.toHaveBeenCalled()})
it('server supplies source provenance and rounded-up unit allocation; caller cannot forge UTC/authority',async()=>{const rpc=vi.fn().mockResolvedValue({data:{id:other},error:null});cost.estimate.mockResolvedValue(1.23451);await enqueueCampaign({rpc} as never,p,id,input);expect(rpc.mock.calls[0][1]).toMatchObject({p_principal:p,p_unit_ceiling_sek:1.2346,p_input:{conversationId:id,items:[{scheduledAt:'2027-03-02T07:30:00.000Z'}]}});await expect(enqueueCampaign({rpc} as never,p,id,{...input,approved:true})).rejects.toMatchObject({code:'INVALID_BODY'})})
it('maps database authority refusals without leaking provider or database details',async()=>{const rpc=vi.fn().mockResolvedValue({data:null,error:{message:'SOCIAL_CAMPAIGN_REVIEW_REQUIRED secret detail'}});await expect(readCampaign({rpc} as never,p,{projectId:id,campaignId:other})).rejects.toMatchObject({code:'REVIEW_REQUIRED',message:'REVIEW_REQUIRED'})})

it('a project-specific pilot flag cannot activate paid images for another owned project',async()=>{
 vi.stubEnv('SOCIAL_CAMPAIGN_PROJECT_IDS',id)
 const rpc=vi.fn().mockResolvedValue({data:{id:other},error:null})
 await expect(enqueueCampaign({rpc} as never,{...p,allowedProjectIds:[id,other]},id,{...input,projectId:other})).rejects.toMatchObject({code:'DISABLED'})
 expect(rpc).not.toHaveBeenCalled()
})
