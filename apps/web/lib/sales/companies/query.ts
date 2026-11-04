import {SalesError} from '../types'
import {fields} from '../validate'
import {parseDiscoveryQuery} from '../discovery/validate'
import type {DiscoveryQuery} from '../discovery/types'
import {municipalityByCode} from './municipalities'
import {isCompanyIndustry,type CompanyIndustry} from './industries'

/** Municipal SCB queries are separate from legacy radius/coordinate discovery. */
export type MunicipalCompanyQuery={municipalityCode:string;category:CompanyIndustry;limit:5}
export type CompanySearchQuery=MunicipalCompanyQuery|DiscoveryQuery
const legacyMunicipalities={stockholm:'0180',goteborg:'1480',malmo:'1280',uppsala:'0380',orebro:'1880',jonkoping:'0680'} as const
export function companyQueryMunicipality(query:CompanySearchQuery){
 return municipalityByCode('municipalityCode' in query?query.municipalityCode:legacyMunicipalities[query.city])
}
export function parseCompanySearchQuery(value:unknown):CompanySearchQuery{
 if(value&&typeof value==='object'&&'municipalityCode' in value){
  fields(value,['municipalityCode','category','limit'])
  const municipality=municipalityByCode(value.municipalityCode)
  if(!municipality||!('category' in value)||!isCompanyIndustry(value.category)||!('limit' in value)||value.limit!==5)throw new SalesError('INVALID_BODY')
  return {municipalityCode:municipality.code,category:value.category,limit:5}
 }
 const query=parseDiscoveryQuery(value)
 if(!isCompanyIndustry(query.category))throw new SalesError('INVALID_BODY')
 return query
}
