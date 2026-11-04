import {publicWebsite} from '../discovery/validate'
import {registeredAccountExclusions} from '../../handlarborsen/lead-finder/registered-accounts-snapshot'
import {normalizeCompanyName} from '../../handlarborsen/lead-finder/identity'
import type {HistoryEvent} from '../timing/types'
import type {CompanyDirectory,CompanyEvent,CompanyInput,CompanyRow} from './types'
export {filterCompanies} from './filter'

const emailKey=(s:string)=>s.trim().toLowerCase()
const latest=(values:string[])=>values.filter(v=>Number.isFinite(Date.parse(v))).sort((a,b)=>Date.parse(b)-Date.parse(a))[0]??null
const safeNote=(s:string)=>s.replace(/https?:\/\/\S+/gi,'[källänk dold]').replace(/(?:password|token|api[_-]?key|secret)\s*[:=]\s*\S+/gi,'[skyddad uppgift]').slice(0,1200)
const context=(name:string)=>{
 const n=normalizeCompanyName(name)
 if(n.includes('kareby'))return 'Överlämning 3 nov: Kareby vill återkomma när tid finns. Invänta initiativ; kontrollera den faktiska tråden.'
 if(n.includes('newman'))return 'Överlämning 3 nov: Newman avböjde uppstart. Bevara avböjandet.'
 if(n.includes('moberg'))return 'Överlämning 3 nov: Moberg avvaktar. November var en möjlighet utan bokat datum.'
 if(n.includes('evexperten')||n==='tiltiana holdings')return 'Överlämning 3 nov: semesterpaus. Registrerad pilot med tidigare gratislöfte; ingen ny kall inbjudan.'
 if(n.includes('solsta'))return 'Överlämning 3 nov: svaret 30 okt gällde annat kundärende, inte pilotintresse.'
 return null
}

/** Union all provider/event aliases before projection; a bridging alias can join earlier groups. */
export function canonicalCompanyEvents(events:HistoryEvent[]):CompanyEvent[]{
 const parents=new Map<string,string>()
 const root=(key:string):string=>{if(!parents.has(key))parents.set(key,key);const p=parents.get(key)!;if(p!==key)parents.set(key,root(p));return parents.get(key)!}
 const join=(a:string,b:string)=>{parents.set(root(b),root(a))}
 for(const e of events){
  const own='event:'+e.id;root(own);if(e.reviewedDuplicateOf)join(own,'event:'+e.reviewedDuplicateOf)
  for(const p of e.providerRefs){
   const id=p.id.trim()
   // UUIDs and RFC Message-IDs survive a second observation/folder. Numeric
   // IMAP UIDs are only meaningful inside their original source scope.
   const alias=/^[a-f\d]{8}(-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(id)?'uuid:'+id.toLowerCase():/^<[^<>\s@]+@[^<>\s@]+>$/.test(id)?'message:'+id:p.sourceKey+':'+p.id
   join(own,'provider:'+alias)
  }
 }
 const groups=new Map<string,HistoryEvent[]>()
 for(const e of events){const k=root('event:'+e.id);groups.set(k,[...(groups.get(k)??[]),e])}
 return [...groups.values()].map(group=>({id:group.map(e=>e.id).sort()[0],occurredAt:latest(group.map(e=>e.occurredAt))!,outboundAt:latest(group.filter(e=>e.direction==='outbound'&&['accepted','delivery_unknown'].includes(e.outcome)).map(e=>e.occurredAt)),inboundAt:latest(group.filter(e=>e.direction==='inbound'&&e.outcome==='received').map(e=>e.occurredAt)),outcomes:[...new Set(group.map(e=>e.outcome))],kinds:[...new Set(group.map(e=>e.kind))],outbound:group.some(e=>e.direction==='outbound'&&['accepted','delivery_unknown'].includes(e.outcome)),inbound:group.some(e=>e.direction==='inbound'&&e.outcome==='received')})).sort((a,b)=>Date.parse(b.occurredAt)-Date.parse(a.occurredAt))
}

const base=(id:string,name:string):CompanyRow=>({id,name,branch:'',city:null,orgnr:null,email:null,websiteUrl:null,sourceUrl:null,sourceLabel:'',sourceObservedAt:null,contactId:null,blocked:false,searchArea:null,status:'unknown',badges:[],matches:[],gaps:['Historiken är ofullständig; utebliven träff ger ingen kontaktbehörighet.'],events:[],lastOutboundAt:null,lastInboundAt:null,earliestReviewAt:null,reviewNote:null,offerLabel:null,dialogContext:context(name)})
export function buildCompanyDirectory(input:CompanyInput):CompanyDirectory{
 const contacts=input.contacts.status==='ready'?input.contacts.contacts:[]
 const emailCounts=new Map<string,number>();for(const c of contacts)emailCounts.set(emailKey(c.email),(emailCounts.get(emailKey(c.email))??0)+1)
 const rows:CompanyRow[]=contacts.map(c=>{
  const r=base('contact:'+c.id,c.companyName);Object.assign(r,{branch:c.branchName,email:c.email,websiteUrl:publicWebsite(c.websiteUrl),contactId:c.id,sourceLabel:'Omnira kontaktjournal',sourceObservedAt:input.evaluatedAt,offerLabel:c.offerKind==='general_service'?'Tjänsteärende':`${c.pilotMonths} månaders pilot (registrerat erbjudande)`})
  if(c.history==='contacted')r.status='contacted'
  r.blocked=c.suppressed||c.excluded
  if(c.suppressed)r.badges.push('Kontaktspärr');if(c.excluded)r.badges.push('Exkluderad');if(!c.confirmed)r.badges.push('Bolag/adress behöver verifieras');if((emailCounts.get(emailKey(c.email))??0)>1)r.badges.push('Delad mejladress – granska identitet')
  const t=input.timing?.contacts.find(t=>t.contactId===c.id&&t.contactVersion===c.version&&emailKey(t.recipient)===emailKey(c.email))
  if(t?.blockers.some(b=>['RECIPIENT_STOPPED','CONTACT_SUPPRESSED','CONTACT_EXCLUDED'].includes(b))){r.blocked=true;r.badges.push('Mottagarspärr i aktuell historik')}
  const h=t?input.timing?.historyRevisions.find(h=>h.id===t.historyRevisionId&&h.projectId===input.projectId&&emailKey(h.recipient)===emailKey(c.email)&&h.data.contactVersions.some(v=>v.id===c.id&&v.version===c.version)):undefined
  if(!t||!h){r.gaps.push('Aktuell historikrevision saknas eller matchar inte kontaktversionen.');return r}
  r.events=canonicalCompanyEvents(h.data.events);r.lastOutboundAt=latest(r.events.flatMap(e=>e.outboundAt?[e.outboundAt]:[]));r.lastInboundAt=latest(r.events.flatMap(e=>e.inboundAt?[e.inboundAt]:[]));r.reviewNote=safeNote(h.data.reviewNote);r.earliestReviewAt=t.intervalFloorAt
  r.status=c.history==='contacted'||r.lastOutboundAt!==null||r.lastInboundAt!==null?'contacted':'unknown'
  for(const s of h.data.sources){
   const stale=Date.parse(input.evaluatedAt)-Date.parse(s.observedAt)>(input.timing?.rules?.maxSourceAgeSeconds??900)*1000
   if(s.state!=='complete'||stale)r.gaps.push(`${s.channel}: ${s.state==='failed'?'källa otillgänglig':s.state==='gap'?'historiklucka':'äldre kontroll'}; kontrollerad ${s.observedAt}.`)
  }
  const freshComplete=h.data.sources.length>0&&h.data.sources.every(s=>s.state==='complete'&&Number.isFinite(Date.parse(s.observedAt))&&Date.parse(input.evaluatedAt)-Date.parse(s.observedAt)>=0&&Date.parse(input.evaluatedAt)-Date.parse(s.observedAt)<=(input.timing?.rules?.maxSourceAgeSeconds??900)*1000)
  const requiredChannels=['strato_sent','strato_inbox','resend'].every(channel=>h.data.sources.some(s=>s.channel===channel))
  if(c.history!=='contacted'&&h.data.history==='owner_confirmed_none'&&h.data.olderHistoryAttestation?.trim()&&h.data.events.length===0&&freshComplete&&requiredChannels&&t.blockers.length===0){r.status='no_match';r.gaps=[]}
  if(r.events.some(e=>e.outcomes.includes('bounced')||e.outcomes.includes('unsubscribed')))r.blocked=true
  if(r.lastInboundAt)r.badges.push('Mottaget brev – behöver granskas')
  if(r.events.some(e=>e.outcomes.includes('unsubscribed')))r.badges.push('Avregistrering observerad')
  if(r.events.some(e=>e.outcomes.includes('bounced')))r.badges.push('Studs observerad – granska orsak')
  return r
 })
 const attachHints=(r:CompanyRow)=>{
  if(r.email&&contacts.some(c=>emailKey(c.email)===emailKey(r.email!)))r.matches.push('Samma mejladress i kontaktjournalen')
  if(r.email&&rows.some(c=>c.contactId&&c.email&&emailKey(c.email)===emailKey(r.email!)&&c.blocked)){r.blocked=true;r.badges.push('Mottagarspärr för samma mejladress')}
  if(contacts.some(c=>normalizeCompanyName(c.companyName)===normalizeCompanyName(r.name)))r.matches.push('Möjlig namnträff – verifiera bolag och filial')
  if(r.matches.length)r.badges.push('Möjlig tidigare kontakt')
  return r
 }
 if(input.archive.status==='ready')for(const a of input.archive.report.result){
  const r=base('archive:'+a.orgnr,a.name);Object.assign(r,{city:a.city,orgnr:a.orgnr,websiteUrl:publicWebsite(a.ownDomain),sourceUrl:publicWebsite(a.source),sourceLabel:'SCB / sparad webbresearch',sourceObservedAt:input.archive.createdAt});r.badges.push('Webbplats/verksamhet ej slutverifierad');if(a.registeredAccount==='matched_registered_account')r.badges.push('Registrerad i daterad ögonblicksbild');if(a.crmReasons.length)r.badges.push('Historisk spärrindikation – granska källan');r.blocked=a.crmReasons.some(reason=>['suppressed','excluded','declined','existing_account'].includes(reason))||a.registeredAccount==='matched_registered_account';rows.push(attachHints(r))
 }
 if(input.saved.status==='ready')for(const a of input.saved.candidates){
  const r=base('scb:'+a.id,a.name);Object.assign(r,{city:a.city,orgnr:a.orgnr,sourceLabel:'SCB / sparad kandidat',sourceObservedAt:a.retrievedAt});if(a.restricted||a.status==='suppressed'){r.badges.push('Kontaktspärr');r.blocked=true;}if(a.priorContact)r.badges.push('Tidigare kontakt i SCB-underlaget');rows.push(attachHints(r))
 }
 if(input.publicResults)for(const p of input.publicResults.candidates){
  const scb=input.publicResults.source==='scb'
  const r=base('public:'+p.sourceId,p.name)
  Object.assign(r,{searchArea:scb?input.publicResults.meta?.areaLabel??input.publicResults.city:input.publicResults.city+(input.publicResults.radiusKm?' · radie '+input.publicResults.radiusKm+' km':''),email:p.email,websiteUrl:publicWebsite(p.websiteUrl),sourceUrl:publicWebsite(p.sourceUrl),sourceLabel:scb?'SCB:s företagsregister / aktuell sökning':'Publik kartkälla / ej verifierad',sourceObservedAt:input.publicResults.retrievedAt})
  if(scb){
   Object.assign(r,{city:p.city??null,orgnr:p.orgnr??null,branch:p.branchName??'',workplaceRef:p.cfar??null})
   r.badges.push('Registrerad bilhandel – verksamhet behöver granskas')
   if(p.restricted){r.blocked=true;r.badges.push('Kontaktspärr i SCB')}
   if(p.inactive){r.blocked=true;r.badges.push('Ej verksam enligt SCB')}
   if(p.orgnr&&registeredAccountExclusions().some(e=>e.orgnr===p.orgnr)){r.blocked=true;r.badges.push('Registrerad i daterad ögonblicksbild')}
   const savedMatch=p.orgnr&&input.saved.status==='ready'?input.saved.candidates.filter(c=>c.orgnr===p.orgnr):[]
   const archiveMatch=p.orgnr&&input.archive.status==='ready'?input.archive.report.result.filter(c=>c.orgnr===p.orgnr):[]
   if(savedMatch.length||archiveMatch.length)r.matches.push('Samma organisationsnummer i sparat underlag')
   if(savedMatch.some(c=>c.restricted||c.status==='suppressed')||archiveMatch.some(c=>c.registeredAccount==='matched_registered_account'||c.crmReasons.some(reason=>['suppressed','excluded','declined','existing_account'].includes(reason)))){r.blocked=true;r.badges.push('Spärr / exkludering i sparat bolagsunderlag')}
  }else r.badges.push('Bolag, filial och kontaktväg ej verifierade')
  rows.push(attachHints(r))
 }
 return {projectId:input.projectId,evaluatedAt:input.evaluatedAt,rows,uniqueRecipients:input.contacts.status==='ready'?emailCounts.size:null,readOnly:true,sourceConfigured:input.sourceConfigured,searchProvider:input.searchProvider??null,...(input.publicResults?.meta?{searchMeta:input.publicResults.meta}:{}),sources:[
  {key:'contacts',label:'Omnira kontakter',state:input.contacts.status,observedAt:input.contacts.status==='ready'?input.evaluatedAt:null,note:'Kontaktposter; inte bevis för komplett mejlhistorik.'},
  {key:'timing',label:'Granskad mejlhistorik',state:input.timing?'ready':'unavailable',observedAt:input.timing?.evaluatedAt??null,note:'Senast sparade revisioner. Ingen livekontroll av Strato eller Resend i denna vy.'},
  {key:'archive',label:'Sparad research',state:input.archive.status,observedAt:input.archive.status==='ready'?input.archive.createdAt:null,note:'Ofullständigt historiskt underlag; ingen ny webbresearch.'},
  {key:'scb',label:'Sparade SCB-kandidater',state:input.saved.status==='forbidden'?'unavailable':input.saved.status,observedAt:null,note:'Befintlig begränsad kandidatvy; inte hela SCB-registret.'},
  {key:'registration',label:'Registrerade handlare',state:'incomplete',observedAt:'2026-10-29',note:'Daterad ögonblicksbild, ingen livekoppling. Kontroll krävs före kontakt.'},
 ]}
}
