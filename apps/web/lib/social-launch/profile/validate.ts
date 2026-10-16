import type {SocialProfileInput} from './types'
import {SocialProfileError} from './types'
import {contentFields,contentId} from '../content/validate'
export function parseSocialProfile(input:unknown):SocialProfileInput{
 try{
  contentFields(input,['description','audience','tone','websiteUrl','callToAction','factualBoundaries','preferredMediaIds'])
  for(const [key,min,max] of [['description',1,1200],['audience',1,600],['tone',1,300],['callToAction',0,300],['factualBoundaries',0,1000]] as const){
   const v=input[key];if(typeof v!=='string'||v.trim().length<min||v.length>max||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v))throw Error()
  }
  if(input.websiteUrl!==null){if(typeof input.websiteUrl!=='string'||input.websiteUrl.length>2048)throw Error();const u=new URL(input.websiteUrl);if(u.protocol!=='https:'||u.username||u.password)throw Error()}
  if(!Array.isArray(input.preferredMediaIds)||input.preferredMediaIds.length>5||new Set(input.preferredMediaIds).size!==input.preferredMediaIds.length)throw Error()
  input.preferredMediaIds.forEach(contentId);return input as unknown as SocialProfileInput
 }catch{throw new SocialProfileError('INVALID_BODY')}
}
