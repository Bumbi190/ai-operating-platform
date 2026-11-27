import {notFound} from 'next/navigation'
import {getProjectBySlug} from '@/lib/project/get-project'
import {resolveProjectAccess} from '@/lib/auth/project-access'
import {createAdminClient} from '@/lib/supabase/admin'
import {readSocialLaunchPlan,SocialLaunchError} from '@/lib/social-launch/store'
import {loadSocialLaunchPage} from '@/lib/social-launch/loader'
import {SocialLaunchPanel} from '@/components/social-launch/SocialLaunchPanel'
export const dynamic='force-dynamic'
export default async function SocialLaunchPage({params: paramsPromise,searchParams: searchParamsPromise}:{params:Promise<{slug:string}>;searchParams:Promise<{connection?:string;connectionError?:string}>}){
 const params = await paramsPromise
 const [project,access]=await Promise.all([getProjectBySlug(params.slug),resolveProjectAccess()])
 if(!project||!access.ok||!access.allowedProjectIds.includes(project.id))notFound()
 try{
  const db=createAdminClient(),plan=await readSocialLaunchPlan(db,access,{projectId:project.id})
  const searchParams = await searchParamsPromise
  const model=await loadSocialLaunchPage(plan,{principal:access,db,intentId:typeof searchParams.connection==='string'?searchParams.connection:undefined})
  if(searchParams.connectionError)model.connectionNotice='Anslutningen slutfördes inte. Kontrollera appens behörigheter och försök igen.'
  return <SocialLaunchPanel initial={model}/>
 }catch(error){if(error instanceof SocialLaunchError&&error.code==='NOT_FOUND')notFound();return <section role="alert"><h1>Sociala medier</h1><p>Kanalplanen kunde inte läsas. Försök ladda om sidan.</p></section>}
}
