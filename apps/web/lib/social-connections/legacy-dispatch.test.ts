import {it,expect,vi,beforeEach} from 'vitest'
import {verifyBindingHealth} from '../media/credential-health'
import type {SocialAccountBinding} from '../media/social-bindings'
const deps=vi.hoisted(()=>({youtube:vi.fn(async()=>({ok:false,refusal:'provider_unavailable'}))}))
vi.mock('@/lib/media/social-credentials',()=>({resolveYouTubeCredential:deps.youtube,resolveFacebookCredential:vi.fn(),resolveInstagramCredential:vi.fn()}))
beforeEach(()=>vi.clearAllMocks())
it.each(['linkedin','pinterest','x'])('never routes a new %s account into YouTube verification',async platform=>{
 const verdict=await verifyBindingHealth({projectId:'10000000-0000-4000-8000-000000000001',platform} as SocialAccountBinding)
 expect(deps.youtube).not.toHaveBeenCalled();expect(verdict.identityVerified).toBe(false)
})
