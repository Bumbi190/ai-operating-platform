import {notFound} from 'next/navigation'
import {getProjectBySlug} from '@/lib/project/get-project'
import {companyDirectoryForOwner} from '@/lib/sales/companies/server'
import {CompanyDirectory} from '@/components/platform/vnext/sales/CompanyDirectory'
export const dynamic='force-dynamic'
export default async function CompaniesPage({params}:{params:{slug:string}}){
 const project=await getProjectBySlug(params.slug)
 if(!project)notFound()
 const initial=await companyDirectoryForOwner(project.id)
 if(!initial)notFound()
 return <CompanyDirectory key={project.id} initial={initial} />
}
