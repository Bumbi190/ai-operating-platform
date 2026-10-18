import 'server-only'
import {resolveFacebookCredential,resolveInstagramCredential} from '@/lib/media/social-credentials'
import {PublicationError} from './types'
import type {ManualCredential} from './provider'
export type ResolvedPublicationCredential=ManualCredential&{projectId:string;bindingId:string}
type Resolved=ResolvedPublicationCredential
export async function resolvePublicationCredential(projectId:string,channel:'facebook'|'instagram'):Promise<Resolved>{
 if(channel==='facebook'){
  const r=await resolveFacebookCredential(projectId);if(!r.ok)throw new PublicationError(r.refusal==='provider_unavailable'?'UNAVAILABLE':'REVIEW_REQUIRED')
  return {projectId:r.credential.projectId,bindingId:r.credential.bindingId,channel,accountId:r.credential.pageId,token:r.credential.pageToken,apiBase:'https://graph.facebook.com/v21.0'}
 }
 const r=await resolveInstagramCredential(projectId);if(!r.ok)throw new PublicationError(r.refusal==='provider_unavailable'?'UNAVAILABLE':'REVIEW_REQUIRED')
 return {projectId:r.credential.projectId,bindingId:r.credential.bindingId,channel,accountId:r.credential.accountId,token:r.credential.token,apiBase:r.credential.apiBase}
}
