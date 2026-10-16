import 'server-only'
import type {createAdminClient} from '@/lib/supabase/admin'
import {contentFields,contentId} from '../content/validate'
import {PublicationError,type PublicationPrincipal,type PublicationRequest,type PublicationStep,type PublicationRecord} from './types'
import {parsePublicationRequest} from './validate'
type Db=ReturnType<typeof createAdminClient>
async function call<T>(db:Db,p:PublicationPrincipal,name:string,input:Record<string,unknown>):Promise<T>{
 try{contentId(p.userId);contentId(input.projectId);contentId(input.postId)}catch{throw new PublicationError('INVALID_BODY')}
 if(!p.allowedProjectIds.includes(input.projectId as string))throw new PublicationError('NOT_FOUND')
 const {data,error}=await (db as any).rpc(name,{p_principal:p,p_input:input})
 if(error)throw new PublicationError(error.code==='P0002'||error.code==='42501'?'NOT_FOUND':(['INVALID_BODY','REVIEW_REQUIRED','UNSUPPORTED','STOPPED','CONFLICT'] as const).find(c=>(error.message??'').includes('SOCIAL_PUBLICATION_'+c))??((error.message??'').includes('SOCIAL_CONTENT_STOPPED')?'STOPPED':'UNAVAILABLE'))
 if(data===null)throw new PublicationError('UNAVAILABLE');return data as T
}
export function publicationRead(db:Db,p:PublicationPrincipal,input:{projectId:string;postId:string}){try{contentFields(input,['projectId','postId'])}catch{throw new PublicationError('INVALID_BODY')}return call<{publication:PublicationRecord|null}>(db,p,'social_publication_read',input)}
export function publicationPrepare(db:Db,p:PublicationPrincipal,input:PublicationRequest){return call<PublicationRecord>(db,p,'social_publication_prepare',parsePublicationRequest(input))}
export function publicationStep(db:Db,p:PublicationPrincipal,input:PublicationStep){
 try{contentFields(input,['projectId','postId','publicationId','expectedVersion','action','capabilityHash','containerId','providerId','permalink','failureCode']);contentId(input.publicationId);if(!Number.isSafeInteger(input.expectedVersion)||input.expectedVersion<1)throw Error()}catch{throw new PublicationError('INVALID_BODY')}
 return call<{changed:boolean;record:PublicationRecord}>(db,p,'social_publication_step',input)
}
export async function publicationMediaLookup(db:Db,input:{publicationId:string;keyHash:string}):Promise<{projectId:string;assetId:string;sha256:string;mimeType:string;byteSize:number;bucket:string;path:string}|null>{
 try{contentId(input.publicationId);if(!/^[a-f0-9]{64}$/.test(input.keyHash))return null;const {data,error}=await (db as any).rpc('social_publication_media_lookup',{p_input:input});return error?null:data}catch{return null}
}

export async function publicationAssert(db:Db,p:PublicationPrincipal,input:PublicationRequest):Promise<void>{await call<unknown>(db,p,'social_publication_guard',parsePublicationRequest(input))}
