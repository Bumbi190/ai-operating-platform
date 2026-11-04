import type {ProjectAccess} from '../../auth/project-access'
import {SalesError,type SalesPrincipal} from '../types'
import {salesId,fields} from '../validate'
import {salesHeaders,failure,readBody} from '../http'
import {parseCompanySearchQuery,companyQueryMunicipality,type CompanySearchQuery} from './query'
import {buildCompanyDirectory} from './model'
import type {CompanyInput,CompanySearchResult} from './types'

export type CompaniesDeps={access:()=>Promise<ProjectAccess>;enabled:(projectId:string)=>boolean;read:(projectId:string,p:SalesPrincipal)=>Promise<CompanyInput>;sourceConfigured:()=>boolean;discover:(query:CompanySearchQuery,offset?:number)=>Promise<CompanySearchResult>}
export function createCompaniesApi(deps:CompaniesDeps){return async(request:Request):Promise<Response>=>{
 try{
  if(!['GET','POST'].includes(request.method))return Response.json({code:'METHOD_NOT_ALLOWED'},{status:405,headers:salesHeaders})
  const p=await deps.access();if(!p.ok)return p.response
  let projectId:string,query:CompanySearchQuery|undefined,offset=0
  if(request.method==='GET'){
   const u=new URL(request.url)
   if([...u.searchParams.keys()].some(k=>k!=='projectId')||u.searchParams.getAll('projectId').length!==1)throw new SalesError('INVALID_BODY')
   projectId=salesId(u.searchParams.get('projectId'))
  }else{
   if(new URL(request.url).search)throw new SalesError('INVALID_BODY')
   if(request.headers.get('origin')!==new URL(request.url).origin)throw new SalesError('ORIGIN_REQUIRED',403)
   const body=await readBody(request);fields(body,['projectId','query','offset']);if(body.offset!==undefined){if(typeof body.offset!=='number'||!Number.isInteger(body.offset)||body.offset<0||body.offset>995||body.offset%5!==0)throw new SalesError('INVALID_BODY');offset=body.offset;}projectId=salesId(body.projectId);query=parseCompanySearchQuery(body.query)
  }
  if(!p.allowedProjectIds.includes(projectId)||!deps.enabled(projectId))throw new SalesError('NOT_FOUND',404)
  if(query&&!deps.sourceConfigured())throw new SalesError('DISCOVERY_SOURCE_NOT_CONFIGURED',503)
  const input=await deps.read(projectId,p)
  if(input.projectId!==projectId)throw new SalesError('COMPANY_PROJECTS_UNAVAILABLE',503)
  if(query){const result=await deps.discover(query,offset);input.publicResults={...result,city:companyQueryMunicipality(query)?.name??'',...(result.source==='scb'||'municipalityCode' in query?{}:{radiusKm:query.radiusKm})}}
  return Response.json(buildCompanyDirectory(input),{headers:salesHeaders})
 }catch(e){return failure(e)}
}}
