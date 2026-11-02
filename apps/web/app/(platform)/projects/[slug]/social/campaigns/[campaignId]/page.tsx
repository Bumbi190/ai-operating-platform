import {notFound} from 'next/navigation'
import {getProjectBySlug} from '@/lib/project/get-project'
import {resolveProjectAccess} from '@/lib/auth/project-access'
import {createAdminClient} from '@/lib/supabase/admin'
import {readCampaign} from '@/lib/social-launch/campaign/store'
import {CampaignError} from '@/lib/social-launch/campaign/types'
import {SocialCampaignPanel} from '@/components/social-launch/SocialCampaignPanel'
export const dynamic='force-dynamic'
export default async function CampaignPage({params}:{params:{slug:string;campaignId:string}}){
 const [project,access]=await Promise.all([getProjectBySlug(params.slug),resolveProjectAccess()])
 if(!project||!access.ok||!access.allowedProjectIds.includes(project.id))notFound()
 try{
  const view=await readCampaign(createAdminClient(),access,{projectId:project.id,campaignId:params.campaignId})
  return <SocialCampaignPanel initial={view} projectName={project.name}/>
 }catch(error){
  if(error instanceof CampaignError&&['NOT_FOUND','INVALID_BODY'].includes(error.code))notFound()
  return <section role="alert"><h1>Inlägg för granskning</h1><p>Kampanjstatusen kunde inte läsas. Försök ladda om sidan.</p></section>
 }
}
