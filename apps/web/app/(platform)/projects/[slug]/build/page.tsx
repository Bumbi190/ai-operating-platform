import {notFound} from 'next/navigation'
import {getProjectBySlug} from '@/lib/project/get-project'
import {resolveProjectAccess} from '@/lib/auth/project-access'
import {createAdminClient} from '@/lib/supabase/admin'
import {BuildStart} from '@/components/website-build/BuildStart'
export default async function WebsiteBuildStartPage({params}:{params:{slug:string}}){
 const project=await getProjectBySlug(params.slug);if(!project)notFound()
 const access=await resolveProjectAccess()
 if(!access.ok||!access.allowedProjectIds.includes(project.id))return <p role="alert">Webbbyggen kräver projektägarens åtkomst.</p>
 const {data:builds,error}=await createAdminClient().from('website_build_sessions').select('id,status,updated_at').eq('project_id',project.id).eq('created_by',access.userId).order('updated_at',{ascending:false}).limit(10)
 return <><BuildStart projectId={project.id} projectSlug={project.slug}/>{error?<p role="alert">Tidigare byggen kunde inte läsas.</p>:<nav aria-label="Tidigare byggen"><h2>Tidigare byggen</h2>{builds?.map(b=><p key={b.id}><a href={'/projects/'+encodeURIComponent(project.slug)+'/build/'+b.id}>Öppna bygge · {new Date(b.updated_at).toLocaleString('sv-SE')}</a></p>)}</nav>}</>
}
