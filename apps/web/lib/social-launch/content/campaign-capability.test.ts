import {afterEach,beforeEach,expect,it,vi} from 'vitest'
const mocks=vi.hoisted(()=>({read:vi.fn(),propose:vi.fn(),capability:vi.fn()}))
vi.mock('./store',()=>({readSocialContent:mocks.read,proposeSocialContent:mocks.propose}))
vi.mock('../campaign/store',()=>({campaignPreparationCapability:mocks.capability}))
import {handleSocialContentTool} from './atlas-tools'
import {SocialContentError} from './types'
const id='11111111-1111-4111-8111-111111111111',p={userId:id,allowedProjectIds:[id]}
beforeEach(()=>{vi.clearAllMocks();mocks.read.mockResolvedValue({dispatchEnabled:false,publicationReady:false,posts:[]});mocks.capability.mockReturnValue({configured:true,maxItems:3,maxImageCostSek:5,requiresPublicationAccount:false,publicationAuthority:false})})
afterEach(()=>vi.restoreAllMocks())
it('reports configured image preparation independently of disabled delivery after the owned read succeeds',async()=>{
 const result=await handleSocialContentTool('get_social_content',{projectId:id},p,id,{} as never)
 expect(result).toMatchObject({dispatchEnabled:false,publicationReady:false,imageCampaignPreparation:{configured:true,requiresPublicationAccount:false,publicationAuthority:false,maxImageCostSek:5}})
 expect(mocks.read).toHaveBeenCalledWith({},p,{projectId:id,conversationId:id})
 expect(mocks.capability).toHaveBeenCalledWith(id)
 expect(mocks.propose).not.toHaveBeenCalled()
})
it('does not report capabilities when the owned project/source read is refused',async()=>{
 mocks.read.mockRejectedValue(new SocialContentError('NOT_FOUND'))
 expect(await handleSocialContentTool('get_social_content',{projectId:id},p,id,{} as never)).toMatchObject({code:'NOT_FOUND'})
 expect(mocks.capability).not.toHaveBeenCalled()
})
