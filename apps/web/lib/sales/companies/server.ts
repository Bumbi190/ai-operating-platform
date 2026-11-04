import 'server-only'
import {createClient} from '../../supabase/server'
import {createAdminClient} from '../../supabase/admin'
import {resolveProjectAccess} from '../../auth/project-access'
import {HANDLARBORSEN_PROJECT_ID} from '../../atlas/handlarborsen-test-data/contracts'
import {loadArchivedLeadResearchForOwner} from '../../handlarborsen/lead-finder/research-archive-server'
import {parseKnownContacts} from '../../handlarborsen/lead-finder/known-contacts'
import {loadSavedCandidatesForOwner} from '../../handlarborsen/lead-finder/saved-candidates-server'
import {scoped} from '../store'
import {readContactTiming} from '../timing/store'
import {salesEnabled} from '../feature'
import {SalesError,type SalesPrincipal} from '../types'
import {companySearchProvider,discoverCompanyBusinesses} from './source'
import {readCompanyContacts,readCompanyTiming} from './read'
import {buildCompanyDirectory} from './model'
import {createCompaniesApi} from './api'
import type {CompanyInput,ContactsRead} from './types'

/** No workspace RPC: that RPC reconciles expired jobs even during a GET. */
export async function readCompanyInput(projectId:string,p:SalesPrincipal):Promise<CompanyInput>{
 scoped(p,projectId);if(projectId!==HANDLARBORSEN_PROJECT_ID||!salesEnabled(projectId))throw new SalesError('NOT_FOUND',404)
 const db=await createClient()
 const enabled=process.env.HB_LEADFINDER_CONTACT_READ_ENABLED==='true'
 const contacts:ContactsRead=enabled?await readCompanyContacts(projectId,async(afterId,limit)=>{
  const reader=db as unknown as {from:(table:string)=>any}
  let query=reader.from('sales_contacts').select('id,project_id,version,data').eq('project_id',projectId).order('id',{ascending:true}).limit(limit)
  if(afterId)query=query.gt('id',afterId)
  return await query
 }):{status:'disabled',contacts:[]}
 const known=parseKnownContacts(contacts.status==='ready'?contacts.contacts.map(c=>({project_id:projectId,data:c})):null,projectId)
 const [timing,archive,saved]=await Promise.all([
  contacts.status==='ready'?readCompanyTiming(projectId,contacts.contacts,ids=>readContactTiming(createAdminClient(),p,{projectId,contactIds:ids})):Promise.resolve(null),
  loadArchivedLeadResearchForOwner(projectId,known),loadSavedCandidatesForOwner(projectId),
 ])
 return {projectId,evaluatedAt:new Date().toISOString(),contacts,timing,archive,saved,sourceConfigured:companySearchProvider()!==null,searchProvider:companySearchProvider()}
}
export async function companyDirectoryForOwner(projectId:string){
 const p=await resolveProjectAccess();if(!p.ok||!p.allowedProjectIds.includes(projectId)||projectId!==HANDLARBORSEN_PROJECT_ID||!salesEnabled(projectId))return null
 return buildCompanyDirectory(await readCompanyInput(projectId,p))
}
export const companiesApi=createCompaniesApi({access:resolveProjectAccess,enabled:salesEnabled,read:readCompanyInput,sourceConfigured:()=>companySearchProvider()!==null,discover:discoverCompanyBusinesses})
