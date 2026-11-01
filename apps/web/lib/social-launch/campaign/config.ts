import 'server-only'
import {assertSourceUrlTrusted} from '@/lib/media/asset/validate'
import {CampaignError} from './types'
// Operator-pinned provider CDN origins. Empty until independently verified for rollout.
export function campaignImageOrigins():string[]{
 const raw=process.env.SOCIAL_CAMPAIGN_IMAGE_ORIGINS?.trim()
 if(!raw)throw new CampaignError('DISABLED')
 const origins=raw.split(',').map(v=>v.trim())
 if(origins.length>5)throw new CampaignError('DISABLED')
 for(const origin of origins){
  let u:URL;try{u=assertSourceUrlTrusted(origin)}catch{throw new CampaignError('DISABLED')}
  if(u.origin!==origin||u.port||u.pathname!=='/'||u.search||u.hash)throw new CampaignError('DISABLED')
 }
 return origins
}
