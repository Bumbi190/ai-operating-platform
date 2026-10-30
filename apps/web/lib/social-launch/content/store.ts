import 'server-only'
import type {createAdminClient} from '@/lib/supabase/admin'
import type {SocialContentPrincipal,SocialContentProposal,SocialContentDecision,SocialContentView} from './types'
import {SocialContentError} from './types'
import {contentFields,contentId,parseSocialContent} from './validate'
import {withRepeatReview} from './repeat'
type Db=ReturnType<typeof createAdminClient>
function scoped(p:SocialContentPrincipal,projectId:string){contentId(p.userId);contentId(projectId);if(!p.allowedProjectIds.includes(projectId))throw new SocialContentError('NOT_FOUND')}
function key(v:unknown){if(typeof v!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(v))throw new SocialContentError('INVALID_BODY')}
async function call(db:Db,p:SocialContentPrincipal,name:'social_content_read'|'social_content_save'|'social_content_decide',input:unknown):Promise<SocialContentView>{
 const {data,error}=await (db as unknown as {rpc:(name:string,args:Record<string,unknown>)=>Promise<{data:unknown;error:{message?:string;code?:string}|null}>}).rpc(name,{p_principal:p,p_input:input})
 if(error){const message=error.message??'',code=error.code==='P0002'||error.code==='42501'?'NOT_FOUND':error.code==='23505'?'REVISION_CONFLICT':(['INVALID_BODY','REVISION_CONFLICT','REVIEW_REQUIRED','MEDIA_REQUIRED','STOPPED','LIMIT_REACHED'] as const).find(k=>message.includes('SOCIAL_CONTENT_'+k))??'UNAVAILABLE';throw new SocialContentError(code)}
 if(!data)throw new SocialContentError('UNAVAILABLE');return withRepeatReview(db,p,data as SocialContentView)
}
export async function readSocialContent(db:Db,p:SocialContentPrincipal,input:{projectId:string;conversationId?:string|null}):Promise<SocialContentView>{contentFields(input,['projectId','conversationId']);scoped(p,input.projectId);if(input.conversationId!=null)contentId(input.conversationId);return call(db,p,'social_content_read',input)}
export async function proposeSocialContent(db:Db,p:SocialContentPrincipal,input:SocialContentProposal):Promise<SocialContentView>{
 contentFields(input,['projectId','conversationId','postId','expectedRevisionId','planRevisionId','idempotencyKey','draft']);scoped(p,input.projectId);contentId(input.postId);contentId(input.planRevisionId);if(input.expectedRevisionId!==null)contentId(input.expectedRevisionId);if(input.conversationId!=null)contentId(input.conversationId);key(input.idempotencyKey)
 return call(db,p,'social_content_save',{...input,draft:parseSocialContent(input.draft,false)})
}
export async function decideSocialContent(db:Db,p:SocialContentPrincipal,input:SocialContentDecision):Promise<SocialContentView>{
 contentFields(input,['projectId','postId','revisionId','sha256','decision','idempotencyKey']);scoped(p,input.projectId);contentId(input.postId);contentId(input.revisionId);key(input.idempotencyKey)
 if(!['approve','reject'].includes(input.decision)||typeof input.sha256!=='string'||!/^[a-f0-9]{64}$/.test(input.sha256))throw new SocialContentError('INVALID_BODY')
 return call(db,p,'social_content_decide',input)
}
