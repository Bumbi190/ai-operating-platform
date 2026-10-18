import 'server-only'
import {createHash} from 'node:crypto'
import type {createAdminClient} from '@/lib/supabase/admin'
import {resolveFacebookCredential} from '@/lib/media/social-credentials'
import {PublicationError,type PublicationPrincipal} from '../types'
import {contentId} from '../../content/validate'
import {listFacebookCandidates,readFacebookCandidate,validCandidateFor} from './provider'
import {scope,reconciliationInspect,reconciliationComplete} from './store'
import type {CompleteReconciliation,ReconciliationCandidate,ReconciliationDependencies,ReconciliationScope,AttemptSnapshot} from './types'
type Db=ReturnType<typeof createAdminClient>
const defaults:ReconciliationDependencies={provider:{list:listFacebookCandidates,read:readFacebookCandidate},now:()=>Date.now(),resolveCredential:async projectId=>{
 const r=await resolveFacebookCredential(projectId);if(!r.ok)throw new PublicationError('REVIEW_REQUIRED')
 return {channel:'facebook',bindingId:r.credential.bindingId,accountId:r.credential.pageId,token:r.credential.pageToken,apiBase:'https://graph.facebook.com/v21.0'}
}}
export function candidateHash(c:ReconciliationCandidate){
 // A CDN query can rotate independently of the photo. Pin the photo id and URL
 // origin/path, while the operator checks the actual rendered photo.
 const u=new URL(c.imageUrl)
 return createHash('sha256').update(JSON.stringify([c.providerId,c.accountId,c.createdAt,c.text,c.permalink,c.photoId,u.origin+u.pathname])).digest('hex')
}
async function credential(s:AttemptSnapshot,deps:ReconciliationDependencies){
 const c=await deps.resolveCredential(s.publication.projectId)
 if(s.publication.channel!=='facebook'||c.channel!=='facebook'||c.bindingId!==s.publication.bindingId||c.accountId!==s.publication.accountId)throw new PublicationError('REVIEW_REQUIRED')
 return c
}
export async function inspectReconciliation(db:Db,p:PublicationPrincipal,input:ReconciliationScope,deps=defaults){
 scope(input)
 const {snapshot}=await reconciliationInspect(db,p,input),cred=await credential(snapshot,deps)
 if(snapshot.publication.state!=='uncertain')return {candidates:[],receipt:snapshot.publication,revision:snapshot.revision}
 const candidates=(await deps.provider.list(cred,snapshot)).filter(c=>validCandidateFor(c,snapshot))
 const saved=await reconciliationInspect(db,p,{...input,candidates:candidates.map(c=>({...c,candidateHash:candidateHash(c)}))})
 return {candidates:saved.proofs,receipt:saved.snapshot.publication,revision:saved.snapshot.revision}
}
export async function completeReconciliation(db:Db,p:PublicationPrincipal,input:CompleteReconciliation,deps=defaults){
 scope(input,['projectId','postId','publicationId','candidateId','expectedVersion','imageConfirmed'])
 try{contentId(input.candidateId);if(input.imageConfirmed!==true||!Number.isSafeInteger(input.expectedVersion)||input.expectedVersion<1)throw Error()}catch{throw new PublicationError('INVALID_BODY')}
 const base={projectId:input.projectId,postId:input.postId,publicationId:input.publicationId}
 const {snapshot,proofs}=await reconciliationInspect(db,p,base),proof=proofs.find(c=>c.id===input.candidateId)
 if(!proof||Date.parse(proof.expiresAt)<deps.now())throw new PublicationError('CONFLICT')
 const cred=await credential(snapshot,deps),current=await deps.provider.read(cred,proof.providerId)
 if(!validCandidateFor(current,snapshot)||candidateHash(current)!==proof.candidateHash)throw new PublicationError('CONFLICT')
 return reconciliationComplete(db,p,{...input,candidateHash:candidateHash(current),readAt:new Date(deps.now()).toISOString()})
}
