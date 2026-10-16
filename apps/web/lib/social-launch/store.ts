import 'server-only'
import type {createAdminClient} from '@/lib/supabase/admin'
import {parseSocialLaunchChoices} from './catalog'
import type {SocialLaunchPrincipal,SocialLaunchView} from './types'
type Db=ReturnType<typeof createAdminClient>
type Ref={projectId:string;conversationId?:string|null}
export type SocialLaunchProposal=Ref&{expectedRevisionId:string|null;idempotencyKey:string;choices:unknown}
export type SocialLaunchDecisionInput={projectId:string;revisionId:string;sha256:string;decision:'approve'|'reject';idempotencyKey:string}
export class SocialLaunchError extends Error{
 constructor(public code:'NOT_FOUND'|'INVALID_BODY'|'REVISION_CONFLICT'|'PLAN_UNAVAILABLE'){super(code)}
 get status(){return this.code==='NOT_FOUND'?404:this.code==='INVALID_BODY'?400:this.code==='REVISION_CONFLICT'?409:503}
}
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i
export function socialLaunchFields(value:unknown,allowed:string[]):asserts value is Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!allowed.includes(k)))throw new SocialLaunchError('INVALID_BODY')
}
function id(value:unknown){if(typeof value!=='string'||!uuid.test(value))throw new SocialLaunchError('INVALID_BODY')}
function intent(value:unknown){if(typeof value!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(value))throw new SocialLaunchError('INVALID_BODY')}
function scoped(p:SocialLaunchPrincipal,projectId:string){id(p.userId);id(projectId);if(!p.allowedProjectIds.includes(projectId))throw new SocialLaunchError('NOT_FOUND')}
async function call(db:Db,p:SocialLaunchPrincipal,name:string,input:unknown):Promise<SocialLaunchView>{
 const {data,error}=await (db as unknown as {rpc:(name:string,args:Record<string,unknown>)=>Promise<{data:unknown;error:{message?:string;code?:string}|null}>}).rpc(name,{p_principal:p,p_input:input})
 if(error){const code=error.message?.includes('SOCIAL_LAUNCH_CONFLICT')||error.code==='23505'?'REVISION_CONFLICT':error.code==='P0002'||error.code==='42501'?'NOT_FOUND':error.message?.includes('SOCIAL_LAUNCH_INVALID')?'INVALID_BODY':'PLAN_UNAVAILABLE';throw new SocialLaunchError(code)}
 if(!data)throw new SocialLaunchError('PLAN_UNAVAILABLE')
 return data as SocialLaunchView
}
export async function readSocialLaunchPlan(db:Db,p:SocialLaunchPrincipal,input:Ref):Promise<SocialLaunchView>{
 socialLaunchFields(input,['projectId','conversationId']);scoped(p,input.projectId);if(input.conversationId!=null)id(input.conversationId)
 return call(db,p,'social_launch_plan_read',input)
}
export async function proposeSocialLaunchPlan(db:Db,p:SocialLaunchPrincipal,input:SocialLaunchProposal):Promise<SocialLaunchView>{
 socialLaunchFields(input,['projectId','conversationId','expectedRevisionId','idempotencyKey','choices']);scoped(p,input.projectId);intent(input.idempotencyKey)
 if(input.conversationId!=null)id(input.conversationId)
 if(input.expectedRevisionId!==null)id(input.expectedRevisionId)
 let choices;try{choices=parseSocialLaunchChoices(input.choices)}catch{throw new SocialLaunchError('INVALID_BODY')}
 return call(db,p,'social_launch_plan_save',{...input,choices})
}
export async function decideSocialLaunchPlan(db:Db,p:SocialLaunchPrincipal,input:SocialLaunchDecisionInput):Promise<SocialLaunchView>{
 socialLaunchFields(input,['projectId','revisionId','sha256','decision','idempotencyKey']);scoped(p,input.projectId);id(input.revisionId);intent(input.idempotencyKey)
 if(!['approve','reject'].includes(input.decision)||typeof input.sha256!=='string'||!(/^[a-f0-9]{64}$/).test(input.sha256))throw new SocialLaunchError('INVALID_BODY')
 return call(db,p,'social_launch_plan_decide',input)
}
