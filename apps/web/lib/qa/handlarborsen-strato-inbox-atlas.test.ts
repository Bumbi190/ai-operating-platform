import {describe,it,expect,vi} from 'vitest'
import {HANDLARBORSEN_PROJECT_ID as HB} from '@/lib/atlas/collectors/handlarborsen-marketplace'
import {
  readHbStratoInbox,
  HB_STRATO_INBOX_TOOL_NAMES,
  hbStratoInboxReadEnabled,
  type HbInboxReads,
} from '@/lib/handlarborsen/distribution/atlas-strato-inbox'

const OWNER='7f000001-0000-4000-8000-000000000001'
const CONVERSATION='7f000001-0000-4000-8000-000000000002'
const MAILBOX='7f000001-0000-4000-8000-000000000003'
const MESSAGE='7f000001-0000-4000-8000-000000000004'
const OTHER_PROJECT='7f000001-0000-4000-8000-000000000005'
const p={userId:OWNER,allowedProjectIds:[HB]}
const summaryTool=HB_STRATO_INBOX_TOOL_NAMES[0]
const messageTool=HB_STRATO_INBOX_TOOL_NAMES[1]
const rawMessage={
 id:MESSAGE,mailboxId:MAILBOX,header:{
   from:'visitor@example.invalid',to:'contact@example.invalid',
   subject:'Pilotintresse',messageId:'<test@example.invalid>',inReplyTo:null,references:[],
 },
 text:'Test privately selected content',
 textSelected:true,textState:'complete',internalDate:'2026-10-27T12:00:00Z',
 contactState:'unlinked',contactId:null,version:1,canonicalMessageId:MESSAGE,
 possibleDuplicate:false,occurrences:[],
}
function fixture(overrides:Partial<HbInboxReads>={}){
 const calls:string[]=[]
 const source: HbInboxReads={
  async confirmConversation(){calls.push('conversation');return {projectId:HB}},
  async mailboxIds(){calls.push('mailboxes');return [MAILBOX]},
  async readPage(){calls.push('page');return {
   config:{lastSyncedAt:'2026-10-27T13:53:25Z',state:'enabled',folder:'INBOX'},
   messages:[rawMessage],nextCursor:null,readingEnabled:false,
   reasonCode:'HOST_OFFLINE',scopeCurrent:true,
  }},
  async readMessage(){calls.push('message');return rawMessage},
  ...overrides,
 }
 return {source,calls}
}
describe('Atlas Handlarbörsen Strato read-only interim bridge',()=>{
 it('defaults OFF when env absent, and exposes no additional rights',()=>{
  const before=process.env.HB_STRATO_INBOX_READ_ENABLED
  delete process.env.HB_STRATO_INBOX_READ_ENABLED
  expect(hbStratoInboxReadEnabled()).toBe(false)
  process.env.HB_STRATO_INBOX_READ_ENABLED='false'
  expect(hbStratoInboxReadEnabled()).toBe(false)
  process.env.HB_STRATO_INBOX_READ_ENABLED='true'
  expect(hbStratoInboxReadEnabled()).toBe(true)
  if(before===undefined)delete process.env.HB_STRATO_INBOX_READ_ENABLED
  else process.env.HB_STRATO_INBOX_READ_ENABLED=before
 })
 it('disabled mode does not read a conversation or a mailbox',async()=>{
  const f=fixture()
  expect(await readHbStratoInbox(summaryTool,{},p,CONVERSATION,f.source,false)).toEqual({
   status:'disabled',sendingAllowed:false,
  })
  expect(f.calls).toEqual([])
 })
 it('foreign project/unknown conversation or wrong owner blocks all mailbox work',async()=>{
  const deniedScenarios: Array<{
   principal:{userId:string;allowedProjectIds:string[]}
   conversation:string|null
  }> = [
   {principal:{...p,allowedProjectIds:[OTHER_PROJECT]},conversation:CONVERSATION},
   {principal:p,conversation:null},
   {principal:{...p,userId:'bad'},conversation:CONVERSATION},
  ]
  for(const {principal,conversation} of deniedScenarios){
   const f=fixture()
   expect(await readHbStratoInbox(summaryTool,{},principal,conversation,f.source,true)).toEqual({
    status:'not_authorized',sendingAllowed:false,
   })
   expect(f.calls).toEqual([])
  }
  const f=fixture({confirmConversation:async()=>({projectId:OTHER_PROJECT})})
  expect(await readHbStratoInbox(summaryTool,{},p,CONVERSATION,f.source,true)).toMatchObject({status:'not_authorized'})
  expect(f.calls).toEqual([])
 })
 it('global overview requires a real owned conversation and explicit CURRENT user request',async()=>{
  const overview=fixture({confirmConversation:async()=>({projectId:null})})
  expect(await readHbStratoInbox(summaryTool,{},p,CONVERSATION,overview.source,true)).toEqual({status:'not_authorized',sendingAllowed:false})
  expect(overview.calls).toEqual([])
  const requested=fixture({confirmConversation:async()=>({projectId:null})})
  const result=await readHbStratoInbox(summaryTool,{},p,CONVERSATION,requested.source,true,true) as any
  expect(result.status).toBe('ok')
  expect(result.source).toBe('saved_strato_inbox')
  expect(result.sendingAllowed).toBe(false)
  expect(requested.calls).toEqual(['mailboxes','page'])
  const missing=fixture({confirmConversation:async()=>null})
  expect(await readHbStratoInbox(summaryTool,{},p,CONVERSATION,missing.source,true,true)).toEqual({status:'not_authorized',sendingAllowed:false})
  expect(missing.calls).toEqual([])
  const foreign=fixture({confirmConversation:async()=>({projectId:OTHER_PROJECT})})
  expect(await readHbStratoInbox(summaryTool,{},p,CONVERSATION,foreign.source,true,true)).toMatchObject({status:'not_authorized'})
  expect(foreign.calls).toEqual([])
  const untrustedUser=fixture({confirmConversation:async()=>({projectId:null})})
  expect(await readHbStratoInbox(summaryTool,{}, {...p,allowedProjectIds:[OTHER_PROJECT]},CONVERSATION,untrustedUser.source,true,true)).toMatchObject({status:'not_authorized'})
  expect(untrustedUser.calls).toEqual([])
 })
 it('forbids model-defined mailbox, tenant, write or arbitrary tool operations',async()=>{
  const f=fixture()
  for(const args of [
   {projectId:OTHER_PROJECT},{mailboxId:MAILBOX},{operation:'send'},{cursor:'not-uuid'},
  ]){
   expect(await readHbStratoInbox(summaryTool,args,p,CONVERSATION,f.source,true)).toMatchObject({status:'not_authorized'})
  }
  expect(await readHbStratoInbox('send_sales_email',{},p,CONVERSATION,f.source,true)).toMatchObject({status:'not_authorized'})
  expect(f.calls).toEqual([])
 })
 it('list is only header metadata, not message text or an inferred pilot reply',async()=>{
  const f=fixture()
  const result=await readHbStratoInbox(summaryTool,{},p,CONVERSATION,f.source,true) as any
  expect(result.status).toBe('ok')
  expect(result.sendingAllowed).toBe(false)
  expect(result.legacyWorkerReading).toBe(false)
  expect(result.source).toBe('saved_strato_inbox')
  expect(result.lastSyncedAt).toBe('2026-10-27T13:53:25Z')
  expect(result.messages).toHaveLength(1)
  expect(result.messages[0]).toMatchObject({
    id:MESSAGE,contactState:'unlinked',textSelected:true,textState:'complete',
  })
  expect(JSON.stringify(result)).not.toContain(rawMessage.text)
  expect(result.messageCountOnThisPage).toBe(1)
  expect(result.messages[0].reviewGate).toBe('sender_classification_needed')
  expect(result.reviewSummary).toMatchObject({
    scope:'returned_page_only',ownerTextSelectionNeeded:0,
    senderClassificationNeeded:1,ownerDraftReviewPossible:0,
    sendingAllowed:false,
  })
  expect(f.calls).toEqual(['conversation','mailboxes','page'])
 })
 it('produces source-backed owner review gates for a single page without inventing send permission',async()=>{
  const entries=[
   {...rawMessage,id:'7f000001-0000-4000-8000-000000000011',contactState:'linked',textSelected:false,textState:'not_selected'},
   {...rawMessage,id:'7f000001-0000-4000-8000-000000000012',contactState:'linked',textSelected:true,textState:'truncated'},
   {...rawMessage,id:'7f000001-0000-4000-8000-000000000013',contactState:'ambiguous',textSelected:true,textState:'complete'},
   {...rawMessage,id:'7f000001-0000-4000-8000-000000000014',contactState:'unlinked',textSelected:true,textState:'complete'},
   {...rawMessage,id:'7f000001-0000-4000-8000-000000000015',contactState:'linked',textSelected:true,textState:'complete'},
  ]
  const f=fixture({readPage:async()=>({
   messages:entries,
   config:{state:'enabled',folder:'INBOX',lastSyncedAt:'2026-10-27T13:53:25Z'},
   nextCursor:null,readingEnabled:false,reasonCode:null,scopeCurrent:true,
  })})
  const result=await readHbStratoInbox(summaryTool,{},p,CONVERSATION,f.source,true) as any
  expect(result.status).toBe('ok')
  expect(result.messages.map((m:any)=>m.reviewGate)).toEqual([
   'owner_text_selection_needed','text_incomplete',
   'contact_link_review_needed','sender_classification_needed',
   'owner_draft_review_possible',
  ])
  expect(result.reviewSummary).toEqual({
   scope:'returned_page_only',ownerTextSelectionNeeded:1,textIncomplete:1,
   contactLinkReviewNeeded:1,senderClassificationNeeded:1,
   ownerDraftReviewPossible:1,sendingAllowed:false,
  })
  expect(result.messageCountOnThisPage).toBe(5)
  expect(JSON.stringify(result)).not.toContain(rawMessage.text)
  // The overridden fake page reader does not record default-fixture calls.
  expect(f.calls).toEqual(['conversation','mailboxes'])
 })
 it('detail returns body ONLY when owner already selected exact complete message',async()=>{
  const f=fixture()
  const result=await readHbStratoInbox(messageTool,{messageId:MESSAGE},p,CONVERSATION,f.source,true) as any
  expect(result.bodyAvailable).toBe(true)
  expect(result.body).toBe(rawMessage.text)
  expect(result.sendingAllowed).toBe(false)
  expect(result.untrusted).toBe(true)
  expect(f.calls).toEqual(['conversation','mailboxes','message'])
  const g=fixture({readMessage:async()=>({...rawMessage,textSelected:false})})
  const suppressed=await readHbStratoInbox(messageTool,{messageId:MESSAGE},p,CONVERSATION,g.source,true) as any
  expect(suppressed.body).toBeNull()
  expect(suppressed.bodyAvailable).toBe(false)
 })
 it('refuses changed message identity or attempted cross-mailbox read',async()=>{
  for(const patch of [{id:'7f000001-0000-4000-8000-000000000099'},{
   mailboxId:'7f000001-0000-4000-8000-000000000099'}, {textState:'unknown'}]){
   const f=fixture({readMessage:async()=>({...rawMessage,...patch})})
   expect(await readHbStratoInbox(messageTool,{messageId:MESSAGE},p,CONVERSATION,f.source,true)).toMatchObject({status:'unavailable',sendingAllowed:false})
  }
 })
 it('fails closed for malformed, duplicate and incomplete data',async()=>{
  const badSources:Partial<HbInboxReads>[]=[
   {mailboxIds:async()=>[MAILBOX,MAILBOX]},
   {mailboxIds:async()=>[]},
   {mailboxIds:async()=>null},
   {readPage:async()=>({messages:[{...rawMessage,mailboxId:OTHER_PROJECT}],nextCursor:null})},
   {readPage:async()=>({messages:[rawMessage],nextCursor:'bad'})},
   {readPage:async()=>({messages:new Array(51).fill(rawMessage),nextCursor:null})},
  ]
  for(const part of badSources){
   const f=fixture(part)
   expect(await readHbStratoInbox(summaryTool,{},p,CONVERSATION,f.source,true)).toMatchObject({status:'unavailable',sendingAllowed:false})
  }
 })
 it('read exception never leaks customer messages, SQL or internal errors',async()=>{
  const f=fixture({readPage:async()=>{throw Error('Private SQL auth secret BODY')}})
  const result=await readHbStratoInbox(summaryTool,{},p,CONVERSATION,f.source,true)
  expect(result).toEqual({status:'unavailable',sendingAllowed:false})
  expect(JSON.stringify(result)).not.toMatch(/SQL|secret|BODY/)
 })
})

describe('Atlas Strato adapter production call boundaries (mocked DB)',()=>{
 async function fakeDb(conversationProjectId:string|null=HB,exists=true){
  const filters:{table:string;field:string;value:string}[]=[]
  const calls:{name:string;args:Record<string,unknown>}[]=[]
  const db={
   from(table:string){
    const q={
     select(_columns:string){return q},
     eq(field:string,value:string){filters.push({table,field,value});return q},
     async maybeSingle(){
      if(table==='conversations')return {data:exists?{project_id:conversationProjectId}:null,error:null}
      return {data:null,error:'BAD_TABLE'}
     },
     async limit(_amount:number){
      if(table==='sales_inbox_configs')return {data:[{mailbox_id:MAILBOX}],error:null}
      return {data:null,error:'BAD_TABLE'}
     },
    }
    return q
   },
   async rpc(name:string,args:Record<string,unknown>){
    calls.push({name,args})
    if(name==='sales_inbox_read_inbox')return {data:{
     config:{lastSyncedAt:'2026-10-27T13:53:25Z',state:'enabled',folder:'INBOX'},
     messages:[rawMessage],nextCursor:null,readingEnabled:false,
     reasonCode:'HOST_OFFLINE',scopeCurrent:true},error:null}
    if(name==='sales_inbox_read_message')return {data:rawMessage,error:null}
    return {data:null,error:'UNKNOWN_RPC'}
   },
  }
  return {db,filters,calls}
 }
 it('binds chat owner, project, mailbox and uses ONLY read RPC',async()=>{
  const f=await fakeDb()
  const {handleHbStratoInboxTool}=await import('@/lib/handlarborsen/distribution/atlas-strato-inbox')
  const result=await handleHbStratoInboxTool(summaryTool,{},p,CONVERSATION,f.db as never,true) as any
  expect(result.status).toBe('ok')
  expect(f.calls.map(c=>c.name)).toEqual(['sales_inbox_read_inbox'])
  expect(f.filters).toContainEqual({table:'conversations',field:'user_id',value:OWNER})
  expect(f.filters).toContainEqual({table:'sales_inbox_configs',field:'owner_id',value:OWNER})
  expect(f.filters).toContainEqual({table:'sales_inbox_configs',field:'project_id',value:HB})
  expect(f.calls[0].args).toMatchObject({
   p_principal:{userId:OWNER,allowedProjectIds:[HB]},
   p_input:{projectId:HB,mailboxId:MAILBOX,cursor:null},
  })
 })
 it('authenticated overview reads are allowed only with explicit same-turn user intent',async()=>{
  const {handleHbStratoInboxTool}=await import('@/lib/handlarborsen/distribution/atlas-strato-inbox')
  const noIntent=await fakeDb(null)
  expect(await handleHbStratoInboxTool(summaryTool,{},p,CONVERSATION,noIntent.db as never,true,false)).toEqual({status:'not_authorized',sendingAllowed:false})
  expect(noIntent.calls).toEqual([])
  expect(noIntent.filters.filter(f=>f.table==='sales_inbox_configs')).toEqual([])
  const allowed=await fakeDb(null)
  const result=await handleHbStratoInboxTool(summaryTool,{},p,CONVERSATION,allowed.db as never,true,true) as any
  expect(result.status).toBe('ok')
  expect(result.messageCountOnThisPage).toBe(1)
  expect(result.sendingAllowed).toBe(false)
  expect(allowed.calls.map(c=>c.name)).toEqual(['sales_inbox_read_inbox'])
  expect(allowed.filters).toContainEqual({table:'conversations',field:'user_id',value:OWNER})
  expect(allowed.filters).toContainEqual({table:'sales_inbox_configs',field:'owner_id',value:OWNER})
  const missing=await fakeDb(null,false)
  expect(await handleHbStratoInboxTool(summaryTool,{},p,CONVERSATION,missing.db as never,true,true)).toEqual({status:'not_authorized',sendingAllowed:false})
  expect(missing.calls).toEqual([])
  const another=await fakeDb(OTHER_PROJECT)
  expect(await handleHbStratoInboxTool(summaryTool,{},p,CONVERSATION,another.db as never,true,true)).toEqual({status:'not_authorized',sendingAllowed:false})
  expect(another.calls).toEqual([])
 })
 it('does not issue service-role requests when feature off or outside project',async()=>{
  const {handleHbStratoInboxTool}=await import('@/lib/handlarborsen/distribution/atlas-strato-inbox')
  const f=await fakeDb()
  expect(await handleHbStratoInboxTool(summaryTool,{},p,CONVERSATION,f.db as never,false)).toMatchObject({status:'disabled'})
  expect(f.calls).toEqual([])
  expect(f.filters).toEqual([])
  expect(await handleHbStratoInboxTool(summaryTool,{},{
    userId:OWNER,allowedProjectIds:[OTHER_PROJECT],
  },CONVERSATION,f.db as never,true)).toMatchObject({status:'not_authorized'})
  expect(f.calls).toEqual([])
  expect(f.filters).toEqual([])
 })
})

describe('Atlas chat route registration fails closed',()=>{
 it('gates schema, guide and execution of new read-only tools',async()=>{
  const {readFileSync}=await import('node:fs')
  const {resolve}=await import('node:path')
  const src=readFileSync(resolve(__dirname,'../../app/api/chat/route.ts'),'utf8')
  expect(src).toContain('...(hbStratoInboxReadEnabled()?HB_STRATO_INBOX_TOOLS:[])')
  expect(src).toContain("(hbStratoInboxReadEnabled()?HB_STRATO_INBOX_GUIDE:'')")
  expect(src).toContain('handleHbStratoInboxTool(name,input,{userId,allowedProjectIds},ownedConversationId,db,hbStratoInboxReadEnabled(),allowGlobalFromExplicitUserIntent)')
  expect(src).not.toContain('...HB_STRATO_INBOX_TOOLS,')
 })
})
