import {beforeEach,expect,it,vi} from 'vitest'
const mock=vi.hoisted(()=>({enqueue:vi.fn(),read:vi.fn(),cancel:vi.fn()}))
vi.mock('./store',()=>({enqueueCampaign:mock.enqueue,readCampaign:mock.read,cancelCampaign:mock.cancel}))
import {handleCampaignTool,SOCIAL_CAMPAIGN_TOOLS} from './atlas-tools'
const id='11111111-1111-4111-8111-111111111111',p={userId:id,allowedProjectIds:[id]}
beforeEach(()=>{vi.clearAllMocks();mock.enqueue.mockResolvedValue({status:'queued',workspaceUrl:'/real/review',publicationAuthority:false});mock.read.mockResolvedValue({status:'review_ready'});mock.cancel.mockResolvedValue({status:'cancelled'})})
it('returns actual queue receipt and verified source instead of claiming finished content',async()=>{
 const result=await handleCampaignTool('prepare_social_campaign',{projectId:id},p,id,{} as never)
 expect(result).toMatchObject({status:'queued',publicationAuthority:false});expect(mock.enqueue).toHaveBeenCalledWith({},p,id,{projectId:id})
})
it('requires an owned source, excludes unknown tools and rejects caller-supplied conversation authority',async()=>{
 expect(await handleCampaignTool('prepare_social_campaign',{projectId:id},p,null,{} as never)).toMatchObject({code:'NOT_FOUND'})
 expect(await handleCampaignTool('publish_social_campaign',{projectId:id},p,id,{} as never)).toMatchObject({code:'INVALID_BODY'})
 expect(await handleCampaignTool('prepare_social_campaign',{projectId:id,conversationId:id},p,id,{} as never)).toMatchObject({code:'INVALID_BODY'})
 expect(mock.enqueue).not.toHaveBeenCalled()
})
it('does not expose approval or publish tools in the model schema',()=>{expect(SOCIAL_CAMPAIGN_TOOLS.map(t=>t.name)).toEqual(['prepare_social_campaign','get_social_campaign','cancel_social_campaign']);for(const t of SOCIAL_CAMPAIGN_TOOLS)expect(t.input_schema.additionalProperties).toBe(false)})

it('recovers an invalid status-key shape without pretending an enqueue was attempted',async()=>{
 expect(await handleCampaignTool('get_social_campaign',{projectId:id,campaignId:'hb-linkedin-v45-20261101'},p,id,{} as never)).toMatchObject({code:'INVALID_BODY',nextAction:'prepare_social_campaign_if_new_request'})
 expect(mock.enqueue).not.toHaveBeenCalled();expect(mock.read).not.toHaveBeenCalled()
})
