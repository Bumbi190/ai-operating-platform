import 'server-only'
import type { ResearchJob } from './lead-research'
import { parseSafePublicUrl } from './lead-research'
import type { SearchAdapter } from './lead-research-worker'
import { makeTavilyResearchAdapter, type TavilyAdapterOptions } from './tavily-research-adapter'
import { EXPLICIT_FINANCIAL_ACTIVITY, REGISTRATION_ONLY_VEHICLE_TRADE } from './business-signal-rules'

/**
 * EXTRA / BILLABLE preview-only research stage.
 *
 * The first call is the existing Tavily BASIC search. At most ONE candidate
 * company page from that result is then passed to Tavily BASIC Extract.
 * HTTP is always sent to the two FIXED Tavily hosts, never directly to a
 * result website. No default activation, no retries, persistence or outreach.
 *
 * This is NOT a legal proof of site ownership or contact permission: the
 * user must still check the linked page and entity, and all results remain
 * BLOCKED_PENDING_VERIFICATION.
 */
export const TAVILY_EXTRACT_URL = 'https://api.tavily.com/extract'
export const MAX_EXTRACTS_PER_BATCH = 5
export const MAX_EXTRACT_RESPONSE_BYTES = 150_000
export const MAX_EXTRACT_TEXT_CHARS = 65_000
export const EXTRACT_TIMEOUT_SECONDS = 6

const DENIED_SITES = [
  'allabolag.se','merinfo.se','proff.se','hitta.se','eniro.se','ratsit.se',
  'upplysning.se','car.info','biluppgifter.se','bilweb.se','bytbil.com',
  'blocket.se','wayke.se','kvd.se','facebook.com','instagram.com','linkedin.com',
  'youtube.com','google.com','tiktok.com','twitter.com','x.com','reddit.com',
  'wikipedia.org','trustpilot.com','reco.se','bokadirekt.se',
]
const suffixOf=(host:string,domain:string)=>host===domain||host.endsWith('.'+domain)
const bare=(host:string)=>host.replace(/^www\./,'')
const normalize=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLowerCase().replace(/[^a-z0-9]+/g,' ').replace(/\s+/g,' ').trim()
const normalizeCompact=(s:string)=>normalize(s).replace(/\s+/g,'')
const LEGAL_STOP=new Set(['aktiebolaget','aktiebolag','ab','filial','handelsbolag','kommanditbolag','sverige','svenska','och','the','inc','usa'])

const isPlausibleOwnHost=(host:string,company:string):boolean=>{
  if(DENIED_SITES.some(domain=>suffixOf(host,domain)))return false
  const domainPart=bare(host).split('.')[0]
  // A domain name can only be evidence when it resembles a distinctive
  // part of this company's legal name. Name resemblance is not identity!
  const tokens=normalize(company).split(' ').filter(x=>x.length>=4&&!LEGAL_STOP.has(x))
  return tokens.some(token=>normalizeCompact(domainPart).includes(token))
}
const own=(v:unknown):v is Record<string,unknown>=>v!==null&&typeof v==='object'&&!Array.isArray(v)
const legalIdOnPage=(text:string,orgnr:string):boolean=>{
  const escaped=orgnr.slice(0,6)+'[-\\s]?'+orgnr.slice(6)
  const regex=new RegExp('(?:org(?:anisations)?\\.?\\s*nr\\.?|organisationsnummer|orgnr)\\s*[:#-]?\\s*(?:16)?'+escaped+'(?!\\d)','i')
  return regex.test(text)
}
const fullNameOnPage=(text:string,legalName:string):boolean=>{
  const hay=' '+normalize(text.slice(0,MAX_EXTRACT_TEXT_CHARS))+' '
  const needle=normalize(legalName)
  return needle.length>=5&&hay.includes(' '+needle+' ')
}
const cleaned=(text:string):string=>text
  .replace(/<[^>]{0,350}>/g,' ')
  .replace(/(?:https?:\/\/|www\.)\S+/gi,' ')
  .replace(/\b\S+@\S+\b/g,' ')
  .replace(/(?:\+|00)?\d(?:[\s().-]?\d){6,}/g,' ')
  .replace(/[\u0000-\u001f\u007f<>@]/g,' ')
  .replace(/\s+/g,' ').trim()

const SALE=/\b(?:(?:vi\s+)?säljer\s+(?:alla\s+typer\s+av\s+)?(?:nya\s+|begagnade\s+)?(?:bilar|personbilar)|(?:bilar|personbilar) till salu|(?:bedriver|erbjuder|arbetar med) bilförsäljning|vårt billager|bilar i lager|aktuella lagerbilar|vårt bilutbud)\b/i
const STOCK=/\b(?:vårt billager|bilar i lager|aktuella lagerbilar)\b/i
const NEGATED=/(?:\b0\b|\binga\b|\bingen\b|\bnoll\b)\s+(?:aktuella\s+)?(?:bilannonser|bilar|lagerbilar|fordon)/i
const OTHER=[
  ['wheelchairs_or_mobility_aids',/\b(?:rullstolar|rullstol|eldrivna rullstolar|hjälpmedel)\b/i],
  ['financial_or_collection_services',EXPLICIT_FINANCIAL_ACTIVITY],
  ['auto_repairs_only',/\b(?:bilverkstad|bilreparation|fordonsservice)\b/i],
] as const

function indicatorsFor(text:string):{indicators:string[];at:number}{
  const result:string[]=[]
  const sale=SALE.exec(text)
  if(sale&&!NEGATED.test(text.slice(Math.max(0,sale.index-65),sale.index+sale[0].length+30)))result.push('cars_for_sale')
  const stock=STOCK.exec(text)
  if(stock&&!NEGATED.test(text.slice(Math.max(0,stock.index-65),stock.index+stock[0].length+30)))result.push('vehicle_stock_listings')
  if(result.length) return {indicators:result,at:(sale?.index??stock?.index??0)}
  const registration=REGISTRATION_ONLY_VEHICLE_TRADE.exec(text)
  if(registration)return {indicators:['registered_vehicle_trade'],at:registration.index}
  for(const [type,re] of OTHER){
    const match=re.exec(text)
    if(match)return {indicators:[type],at:match.index}
  }
  return {indicators:[],at:0}
}

function excerptOf(text:string,position:number):string|null{
  const start=Math.max(0,position-35)
  const short=cleaned(text.slice(start,Math.min(text.length,start+220))).slice(0,160).trim()
  return short.length>=10&&!/[\d]{10}|@|https?:\/\//.test(short)?short:null
}

/** General mailboxes only; does not extract or save employee names or mobiles. */
function generalContact(text:string,site:string,url:string):Record<string,unknown>{
  const c:Record<string,unknown>={}
  const domain=bare(site)
  const mail=/(?:\b(info|kontakt|contact|kundservice|sales|foretag|service|order|support)@([a-z0-9-]+(?:\.[a-z0-9-]+)+))\b/i.exec(text)
  if(mail){
    const emailDomain=mail[2].toLowerCase()
    if(emailDomain===domain||suffixOf(domain,emailDomain)){
      c.generalBusinessEmail=mail[0].toLowerCase()
      c.emailSourceUrl=url
    }
  }
  // Only an explicitly labelled corporate switchboard, never an arbitrary
  // "kontakt" number that might be a personal mobile line.
  const phone=/(?:\bväxel\b|\bswitchboard\b)\s*[:\s]+(0\d[\d\s()-]{5,17})/i.exec(text)
  if(phone){
    const digits=phone[1].replace(/\D/g,'')
    if(!/^0?7/.test(digits)&&digits.length>=8&&digits.length<=12){
      c.switchboardPhone=phone[1].trim()
      c.phoneLabel='company switchboard'
      c.phoneSourceUrl=url
    }
  }
  return c
}

async function boundedResponse(response:Response):Promise<string>{
  const declared=response.headers.get('content-length')
  if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>MAX_EXTRACT_RESPONSE_BYTES))throw Error('extract_size')
  if(!response.body)throw Error('extract_body')
  const reader=response.body.getReader(),parts:Uint8Array[]=[]
  let size=0
  try{
    for(;;){
      const {done,value}=await reader.read()
      if(done)break
      size+=value.byteLength
      if(size>MAX_EXTRACT_RESPONSE_BYTES){
        await reader.cancel().catch(()=>undefined)
        throw Error('extract_size')
      }
      parts.push(value)
    }
  }finally{reader.releaseLock()}
  const buffer=new Uint8Array(size)
  let at=0
  for(const part of parts){buffer.set(part,at);at+=part.length}
  return new TextDecoder('utf-8',{fatal:true}).decode(buffer)
}

function officialObservation(page:unknown,selected:string,job:ResearchJob,now:Date):Record<string,unknown>|null{
  if(!own(page))return null
  const responseUrl=parseSafePublicUrl(page.url)
  const proposed=parseSafePublicUrl(selected)
  if(!responseUrl||!proposed||responseUrl.href!==proposed.href)return null
  if(!isPlausibleOwnHost(responseUrl.host,job.legalName))return null
  if(typeof page.raw_content!=='string'||page.raw_content.length>MAX_EXTRACT_TEXT_CHARS)return null
  const raw=page.raw_content
  if(!legalIdOnPage(raw,job.orgnr)||!fullNameOnPage(raw,job.legalName))return null
  const {indicators,at}=indicatorsFor(raw)
  const excerpt=excerptOf(raw,at)
  if(!excerpt)return null
  return {
    sourceUrl:responseUrl.href,sourceKind:'official_company_site',
    observedOn:now.toISOString().slice(0,10),
    orgnrOnPage:job.orgnr,legalNameOnPage:job.legalName,
    observedBusinessIndicators:indicators,
    excerpt,
    ...generalContact(raw,responseUrl.host,responseUrl.href),
  }
}

export interface TavilyVerifiedAdapterOptions extends TavilyAdapterOptions {
  /** Must only be created when a distinct, explicit preview feature flag is enabled. */
  extractApproved:true
}

export function makeTavilyVerifiedResearchAdapter(options:TavilyVerifiedAdapterOptions):SearchAdapter{
  if(options.extractApproved!==true)throw Error('extract_not_approved')
  // The first adapter retains the existing 5 basic-search credit hard cap.
  const search=makeTavilyResearchAdapter(options)
  const extractSeen=new Set<string>()
  return {
    name:'tavily-basic-search-with-explicit-extract',
    async collect(job:ResearchJob,signal:AbortSignal):Promise<unknown>{
      const snippets=await search.collect(job,signal)
      if(!Array.isArray(snippets))return []
      const result=[...snippets]
      const candidate=snippets.map(x=>own(x)?x.sourceUrl:null)
        .map(parseSafePublicUrl)
        .find(x=>x&&isPlausibleOwnHost(x.host,job.legalName))
      if(!candidate||extractSeen.has(job.id)||extractSeen.size>=MAX_EXTRACTS_PER_BATCH)return result
      extractSeen.add(job.id)
      // No request is sent to the source site. Tavily fetches exactly one
      // allowlisted public company-candidate URL and returns extracted text.
      let response:Response
      try{
        response=await options.fetchImpl(TAVILY_EXTRACT_URL,{
          method:'POST',redirect:'error',cache:'no-store',signal,
          headers:{
            authorization:'Bearer '+options.key?.trim(),
            'content-type':'application/json',
          },
          body:JSON.stringify({
            urls:candidate.href,
            extract_depth:'basic',include_images:false,format:'text',
            timeout:EXTRACT_TIMEOUT_SECONDS,include_usage:false,
          }),
        })
      }catch{
        // A failed optional extraction MUST NOT erase already accepted
        // search snippets or leak private provider error details.
        return result
      }
      if(!response.ok)return result
      let extracted:unknown
      try{extracted=JSON.parse(await boundedResponse(response))}catch{return result}
      if(!own(extracted)||!Array.isArray(extracted.results))return result
      for(const page of extracted.results.slice(0,1)){
        const obs=officialObservation(page,candidate.href,job,options.now?.()??new Date())
        if(obs){result.push(obs);break}
      }
      return result
    },
  }
}
