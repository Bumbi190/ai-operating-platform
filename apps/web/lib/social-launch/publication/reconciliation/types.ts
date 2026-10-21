import type {PublicationRecord} from '../types'
import type {SocialContentRevision} from '../../content/types'
import type {ManualCredential} from '../provider'
import type {listFacebookCandidates,readFacebookCandidate} from './provider'
export type ReconciliationCandidate={id:string;providerId:string;accountId:string;createdAt:string;text:string;permalink:string;photoId:string;imageUrl:string}
export type AttemptSnapshot={publication:PublicationRecord;revision:SocialContentRevision}
export type ReconciliationScope={projectId:string;postId:string;publicationId:string}
export type ReconciliationProof=ReconciliationCandidate&{publicationId:string;revisionId:string;revisionSha256:string;reviewedAssetSha256:string;candidateHash:string;expiresAt:string;version:number}
export type ReconciliationDependencies={provider:{list:typeof listFacebookCandidates;read:typeof readFacebookCandidate};resolveCredential:(projectId:string)=>Promise<ManualCredential&{projectId:string;bindingId:string}>;now:()=>number}
export type CompleteReconciliation=ReconciliationScope&{candidateId:string;expectedVersion:number;imageConfirmed:true}
