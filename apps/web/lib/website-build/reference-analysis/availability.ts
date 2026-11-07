import 'server-only'
import {referenceUploadEnabled} from '../assets/availability'
import {isSpendGateEnforced} from '@/lib/cost/spend-gate-flag'
/** No hosted activation is implied by shipping this code. */
export function referenceAnalysisEnabled(){
 return isSpendGateEnforced()&&referenceUploadEnabled()&&process.env.ATLAS_REFERENCE_CHAT_SAVE_ENABLED==='true'&&
  process.env.ATLAS_REFERENCE_ANALYSIS_ENABLED==='true'&&!!process.env.ANTHROPIC_API_KEY
}
