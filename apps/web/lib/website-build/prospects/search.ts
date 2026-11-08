// Bounded SCB search extracted from PR #386, commit 7eedb7ffbea85d25459629639144b9efab5ff7d3. No sales writers or outreach.
import 'server-only'
import {WebsiteBuildError as SalesError} from '../store'
import {COMPANY_INDUSTRIES} from './industries'
import {parseCompanySearchQuery,companyQueryMunicipality,type CompanySearchQuery} from './query'
import {getReadiness,scbPreviewSearchApproved} from '../../handlarborsen/lead-finder/readiness'
import {assertScbLiveBaseUrl,createScbWorkplaceMunicipalityFetcher,fetchScbLegalEntityByOrgnr,SCB_LIVE_HOST} from '../../handlarborsen/lead-finder/scb-client'
import {paginateScb} from '../../handlarborsen/lead-finder/scb-source'
import {evaluateScbCompany,parseLegalOrgnr,type ScbStatusResult} from '../../handlarborsen/lead-finder/scb-status-policy'
import type {ScbRegisterRecord} from '../../handlarborsen/lead-finder/types'
import type {CompanySearchProvider,CompanySearchResult,CompanyPublicBusiness,CompanySearchDiagnostics} from './search-types'

export const SCB_COMPANY_PAGE_SIZE=5
const SCB_SOURCE_URL='https://www.scb.se/vara-tjanster/bestall-data-och-statistik/foretagsregistret/'
const plain=(v:unknown,max=200):v is string=>typeof v==='string'&&v.trim().length>0&&v.length<=max&&!/[\u0000-\u001f\u007f<>@]/.test(v)
const sleep=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms))

/** Configuration metadata only; no source call, value disclosure or activation. */
export function companySearchProvider(env:Record<string,string|undefined>=process.env):CompanySearchProvider{
 if(scbPreviewSearchApproved(env)&&getReadiness(env).liveSearchAvailable)return 'scb'
 return null
}
export type ScbCompanySearchDeps={env?:Record<string,string|undefined>;search?:()=>Promise<{rows:ScbRegisterRecord[];pages:number;truncated:boolean}>;review?:(orgnr:string)=>Promise<ScbStatusResult>;sleep?:(ms:number)=>Promise<void>;now?:()=>Date}

/** Ephemeral search only. No candidate/contact writer, queue or job is used. */
export async function searchScbCompanies(value:CompanySearchQuery,offset=0,deps:ScbCompanySearchDeps={}):Promise<CompanySearchResult>{
 const query=parseCompanySearchQuery(value),municipality=companyQueryMunicipality(query),env=deps.env??process.env
 if(!municipality||!Number.isInteger(offset)||offset<0||offset>995||offset%SCB_COMPANY_PAGE_SIZE!==0)throw new SalesError('INVALID_BODY')
 if(!scbPreviewSearchApproved(env)||!getReadiness(env).liveSearchAvailable)throw new SalesError('DISCOVERY_SOURCE_NOT_CONFIGURED',503)
 const industry=COMPANY_INDUSTRIES[query.category as keyof typeof COMPANY_INDUSTRIES],sniCodes:readonly string[]=industry.sniCodes
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),35000)
 const baseUrl=`https://${SCB_LIVE_HOST}`
 // A wrapped fetch preserves both the existing per-request timeout and the
 // whole-search budget. The fixed credential destination is asserted here.
 assertScbLiveBaseUrl(baseUrl)
 const boundedFetch:typeof fetch=(url,init)=>fetch(url,{...init,signal:init?.signal?AbortSignal.any([controller.signal,init.signal]):controller.signal})
 const search=deps.search??(()=>paginateScb(createScbWorkplaceMunicipalityFetcher({municipalityCode:municipality.code,baseUrl,apiKey:env.SCB_API_KEY,liveApproved:true,fetchImpl:boundedFetch}),{pageSize:5000,maxPages:2,maxRows:10000,maxRetries:0,requestsPerSecond:2}))
 const review=deps.review??(async(orgnr:string)=>evaluateScbCompany({expectedOrgnr:orgnr,je:await fetchScbLegalEntityByOrgnr({orgnr,baseUrl,apiKey:env.SCB_API_KEY,liveApproved:true,fetchImpl:boundedFetch})}))
 try{
  const result=await search()
  if(controller.signal.aborted)throw new Error('deadline')
  const unique=new Map<string,ScbRegisterRecord>(),ambiguous=new Set<string>()
  const diagnostics:CompanySearchDiagnostics={municipalityRows:0,industryRows:0,identityExcludedRows:0,missingCfarRows:0,duplicateRows:0,conflictingWorkplaces:0,unnamedWorkplaces:0,eligibleWorkplaces:0,reviewedInPage:0,legalReviewSkipped:0,returnedInPage:0}
  for(const row of result.rows){
   if(row.municipalityCode!==municipality.code)continue
   diagnostics.municipalityRows++
   if(!row.sniCodes.some(code=>sniCodes.includes(code)))continue
   diagnostics.industryRows++
   const identity=parseLegalOrgnr(row.orgnr)
   if(!identity.ok){diagnostics.identityExcludedRows++;continue}
   if(!row.cfar||!/^\d{1,20}$/.test(row.cfar)){diagnostics.missingCfarRows++;continue}
   const old=unique.get(row.cfar)
   if(old){
    if(old.orgnr!==identity.orgnr)ambiguous.add(row.cfar)
    else diagnostics.duplicateRows++
   }else unique.set(row.cfar,{...row,orgnr:identity.orgnr})
  }
  const matches=[...unique.values()].filter(r=>!ambiguous.has(r.cfar!)).sort((a,b)=>a.cfar!.localeCompare(b.cfar!))
  diagnostics.conflictingWorkplaces=ambiguous.size
  diagnostics.unnamedWorkplaces=matches.filter(row=>!plain(row.name)).length
  diagnostics.eligibleWorkplaces=matches.length
  const page=matches.slice(offset,offset+SCB_COMPANY_PAGE_SIZE),cache=new Map<string,ScbStatusResult>(),candidates:CompanyPublicBusiness[]=[]
  diagnostics.reviewedInPage=page.length
  for(const row of page){
   if(controller.signal.aborted)throw new Error('deadline')
   let verified=cache.get(row.orgnr)
   if(!verified){await(deps.sleep??sleep)(500);if(controller.signal.aborted)throw new Error('deadline');verified=await review(row.orgnr);cache.set(row.orgnr,verified)}
   if(!verified.ok||verified.orgnr!==row.orgnr||!plain(verified.legalName)||!['49','31','96'].includes(verified.legalForm.code??''))continue
   const restricted=verified.marketing.post.code===2||verified.marketing.email.code===2||verified.marketing.phone.code===2||verified.marketing.phone.code===3
   candidates.push({sourceId:`scb/${row.cfar}`,sourceUrl:SCB_SOURCE_URL,name:verified.legalName.trim(),branchName:plain(row.name)?row.name.trim():'',orgnr:verified.orgnr,cfar:row.cfar!,city:plain(row.city,120)?row.city.trim():null,email:null,websiteUrl:null,restricted,sniCodes:row.sniCodes.filter(code=>sniCodes.includes(code)),inactive:verified.status.class!=='ACTIVE_PER_SCB'})
  }
  if(controller.signal.aborted)throw new Error('deadline')
  diagnostics.returnedInPage=candidates.length
  diagnostics.legalReviewSkipped=page.length-candidates.length
  return {source:'scb',candidates,retrievedAt:(deps.now??(()=>new Date()))().toISOString(),meta:{provider:'scb',sourceScope:'municipality',municipalityCode:municipality.code,category:query.category as keyof typeof COMPANY_INDUSTRIES,industryLabel:industry.label,...(sniCodes.length===1?{sniCode:sniCodes[0]}:{}),sniCodes:[...sniCodes],areaLabel:`${municipality.name} kommun`,offset,pageSize:SCB_COMPANY_PAGE_SIZE,nextOffset:offset+SCB_COMPANY_PAGE_SIZE<matches.length&&offset<995?offset+SCB_COMPANY_PAGE_SIZE:null,matchedWorkplaces:matches.length,scannedRows:result.rows.length,pages:result.pages,truncated:result.truncated||matches.length>1000,skippedInPage:page.length-candidates.length,diagnostics}}
 }catch(e){if(e instanceof SalesError)throw e;throw new SalesError('DISCOVERY_PROVIDER_UNAVAILABLE',503)}
 finally{clearTimeout(timer);controller.abort()}
}
