import 'server-only'
import type {ProjectAccess} from '../../auth/project-access'
import {SalesError,type SalesPrincipal} from '../types'
import {fields,salesId} from '../validate'
import {salesHeaders,failure,readBody} from '../http'
import {parseLegalOrgnr} from '../../handlarborsen/lead-finder/scb-status-policy'
import {COMPANY_WEBSITE_CONFIRMATION,type CompanyWebsiteEvidence} from './website-types'
export type CompanyWebsiteApiDeps={access:()=>Promise<ProjectAccess>;enabled:(projectId:string)=>boolean;configured:(p:SalesPrincipal)=>boolean;projectReady:(projectId:string,p:SalesPrincipal)=>Promise<boolean>;research:(orgnr:string,workplaceRef:string|null)=>Promise<CompanyWebsiteEvidence>}
export function createCompanyWebsiteApi(deps:CompanyWebsiteApiDeps){return async(request:Request):Promise<Response>=>{
 try{
  if(request.method!=='POST')return Response.json({code:'METHOD_NOT_ALLOWED'},{status:405,headers:salesHeaders})
  const p=await deps.access();if(!p.ok)return p.response
  if(request.headers.get('origin')!==new URL(request.url).origin)throw new SalesError('ORIGIN_REQUIRED',403)
  if(new URL(request.url).search)throw new SalesError('INVALID_BODY')
  if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')throw new SalesError('UNSUPPORTED_MEDIA_TYPE',415)
  const body=await readBody(request);fields(body,['projectId','orgnr','workplaceRef','confirmation'])
  const projectId=salesId(body.projectId),identity=parseLegalOrgnr(body.orgnr),workplaceRef=body.workplaceRef??null
  if(!identity.ok||body.confirmation!==COMPANY_WEBSITE_CONFIRMATION||(workplaceRef!==null&&(typeof workplaceRef!=='string'||!/^\d{1,20}$/.test(workplaceRef))))throw new SalesError('INVALID_BODY')
  if(!p.allowedProjectIds.includes(projectId)||!deps.enabled(projectId))throw new SalesError('NOT_FOUND',404)
  if(!await deps.projectReady(projectId,p))throw new SalesError('PROJECT_EXECUTION_PAUSED',409)
  if(!deps.configured(p))throw new SalesError('COMPANY_WEBSITE_DISABLED',503)
  const result=await deps.research(identity.orgnr,workplaceRef)
  if(result.orgnr!==identity.orgnr||result.workplaceRef!==workplaceRef)throw new SalesError('UNAVAILABLE',503)
  return Response.json({...result,projectId},{headers:salesHeaders})
 }catch(e){return failure(e)}
}}
