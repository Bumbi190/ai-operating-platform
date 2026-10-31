import 'server-only'
import type {SalesDb} from '../store'
import {scoped} from '../store'
import type {SalesPrincipal,SalesWorkspace} from '../types'
import {UUID} from '../validate'
import {salesEnabled} from '../feature'
import {handleSalesTool} from '../atlas-tools'
import {readMailboxReference} from '../mailbox/store'
import type {InboxMessage,InboxPage} from './types'
import {currentTimeFor,ATLAS_HOME_TIMEZONE} from '@/lib/atlas/utilities/time'

export type InboxReportKind='overview'|'count'
type Evidence={tool:string;input:Record<string,unknown>;result:unknown}
type Report={text:string;evidence:Evidence[]}
const domain=/(?:inkorg|incoming replies|pageSummary\.linkedContactCount)/iu
const question=/(?:läs|sammanfatta|översikt|vilka|senaste|kontrollera|visa|read|summary|hur många|antal)/iu
// Deliberately narrow: this renderer must never swallow a request for a write.
export function classifyInboxReportRequest(text:string,priorUserText:string[]):InboxReportKind|null{
 const t=text.normalize('NFC')
 const readOnly=t.replace(/(?:visa\s+)?(?:var|hur) jag kan (?:granska och )?redigera(?: ett)? svarsförslag/giu,'').replace(/(?:skicka|sänd|ändra|skapa|godkänn|schemalägg|förbered)\s+(?:inget|ingenting|inga|inte)\b/giu,'')
 if(/(?<![\p{L}\p{N}_])(?:skicka|sänd|sända|send|skapa|förbered|förbereda|prepare|godkänn|godkänna|approve|schemalägg|schemalägga|schedule|radera|ändra|redigera|avbryt|avbryta|cancel|pausa|återuppta|starta|koppla|aktivera)(?![\p{L}\p{N}_])/iu.test(readOnly))return null
 const count=/(?:antal|hur många|linkedContactCount)/iu.test(t)
 if(count&&/linkedContactCount/iu.test(t))return 'count'
 if(domain.test(t)&&question.test(t))return count?'count':'overview'
 if(count&&/(?:svarat|svarande|kopplade|första mening|antalet)/iu.test(t)&&priorUserText.slice(-3).some(s=>domain.test(s)&&question.test(s)))return 'count'
 return null
}
function time(value:string|null|undefined):string{
 if(!value||!/(?:Z|[+-]\d\d:\d\d)$/i.test(value))return 'Tid saknas eller är ogiltig'
 const date=new Date(value)
 if(!Number.isFinite(date.getTime()))return 'Tid saknas eller är ogiltig'
 const result=currentTimeFor({timezone:ATLAS_HOME_TIMEZONE},date)
 if(result.status!=='ok')return 'Tid saknas eller är ogiltig'
 const z=result.zones[0]
 return z.date+' '+z.time+' '+z.timeZone+' (UTC'+z.utcOffset+')'
}
function plain(value:string):string{return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g,'').replace(/[\\\x60*_{}\[\]()<>#|~]/g,'\\$&')}
function quote(value:string,max=600):string{
 const text=value.length>max?value.slice(0,max)+'… [utdrag]':value
 return plain(text).split(/\r?\n/).map(l=>'> '+l).join('\n')
}
function unavailable(evidence:Evidence[]=[]):Report{return {text:'Inkorgens uppgifter kunde inte verifieras. Jag anger därför inget antal eller några källtider. Öppna projektets säljvy och kontrollera anslutning och underlag innan du fortsätter.',evidence}}

/** Owner-scoped read report. Never reconstructs facts from assistant prose or client tool payloads. */
export async function buildInboxReport(db:SalesDb,p:SalesPrincipal,conversationId:string|null,kind:InboxReportKind,now:Date,enabled=salesEnabled):Promise<Report>{
 const evidence:Evidence[]=[]
 try{
  if(!conversationId||!UUID.test(conversationId))return unavailable()
  const {data:conversation,error}=await db.from('conversations').select('id, project_id').eq('id',conversationId).eq('user_id',p.userId).maybeSingle()
  if(error||!conversation?.project_id||!UUID.test(conversation.project_id))return unavailable()
  const projectId=conversation.project_id
  scoped(p,projectId)
  if(!enabled(projectId))return unavailable()
  async function read(tool:string,input:Record<string,unknown>):Promise<any>{
   const result=await handleSalesTool(tool,input,p,conversationId,db,enabled)
   if(!result||typeof result!=='object'||'error' in result)throw Error('REPORT_READ_UNAVAILABLE')
   evidence.push({tool,input,result});return result
  }
  const workspace:SalesWorkspace&{contactSummary:{suppressedCount:number}}=await read('get_sales_workspace',{projectId})
  if(workspace.projectId!==projectId||!Array.isArray(workspace.offers)||!Array.isArray(workspace.workers))throw Error('REPORT_WORKSPACE_UNAVAILABLE')
  const mailboxes=new Set<string>()
  for(const worker of workspace.workers.filter(w=>!w.revoked)){
   const ref=await readMailboxReference(db,p,projectId,worker.id)
   if(ref)mailboxes.add(ref.mailboxId)
  }
  if(mailboxes.size!==1)throw Error('REPORT_MAILBOX_AMBIGUOUS')
  const mailboxId=[...mailboxes][0]
  const inbox:InboxPage&{pageSummary:{linkedContactCount:number;linkedMessageCount:number;linkedContactIds:string[];messageCount:number;hasMore:boolean}}=await read('get_sales_inbox',{projectId,mailboxId})
  const summary=inbox.pageSummary
  const lines=[
   'I den hämtade inkorgssidan finns **'+summary.linkedMessageCount+' kopplade mejl från '+summary.linkedContactCount+' kontaktposter**.',
   'Detta är bekräftade kontaktkopplingar, inte bekräftat deltagande i piloten. Sidan innehåller '+summary.messageCount+' mejl totalt; privata eller andra okopplade mejl räknas inte som svarande pilotkontakter.',
   'Antalet gäller bara den hämtade sidan i sparad inkorg, inte ett totalantal för hela postlådan. '+(summary.hasMore?'Fler sidor finns.':'Inga fler sidor rapporterades i den här läsningen.'),
   'Källa: sparad inkorg. Avstämt '+time(now.toISOString())+'.',
   inbox.config?'Läsomfattning: '+plain(inbox.config.folder)+' från '+time(inbox.config.since)+'. Senast synkroniserad '+time(inbox.config.lastSyncedAt)+'.':'Läsomfattningen kunde inte verifieras.'
  ]
  if(!inbox.readingEnabled)lines.push('Aktiv inkorgsinläsning är inte verifierad. Detta är tidigare sparat underlag.')
  for(const contactId of summary.linkedContactIds){
   const contact=workspace.contacts.find(c=>c.id===contactId)
   if(!contact||contact.projectId!==projectId)throw Error('REPORT_CONTACT_UNAVAILABLE')
   const messages=inbox.messages.filter(m=>m.contactState==='linked'&&m.contactId===contactId)
   const datesKnown=messages.every(m=>m.internalDate&&Number.isFinite(Date.parse(m.internalDate)))
   const latest=datesKnown?[...messages].sort((a,b)=>Date.parse(b.internalDate!)-Date.parse(a.internalDate!))[0]:messages.find(m=>!m.internalDate||!Number.isFinite(Date.parse(m.internalDate)))??messages[0]
   if(!latest)throw Error('REPORT_MESSAGE_UNAVAILABLE')
   lines.push('**'+plain(contact.companyName+(contact.branchName?' · '+contact.branchName:''))+'**')
   lines.push((datesKnown?'Senaste kopplade mejl på den här sidan: ':'Ett kopplat mejl; senaste tid kan inte fastställas: ')+time(latest.internalDate)+'.')
   if(kind==='overview'){
    if(latest.textSelected&&latest.textState==='complete'){
     const result=await read('get_sales_inbox_message',{projectId,messageId:latest.id})
     const message=result.message as InboxMessage
     if(message.id!==latest.id||message.mailboxId!==mailboxId||message.version!==latest.version||message.contactId!==contactId||message.contactState!=='linked'||!message.textSelected||message.textState!=='complete'||typeof message.text!=='string')throw Error('REPORT_MESSAGE_CHANGED')
     lines.push('Utdrag ur sparat mejl (ordagrant, ingen ny bedömning):\n'+quote(message.text))
    }else lines.push('Senaste mejlets fullständiga text har inte valts för läsning eller finns inte komplett. Ingen äldre text ersätter det.')
    lines.push(contact.suppressed?'Kontakten har kontaktspärr. Ett nytt utskick kräver ett separat beslut.':'Ingen kontaktspärr är registrerad; detta är ändå inget utskicksbeslut.')
   }
  }
  if(kind==='overview'){
   lines.push('**Sparade pilotvillkor**')
   const offers=workspace.offers.filter(o=>o.confirmed&&o.projectId===projectId)
   if(!offers.length)lines.push('Inga bekräftade erbjudandeversioner finns i det lästa underlaget.')
   for(const offer of offers)lines.push(offer.freeMonths+' månaders pilot. Sparad version '+time(offer.createdAt)+':\n'+quote(offer.offerText,2000))
   lines.push('Villkoren är sparade erbjudanden. De innebär inte att ett företag har tackat ja, att betalning startar eller att ett nytt utskick är beslutat.')
  }
  lines.push(workspace.contactSummary.suppressedCount+' kontaktposter har kontaktspärr. Den här översikten skapar inga uppdrag, utkast eller utskick och ändrar inga kontaktspärrar.')
  if(/^\/projects\/[a-z0-9_-]+\/sales$/.test(workspace.workspaceUrl))lines.push('[Granska och redigera svarsförslag i projektets säljvy]('+workspace.workspaceUrl+'). Öppna ”Svarsförslag att granska”.')
  return {text:lines.join('\n\n'),evidence}
 }catch{return unavailable(evidence)}
}
