import 'server-only'
import type {createAdminClient} from '@/lib/supabase/admin'
import {contentFields,contentId} from '../../content/validate'
import {PublicationError,type PublicationPrincipal,type PublicationRecord} from '../types'
import type {AttemptSnapshot,ReconciliationProof,ReconciliationScope} from './types'
type Db=ReturnType<typeof createAdminClient>
export function scope(input:unknown,fields=['projectId','postId','publicationId']):asserts input is ReconciliationScope{
 try{contentFields(input,fields);contentId(input.projectId);contentId(input.postId);contentId(input.publicationId)}catch{throw new PublicationError('INVALID_BODY')}
}
async function call<T>(db:Db,p:PublicationPrincipal,name:string,input:ReconciliationScope&Record<string,unknown>):Promise<T>{
 scope(input,Object.keys(input));if(!p.allowedProjectIds.includes(input.projectId))throw new PublicationError('NOT_FOUND')
 const {data,error}=await (db as any).rpc(name,{p_principal:p,p_input:input})
 if(error)throw new PublicationError(error.code==='42501'||error.code==='P0002'?'NOT_FOUND':(['INVALID_BODY','REVIEW_REQUIRED','CONFLICT'] as const).find(c=>(error.message??'').includes('SOCIAL_PUBLICATION_'+c))??'UNAVAILABLE')
 if(!data)throw new PublicationError('UNAVAILABLE');return data
}
export function reconciliationInspect(db:Db,p:PublicationPrincipal,input:ReconciliationScope&{candidates?:Record<string,unknown>[]}){
 return call<{snapshot:AttemptSnapshot;proofs:ReconciliationProof[]}>(db,p,'social_publication_reconciliation_inspect',input)
}
export function reconciliationComplete(db:Db,p:PublicationPrincipal,input:ReconciliationScope&{candidateId:string;expectedVersion:number;imageConfirmed:true;candidateHash:string;readAt:string}){
 return call<PublicationRecord>(db,p,'social_publication_reconciliation_complete',input)
}
