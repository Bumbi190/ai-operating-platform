import {notFound} from 'next/navigation'
import {getProjectBySlug} from '@/lib/project/get-project'
import {HANDLARBORSEN_PROJECT_ID} from '@/lib/atlas/handlarborsen-test-data/contracts'
import {companyDirectoryForOwner} from '@/lib/sales/companies/server'
import {CompanyDirectory} from '@/components/platform/vnext/sales/CompanyDirectory'
export const dynamic='force-dynamic'
export default async function CompaniesPage({params}:{params:{slug:string}}){
 const project=await getProjectBySlug(params.slug)
 if(!project||project.id!==HANDLARBORSEN_PROJECT_ID)notFound()
 const initial=await companyDirectoryForOwner(project.id)
 if(!initial)notFound()
 return <CompanyDirectory initial={initial} />
}
