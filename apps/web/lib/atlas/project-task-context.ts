import 'server-only'
import type Anthropic from '@anthropic-ai/sdk'
import type {createAdminClient} from '@/lib/supabase/admin'

type Principal={userId:string;allowedProjectIds:string[]}
type ProjectRow={id:string;owner_id:string;name:string;slug:string}
type Result={project:{id:string;name:string;slug:string};navigationPerformed:false}|{code:'INVALID_BODY'|'NOT_FOUND'|'PROJECT_AMBIGUOUS'|'PROJECT_UNAVAILABLE'}
const normalize=(value:string)=>value.trim().normalize('NFKC').toLocaleLowerCase('sv-SE')
export const PROJECT_CONTEXT_TOOL:Anthropic.Tool={
 name:'resolve_project_context',
 description:'Resolve an explicitly requested project name, slug or UUID against the authenticated owner’s current projects. Read-only identity lookup from any chat; does not navigate, change the chat, or grant publishing/execution authority. Use the returned project.id for project tools. Ask only if ambiguous.',
 input_schema:{type:'object',additionalProperties:false,properties:{project:{type:'string',minLength:1,maxLength:200}},required:['project']},
}
export const PROJECT_TASK_GUIDE='\nPROJECT TASK ROUTING: Nova/Atlas coordinates the authenticated owner’s projects from any owned conversation. Resolve the project explicitly requested by the operator with resolve_project_context; use the returned project.id in each scoped tool. A page change does not select an execution target or verify a conversation. Global or differently tagged owned chats are valid sources for social preparation; preserve their IDs as provenance, never demand a different project chat or retag the conversation. If the target is ambiguous ask one clarifying question; if denied or unavailable report the actual blocker. After a project switch read that target’s own profile, plan, assets and status; do not reuse another project’s facts, credentials or media. Studio’s server-selected project boundary still applies. Prepare the requested work using real tools and return saved review links; only successful save receipts prove saved work. No background completion promise without an actual queued job and supported worker. Generic workflows already accept an explicit owned project; validate and save only supported steps, never create a placeholder workflow to simulate missing image generation or LinkedIn publication. Social preparation supports LinkedIn drafts and intended times, but executable social batches currently support only Facebook/Instagram. A mediaBrief is not a generated image. Navigation is optional for preparation; use navigate only for an explicit UI navigation request and claim it only after success.\n'

/** Service-role queries must independently prove both owner and allowed project. */
export async function resolveProjectTaskContext(
 db:ReturnType<typeof createAdminClient>,p:Principal,input:Record<string,unknown>,
):Promise<Result>{
 if(Object.keys(input).some(key=>key!=='project')||typeof input.project!=='string'||!input.project.trim()||input.project.length>200)return {code:'INVALID_BODY'}
 if(!p.allowedProjectIds.length)return {code:'NOT_FOUND'}
 try{
  const {data,error}=await db.from('projects').select('id, owner_id, name, slug')
   .eq('owner_id',p.userId).in('id',p.allowedProjectIds).limit(1001)
  if(error||!Array.isArray(data)||data.length>1000)return {code:'PROJECT_UNAVAILABLE'}
  const rows=data as ProjectRow[]
  if(rows.some(row=>!row||row.owner_id!==p.userId||!p.allowedProjectIds.includes(row.id)||
   typeof row.name!=='string'||typeof row.slug!=='string'||!row.name.trim()||!row.slug.trim()))return {code:'PROJECT_UNAVAILABLE'}
  const reference=normalize(input.project)
  const matches=rows.filter(row=>[row.id,row.name,row.slug].some(value=>normalize(value)===reference))
  if(matches.length===0)return {code:'NOT_FOUND'}
  if(matches.length!==1)return {code:'PROJECT_AMBIGUOUS'}
  const {id,name,slug}=matches[0]
  return {project:{id,name,slug},navigationPerformed:false}
 }catch{return {code:'PROJECT_UNAVAILABLE'}}
}
