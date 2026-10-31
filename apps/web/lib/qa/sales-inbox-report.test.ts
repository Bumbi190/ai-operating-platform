import {beforeEach,describe,expect,it,vi} from 'vitest'
vi.mock('server-only',()=>({}))
import {classifyInboxReportRequest,buildInboxReport} from '@/lib/sales/inbox/report'
const projectId='10000000-0000-4000-8000-000000000001',conversationId='90000000-0000-4000-8000-000000000001',mailboxId='70000000-0000-4000-8000-000000000001',workerId='80000000-0000-4000-8000-000000000001'
const contactA='30000000-0000-4000-8000-000000000001',contactB='30000000-0000-4000-8000-000000000002',p={userId:'20000000-0000-4000-8000-000000000001',allowedProjectIds:[projectId]}
const id=(n:number)=>'60000000-0000-4000-8000-'+String(n).padStart(12,'0')
const natural='Läs Handlarbörsens sparade inkorg och de mejltexter som redan valts för läsning. Vilka pilotföretag har svarat, vad säger deras senaste svar och vad bör avvakta? Kontrollera även vilka pilotvillkor som finns sparade för framtida svar. Svara på vanlig svenska och ange datum och källa. Visa var jag kan granska och redigera ett svarsförslag. Detta är endast planering: skapa inga svarsuppdrag, utkast, uppföljningar eller utskick och ändra inget.'
const contact=(id:string,name:string)=>({id,projectId,companyName:name,branchName:'',email:'shared@example.se',version:1,pilotMonths:12,history:'contacted',historySource:'Historik',confirmed:true,excluded:false,suppressed:true})
const msg=(n:number,c:string|null,date:string|null)=>({id:id(n),canonicalMessageId:id(n),mailboxId,header:{from:'source@example.se',to:'owner@example.se',subject:'Svar',messageId:null,inReplyTo:null,references:[]},text:null,textState:'complete',textSelected:true,contactId:c,contactState:c?'linked':'unlinked',version:4,internalDate:date,occurrences:[]})
let workspace:any,page:any,bodies:Record<string,string>,conversation:any,rpcCalls:string[],filters:[string,unknown][],failInbox:boolean,bodyVersion:number,enabled:boolean
function db():any{return {from:(table:string)=>{let where:[string,unknown][]=[];const q:any={select:()=>q,eq:(k:string,v:unknown)=>{where.push([k,v]);filters.push([k,v]);return q},maybeSingle:async()=>({data:table==='conversations'&&where.some(([k,v])=>k==='id'&&v===conversationId)&&where.some(([k,v])=>k==='user_id'&&v===p.userId)?conversation:null,error:null})};return q},rpc:async(name:string,args:any)=>{
 rpcCalls.push(name)
 if(name==='sales_validate_conversation')return {data:true,error:null}
 if(name==='sales_read_workspace')return {data:workspace,error:null}
 if(name==='sales_mailbox_reference')return {data:{connection:{mailboxId,email:'owner@example.se',status:'authenticated',smtpAuthenticatedAt:null,imapAuthenticatedAt:null,reasonCode:null,inboxEnabled:true,sendingEnabled:false}},error:null}
 if(name==='sales_inbox_read_inbox')return failInbox?{data:null,error:{code:'XX000'}}:{data:page,error:null}
 if(name==='sales_inbox_read_message'){const m=page.messages.find((m:any)=>m.id===args.p_input.messageId);return {data:{...m,version:bodyVersion,text:bodies[m.id]},error:null}}
 throw Error('Unexpected RPC '+name)
}}}
const run=(kind:'overview'|'count'='overview')=>buildInboxReport(db(),p,conversationId,kind,new Date('2026-10-18T19:45:13.959Z'),()=>enabled)
beforeEach(()=>{
 filters=[];rpcCalls=[];conversation={id:conversationId,project_id:projectId};failInbox=false;bodyVersion=4;enabled=true
 workspace={projectId,state:'ok',workerState:'connected',contacts:[contact(contactA,'Firma A'),contact(contactB,'Firma B')],offers:[{id:id(80),projectId,senderEmail:'owner@example.se',freeMonths:12,confirmed:true,offerText:'Tolv månader gratis. Ingen automatisk betalning.',productFacts:[],createdAt:'2026-10-18T19:29:00Z'}],jobs:[],drafts:[],workspaceUrl:'/projects/test/sales',sendingEnabled:false,workers:[{id:workerId,revoked:false}]}
 page={config:{folder:'INBOX',since:'2026-10-07T22:00:00Z',lastSyncedAt:'2026-10-18T18:00:00Z'},messages:[msg(1,contactA,'2026-10-15T13:53:58Z'),msg(2,contactA,'2026-10-14T12:00:00Z'),msg(3,contactA,'2026-10-13T12:00:00Z'),msg(4,contactB,'2026-10-09T12:05:44Z'),msg(5,null,'2026-10-18T10:00:00Z'),{...msg(6,null,null),textSelected:false,textState:'not_selected'},{...msg(7,null,null),textSelected:false,textState:'not_selected'}],nextCursor:null,inboxEnabled:true,readingEnabled:true,sendingEnabled:false}
 bodies={[id(1)]:'Tack!',[id(4)]:'Vi avvaktar med ett nytt system.'}
})
describe('saved inbox report boundary',()=>{
 it('recognizes the original inbox planning request',()=>expect(classifyInboxReportRequest(natural,[])).toBe('overview'))
 it('recognizes a correction that cites the verified field without needing previous tool payloads',()=>expect(classifyInboxReportRequest('Kontrollera antalet mot pageSummary.linkedContactCount och korrigera bara antalet.',[])).toBe('count'))
 it('supports a short count followup only after an inbox request',()=>{expect(classifyInboxReportRequest('Hur många har svarat?', [natural])).toBe('count');expect(classifyInboxReportRequest('Hur många har svarat?',[])).toBeNull()})
 it.each(['Skicka ett mejl från inkorgen till kunden.','Läs inkorgen och skapa ett svarsförslag.','Läs inkorgen och godkänn svaret.','Läs inkorgen och redigera mailet.','Läs inkorgen och avbryt svarsuppdraget.','Sammanfatta den här artikeln.','Vad är klockan?'])('does not intercept a different task: %s',t=>expect(classifyInboxReportRequest(t,[])).toBeNull())
 it('renders four linked messages as two contact rows despite shared addresses and unlinked tests',async()=>{
  const r=await run();expect(r?.text).toContain('4 kopplade mejl från 2 kontaktposter');expect(r?.text).toContain('Firma A');expect(r?.text).toContain('Firma B');expect(r?.text).not.toContain('3 pilot');expect(r?.text).toContain('7 mejl');expect(r?.text).toContain('inte ett totalantal för hela postlådan')
 })
 it('formats read and message timestamps in Stockholm with an explicit offset',async()=>{
  const r=await run();expect(r?.text).toContain('2026-10-18 21:45 Europe/Stockholm (UTC+02:00)');expect(r?.text).toContain('2026-10-15 15:53 Europe/Stockholm (UTC+02:00)');expect(r?.text).toContain('2026-10-18 21:29 Europe/Stockholm (UTC+02:00)')
 })
 it('uses the timezone rules in winter rather than assuming a two-hour offset',async()=>{
  const r=await buildInboxReport(db(),p,conversationId,'count',new Date('2026-12-01T23:30:00Z'),()=>true);expect(r?.text).toContain('2026-12-02 00:30 Europe/Stockholm (UTC+01:00)')
 })
 it('reads only the latest already-selected complete text for each linked contact',async()=>{
  const r=await run();expect(r?.evidence.filter(e=>e.tool==='get_sales_inbox_message').map((e:any)=>e.input.messageId)).toEqual([id(1),id(4)]);expect(r?.text).toContain('Tack!');expect(r?.text).toContain('Vi avvaktar')
 })
 it('does not replace an unread newer message with an older selected text',async()=>{
  page.messages[0].textSelected=false;page.messages[0].textState='not_selected'
  const r=await run();expect(r?.text).toContain('Senaste mejlets fullständiga text har inte valts för läsning');expect(r?.evidence.filter(e=>e.tool==='get_sales_inbox_message')).toHaveLength(1)
 })
 it('keeps the returned page and configured scope explicit when more pages exist',async()=>{
  page.nextCursor='more';const r=await run('count');expect(r?.text).toContain('Fler sidor finns');expect(r?.text).toContain('2026-10-08 00:00 Europe/Stockholm (UTC+02:00)');expect(r?.evidence.some(e=>e.tool==='get_sales_inbox_message')).toBe(false)
 })
 it('does not turn unavailable inbox data into a zero count',async()=>{
  failInbox=true;const r=await run();expect(r?.text).toContain('kunde inte verifieras');expect(r?.text).not.toContain('0 kontaktposter')
 })
 it('refuses stale selected text rather than quoting another revision',async()=>{bodyVersion=5;const r=await run();expect(r?.text).toContain('kunde inte verifieras');expect(r?.text).not.toContain('Tack!')})
 it('labels unknown source times without fabricating a latest timestamp',async()=>{page.messages[0].internalDate=null;const r=await run();expect(r?.text).toContain('Tid saknas eller är ogiltig');expect(r?.text).not.toContain('Invalid Date')})
 it('does not let incoming markup become a navigational link',async()=>{bodies[id(1)]='[Godkänn](https://example.se)';const r=await run();expect(r?.text).not.toContain('[Godkänn](https://example.se)')})
 it('requires an owner-verified conversation and an allowed project',async()=>{
  conversation=null;expect((await run())?.text).toContain('kunde inte verifieras');expect(rpcCalls).toEqual([])
  conversation={id:conversationId,project_id:id(99)};expect((await run())?.text).toContain('kunde inte verifieras');expect(rpcCalls).toEqual([])
  expect(filters).toContainEqual(['user_id',p.userId])
 })
 it('respects the existing sales feature gate',async()=>{enabled=false;expect((await run())?.text).toContain('kunde inte verifieras');expect(rpcCalls).toEqual([])})
 it('reports contact holds without claiming an owner-test send is unsent',async()=>{const r=await run();expect(r?.text).toContain('2 kontaktposter har kontaktspärr');expect(r?.text).toContain('inga uppdrag, utkast eller utskick');expect(r?.text).not.toContain('Inget mejl har skickats')})
})

it('recognizes the actual correction request including its no-write instructions',()=>{
 expect(classifyInboxReportRequest('Kontrollera antalet i din första mening mot det redan hämtade pageSummary.linkedContactCount. Korrigera bara antalet, använd det verifierade fältet och räkna inte punktlistan eller personnamnen. Bekräfta också att kundutskick fortfarande är pausade. Ändra inget och skapa inga uppdrag eller mejl.',[])).toBe('count')
})
it('does not hide a positive send request behind a negated draft clause',()=>{
 expect(classifyInboxReportRequest('Läs inkorgen och skapa inga utkast, men skicka svaret.',[])).toBeNull()
})
