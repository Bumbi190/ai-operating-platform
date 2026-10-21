import 'server-only'
import type {createAdminClient} from '@/lib/supabase/admin'
import {contentFields,contentId} from '../content/validate'
import {parseSocialProfile} from './validate'
import {SocialProfileError,type SocialProfilePrincipal,type SocialProfileSave,type SocialProfileView} from './types'
type Db=ReturnType<typeof createAdminClient>
async function call(db:Db,p:SocialProfilePrincipal,name:'social_profile_read'|'social_profile_save',input:Record<string,unknown>):Promise<SocialProfileView>{
 try{contentId(p.userId);contentId(input.projectId);if(!p.allowedProjectIds.includes(input.projectId as string))throw new SocialProfileError('NOT_FOUND');if(input.conversationId!=null)contentId(input.conversationId)}catch(e){if(e instanceof SocialProfileError)throw e;throw new SocialProfileError('INVALID_BODY')}
 const {data,error}=await (db as unknown as {rpc:(n:string,a:Record<string,unknown>)=>Promise<{data:unknown;error:{message?:string;code?:string}|null}>}).rpc(name,{p_principal:p,p_input:input})
 if(error){const code=error.code==='42501'||error.code==='P0002'?'NOT_FOUND':(['INVALID_BODY','REVISION_CONFLICT','STOPPED'] as const).find(c=>(error.message??'').includes('SOCIAL_PROFILE_'+c))??((error.message??'').includes('SOCIAL_CONTENT_STOPPED')?'STOPPED':'UNAVAILABLE');throw new SocialProfileError(code)}
 if(!data)throw new SocialProfileError('UNAVAILABLE');return data as SocialProfileView
}
export function readSocialProfile(db:Db,p:SocialProfilePrincipal,input:{projectId:string;conversationId?:string|null}){
 try{contentFields(input,['projectId','conversationId'])}catch{throw new SocialProfileError('INVALID_BODY')}
 return call(db,p,'social_profile_read',input)
}
export function saveSocialProfile(db:Db,p:SocialProfilePrincipal,input:SocialProfileSave){
 try{contentFields(input,['projectId','conversationId','expectedRevisionId','idempotencyKey','profile']);if(input.expectedRevisionId!==null)contentId(input.expectedRevisionId);if(typeof input.idempotencyKey!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(input.idempotencyKey))throw Error()}catch{throw new SocialProfileError('INVALID_BODY')}
 return call(db,p,'social_profile_save',{...input,profile:parseSocialProfile(input.profile)})
}
