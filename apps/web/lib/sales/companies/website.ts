import 'server-only'
import {SalesError} from '../types'
import {UUID} from '../validate'
import {scbPreviewSearchApproved,getReadiness} from '../../handlarborsen/lead-finder/readiness'
import {fetchScbLegalEntityByOrgnr,SCB_LIVE_HOST} from '../../handlarborsen/lead-finder/scb-client'
import {evaluateScbCompany,parseLegalOrgnr,type ScbStatusResult} from '../../handlarborsen/lead-finder/scb-status-policy'
import {makeTavilyVerifiedResearchAdapter} from '../../handlarborsen/lead-finder/tavily-extract-research'
import {parseSafePublicUrl,isNonOfficialHost,type ResearchJob} from '../../handlarborsen/lead-finder/lead-research'
import type {CompanyWebsiteEvidence} from './website-types'

const plain=(v:unknown):v is string=>typeof v==='string'&&v.trim().length>=2&&v.length<=200&&!/[<>@\u0000-\u001f\u007f]/.test(v)&&!/https?:\/\//i.test(v)
export function companyWebsiteResearchConfigured(env:Record<string,string|undefined>=process.env,userId?:string):boolean{
 return env.VERCEL_ENV==='preview'&&env.COMPANY_WEBSITE_RESEARCH_ENABLED==='true'&&UUID.test(env.COMPANY_WEBSITE_RESEARCH_OWNER_ID??'')&&(userId===undefined||userId===env.COMPANY_WEBSITE_RESEARCH_OWNER_ID)&&/^[\x21-\x7e]{8,200}$/.test(env.COMPANY_WEBSITE_TAVILY_API_KEY??'')&&scbPreviewSearchApproved(env)&&getReadiness(env).liveSearchAvailable
}
export type CompanyWebsiteDeps={env?:Record<string,string|undefined>;fetchImpl?:typeof fetch;lookup?:(orgnr:string,signal:AbortSignal)=>Promise<ScbStatusResult>;now?:()=>Date}
/** Ephemeral public legal-company evidence only. Never fetches a result site, saves, or grants outreach authority. */
export async function researchCompanyWebsite(rawOrgnr:string,workplaceRef:string|null,deps:CompanyWebsiteDeps={}):Promise<CompanyWebsiteEvidence>{
 const identity=parseLegalOrgnr(rawOrgnr)
 if(!identity.ok||(workplaceRef!==null&&(typeof workplaceRef!=='string'||!/^\d{1,20}$/.test(workplaceRef))))throw new SalesError('INVALID_BODY')
 const env=deps.env??process.env
 if(!companyWebsiteResearchConfigured(env))throw new SalesError('COMPANY_WEBSITE_DISABLED',503)
 const controller=new AbortController(),fetcher=deps.fetchImpl??fetch
 const unavailable=()=>new SalesError('COMPANY_WEBSITE_SOURCE_UNAVAILABLE',503)
 let timer:ReturnType<typeof setTimeout>|undefined,providerCalls=0
 const boundedFetch:typeof fetch=async(input,init)=>{
  if(controller.signal.aborted)throw unavailable()
  const url=String(input)
  // Keys are added by the separate fixed-origin SCB/Tavily clients, never by caller URLs.
  if(url!=='https://api.tavily.com/search'&&url!=='https://api.tavily.com/extract'&&!url.startsWith('https://'+SCB_LIVE_HOST+'/v1/juridiskaenheter/'))throw unavailable()
  if(url.startsWith('https://api.tavily.com/')){providerCalls++;if(providerCalls>2)throw unavailable()}
  return fetcher(input,{...init,signal:init?.signal?AbortSignal.any([controller.signal,init.signal]):controller.signal})
 }
 const lookup=deps.lookup??(async(orgnr:string)=>evaluateScbCompany({expectedOrgnr:orgnr,je:await fetchScbLegalEntityByOrgnr({orgnr,baseUrl:'https://'+SCB_LIVE_HOST,apiKey:env.SCB_API_KEY,liveApproved:true,fetchImpl:boundedFetch})}))
 const work=async():Promise<CompanyWebsiteEvidence>=>{
  const verified=await lookup(identity.orgnr,controller.signal)
  if(controller.signal.aborted)throw unavailable()
  if(!verified.ok||verified.orgnr!==identity.orgnr||!plain(verified.legalName)||!['49','31','96'].includes(verified.legalForm.code??'')||verified.status.class!=='ACTIVE_PER_SCB')throw new SalesError('COMPANY_WEBSITE_IDENTITY_UNAVAILABLE',503)
  const legalName=verified.legalName.trim()
  const job:ResearchJob={id:'website:'+identity.orgnr,legalName,orgnr:identity.orgnr,city:'',sni:'',searchQueries:[],status:'RESEARCH_NOT_STARTED',outreachReady:false,contactability:'BLOCKED_PENDING_VERIFICATION',sourceDate:(deps.now??(()=>new Date()))().toISOString().slice(0,10)}
  let extractFailed=false
  const adapter=makeTavilyVerifiedResearchAdapter({key:env.COMPANY_WEBSITE_TAVILY_API_KEY,fetchImpl:(url,init)=>boundedFetch(url,init),now:deps.now,extractApproved:true,queryForJob:j=>`"${j.legalName}" ${j.orgnr} officiell webbplats`,onExtractFailure:()=>{extractFailed=true}})
  const raw=await adapter.collect(job,controller.signal)
  if(controller.signal.aborted||extractFailed||!Array.isArray(raw))throw unavailable()
  const linked=raw.find(o=>o&&typeof o==='object'&&o.sourceKind==='official_company_site'&&o.orgnrOnPage===identity.orgnr&&o.legalNameOnPage===legalName&&typeof o.excerpt==='string'&&o.excerpt.length<=160&&parseSafePublicUrl(o.sourceUrl)&&!isNonOfficialHost(parseSafePublicUrl(o.sourceUrl)!.host))
  const url=linked?parseSafePublicUrl(linked.sourceUrl)!.href:null
  // Explicit output allowlist excludes adapter contact suggestions and raw provider payloads.
  return {orgnr:identity.orgnr,workplaceRef,legalName,state:linked?'identity_match':'no_match',websiteUrl:url,sourceUrl:url,excerpt:linked?linked.excerpt:null,checkedAt:(deps.now??(()=>new Date()))().toISOString(),providerCalls,outreachReady:false}
 }
 try{
  const timeout=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(unavailable())},25000)})
  return await Promise.race([work(),timeout])
 }catch(e){if(e instanceof SalesError)throw e;throw unavailable()}
 finally{if(timer)clearTimeout(timer);controller.abort()}
}
