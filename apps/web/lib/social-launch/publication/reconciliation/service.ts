import 'server-only'
import {createHash} from 'node:crypto'
import type {createAdminClient} from '@/lib/supabase/admin'
import {resolvePublicationCredential} from '../credentials'
import {PublicationError,type PublicationPrincipal} from '../types'
import {contentId} from '../../content/validate'
import {listFacebookCandidates,readFacebookCandidate,validCandidateFor} from './provider'
import {listInstagramCandidates,readInstagramCandidate} from './instagram-provider'
import {scope,reconciliationInspect,reconciliationComplete} from './store'
import type {CompleteReconciliation,ReconciliationCandidate,ReconciliationDependencies,ReconciliationScope,AttemptSnapshot} from './types'
type Db=ReturnType<typeof createAdminClient>
const defaults:ReconciliationDependencies={provider:{
 list:(c,s)=>c.channel==='instagram'?listInstagramCandidates(c,s):listFacebookCandidates(c,s),
 read:(c,id)=>c.channel==='instagram'?readInstagramCandidate(c,id):readFacebookCandidate(c,id)
},now:()=>Date.now(),resolveCredential:resolvePublicationCredential}
export function candidateHash(c:ReconciliationCandidate){
 // A CDN query can rotate independently of the photo. Pin the photo id and URL
 // origin/path, while the operator checks the actual rendered photo.
 const u=new URL(c.imageUrl)
 return createHash('sha256').update(JSON.stringify([c.providerId,c.accountId,c.createdAt,c.text,c.permalink,c.photoId,u.origin+u.pathname])).digest('hex')
}
async function credential(s:AttemptSnapshot,deps:ReconciliationDependencies){
 const c=await deps.resolveCredential(s.publication.projectId,s.publication.channel)
 if(c.channel!==s.publication.channel||c.bindingId!==s.publication.bindingId||c.accountId!==s.publication.accountId)throw new PublicationError('REVIEW_REQUIRED')
 return c
}
export async function inspectReconciliation(db:Db,p:PublicationPrincipal,input:ReconciliationScope,deps=defaults){
 scope(input)
 const {snapshot}=await reconciliationInspect(db,p,input),cred=await credential(snapshot,deps)
 if(snapshot.publication.state!=='uncertain')return {candidates:[],receipt:snapshot.publication,revision:snapshot.revision}
 const candidates=(await deps.provider.list(cred,snapshot)).filter(c=>validCandidateFor(c,snapshot))
 if(cred.channel==='instagram'&&candidates.length!==1)return {candidates:[],receipt:snapshot.publication,revision:snapshot.revision,inspectionStatus:candidates.length?'ambiguous':'no_match'}
 const saved=await reconciliationInspect(db,p,{...input,candidates:candidates.map(c=>({...c,candidateHash:candidateHash(c)}))})
 const proofs=cred.channel==='instagram'?saved.proofs.filter(p=>candidates.some(c=>p.providerId===c.providerId&&p.candidateHash===candidateHash(c))):saved.proofs
 return {candidates:proofs,receipt:saved.snapshot.publication,revision:saved.snapshot.revision,inspectionStatus:'matches'}
}
export async function completeReconciliation(db:Db,p:PublicationPrincipal,input:CompleteReconciliation,deps=defaults){
 scope(input,['projectId','postId','publicationId','candidateId','expectedVersion','imageConfirmed'])
 try{contentId(input.candidateId);if(input.imageConfirmed!==true||!Number.isSafeInteger(input.expectedVersion)||input.expectedVersion<1)throw Error()}catch{throw new PublicationError('INVALID_BODY')}
 const base={projectId:input.projectId,postId:input.postId,publicationId:input.publicationId}
 const {snapshot,proofs}=await reconciliationInspect(db,p,base),proof=proofs.find(c=>c.id===input.candidateId)
 if(!proof||Date.parse(proof.expiresAt)<deps.now())throw new PublicationError('CONFLICT')
 const cred=await credential(snapshot,deps)
 if(cred.channel==='instagram'){
  const currentMatches=(await deps.provider.list(cred,snapshot)).filter(c=>validCandidateFor(c,snapshot))
  if(currentMatches.length!==1||currentMatches[0].providerId!==proof.providerId||candidateHash(currentMatches[0])!==proof.candidateHash)throw new PublicationError('CONFLICT')
 }
 const current=await deps.provider.read(cred,proof.providerId)
 if(!validCandidateFor(current,snapshot)||candidateHash(current)!==proof.candidateHash)throw new PublicationError('CONFLICT')
 return reconciliationComplete(db,p,{...input,candidateHash:candidateHash(current),readAt:new Date(deps.now()).toISOString()})
}
