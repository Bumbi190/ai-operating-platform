import 'server-only'
import {resolveProjectAccess} from '@/lib/auth/project-access'
import {createAdminClient} from '@/lib/supabase/admin'
import {isAnthropicModel,isOpenAIModel,isImageModel} from '@/lib/ai/models'
import {readOperatorProjectRoot,readProjectWebsiteBuilder} from './store'
import type {WebsiteBuilderSettingsModel} from './settings-types'
export async function loadWebsiteBuilderSettings():Promise<WebsiteBuilderSettingsModel|null>{
 const access=await resolveProjectAccess();if(!access.ok)return null
 const db=createAdminClient(),result:WebsiteBuilderSettingsModel={root:null,rootReadable:true,projectsReadable:true,projects:[]}
 try{result.root=await readOperatorProjectRoot(db,access)}catch{result.rootReadable=false}
 if(!access.allowedProjectIds.length)return result
 const [projects,agents]=await Promise.all([
  db.from('projects').select('id,name').in('id',access.allowedProjectIds).eq('owner_id',access.userId),
  db.from('agents').select('id,name,model,project_id').in('project_id',access.allowedProjectIds),
 ])
 if(projects.error||!projects.data)return {...result,rootReadable:result.rootReadable,projectsReadable:false,projects:[]}
 result.projects=await Promise.all(projects.data.map(async project=>{
  let setting=null,readable=!agents.error
  try{setting=await readProjectWebsiteBuilder(db,access,project.id)}catch{readable=false}
  return {id:project.id,name:project.name,setting,readable,agents:(agents.data??[]).filter(a=>a.project_id===project.id&&!isImageModel(a.model)&&(isAnthropicModel(a.model)||isOpenAIModel(a.model))).map(a=>({id:a.id,name:a.name}))}
 }))
 return result
}