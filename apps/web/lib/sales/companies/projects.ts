import {SalesError,type SalesPrincipal} from '../types'
import {UUID} from '../validate'
import type {CompanyProject} from './types'

/** Projects are identity metadata only; no shared contacts, messages or sending capability. */
export function projectDirectoryContext(rows:unknown,p:SalesPrincipal,selectedId:string,enabled:(id:string)=>boolean):{project:CompanyProject;projectOptions:CompanyProject[]}{
 if(!Array.isArray(rows)||rows.length>100||!p.allowedProjectIds.includes(selectedId)||!enabled(selectedId))throw new SalesError('NOT_FOUND',404)
 const ids=new Set<string>(),slugs=new Set<string>(),projectOptions:CompanyProject[]=[]
 for(const row of rows){
  if(!row||typeof row!=='object'||typeof row.id!=='string'||!UUID.test(row.id)||row.owner_id!==p.userId||!p.allowedProjectIds.includes(row.id)||ids.has(row.id)||typeof row.slug!=='string'||!/^[a-z0-9][a-z0-9-]{0,119}$/.test(row.slug)||slugs.has(row.slug)||typeof row.name!=='string'||!row.name.trim()||row.name.length>200||/[<>\u0000-\u001f\u007f]/.test(row.name))throw new SalesError('COMPANY_PROJECTS_UNAVAILABLE',503)
  ids.add(row.id);slugs.add(row.slug)
  if(enabled(row.id))projectOptions.push({id:row.id,name:row.name.trim(),slug:row.slug})
 }
 const project=projectOptions.find(row=>row.id===selectedId)
 if(!project)throw new SalesError('NOT_FOUND',404)
 return {project,projectOptions}
}
