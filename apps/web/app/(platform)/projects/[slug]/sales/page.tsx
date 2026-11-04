import {notFound} from 'next/navigation'
import {getProjectBySlug} from '@/lib/project/get-project'
import {resolveProjectAccess} from '@/lib/auth/project-access'
import {createAdminClient} from '@/lib/supabase/admin'
import {readSalesWorkspace} from '@/lib/sales/store'
import {salesEnabled} from '@/lib/sales/feature'
import {SalesWorkspace} from '@/components/platform/vnext/sales/SalesWorkspace'
export const dynamic='force-dynamic'
export default async function SalesPage({params}:{params:{slug:string}}){
 const project=await getProjectBySlug(params.slug)
 if(!project||!salesEnabled(project.id))notFound()
 const access=await resolveProjectAccess();if(!access.ok)notFound()
 try{return <SalesWorkspace initial={await readSalesWorkspace(createAdminClient(),access,project.id)} projectName={project.name}/>}
 catch{return <main><h1>Säljunderlag</h1><p>Underlaget kunde inte läsas just nu. Ingen tom eller färdig kö har antagits.</p></main>}
}
