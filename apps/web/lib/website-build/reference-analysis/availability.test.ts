import {it,expect,vi,afterEach} from 'vitest'
import {referenceAnalysisEnabled} from './availability'
afterEach(()=>vi.unstubAllEnvs())
it('requires an enforced spend gate as well as all reference gates and provider configuration',()=>{
 for(const [key,value] of Object.entries({ATLAS_REFERENCE_UPLOAD_ENABLED:'true',ATLAS_REFERENCE_CHAT_SAVE_ENABLED:'true',ATLAS_REFERENCE_ANALYSIS_ENABLED:'true',ANTHROPIC_API_KEY:'fixture',H1_SPEND_GATE:'0'}))vi.stubEnv(key,value)
 expect(referenceAnalysisEnabled()).toBe(false)
 vi.stubEnv('H1_SPEND_GATE','1');expect(referenceAnalysisEnabled()).toBe(true)
 for(const key of ['ATLAS_REFERENCE_UPLOAD_ENABLED','ATLAS_REFERENCE_CHAT_SAVE_ENABLED','ATLAS_REFERENCE_ANALYSIS_ENABLED','ANTHROPIC_API_KEY']){
  const previous=process.env[key]!;vi.stubEnv(key,'');expect(referenceAnalysisEnabled()).toBe(false);vi.stubEnv(key,previous)
 }
})
