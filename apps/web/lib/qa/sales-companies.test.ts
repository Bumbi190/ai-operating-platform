import {describe,expect,it} from 'vitest'
import {buildCompanyDirectory,filterCompanies,canonicalCompanyEvents} from '../sales/companies/model'
import {readCompanyContacts,readCompanyTiming} from '../sales/companies/read'
import type {SalesContact} from '../sales/types'
import type {HistoryEvent,HistoryRevision,TimingReport} from '../sales/timing/types'
const projectId='8f673c09-1c8f-4d78-876e-4c14bf1c89b3'
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const at='2026-11-03T10:00:00Z'
const contact=(n=1,extra:Partial<Omit<SalesContact,'offerKind'|'pilotMonths'>>={}):SalesContact=>({id:id(n),projectId,version:1,companyName:'Synthetic Dealer AB',branchName:'Malmö',email:`info${n}@dealer.example.com`,websiteUrl:'https://dealer.example.com',history:'unknown',historySource:'Partial source',confirmed:false,excluded:false,suppressed:true,offerKind:'pilot',pilotMonths:6,...extra})
const event=(n:number,extra:Partial<HistoryEvent>={}):HistoryEvent=>({id:id(n),sourceRefs:['smtp'],providerRefs:[{sourceKey:'smtp',id:`mail${n}`}],occurredAt:at,direction:'outbound',outcome:'accepted',kind:'initial',invitationId:null,inReplyToEventId:null,reviewedDuplicateOf:null,...extra})
const history=(extra:Partial<HistoryRevision>={}):HistoryRevision=>({id:id(900),projectId,recipient:'info1@dealer.example.com',version:1,previousId:null,reviewedBy:id(999),createdAt:at,data:{schemaVersion:1,contactVersions:[{id:id(1),version:1}],history:'contacted',olderHistoryAttestation:null,sources:[{sourceKey:'smtp',channel:'strato_sent',identityRef:'not-for-browser',scopeRef:'all folders',since:at,through:at,observedAt:at,state:'gap',reference:'https://secret.example/unsubscribe?token=never-render'}],events:[event(30)],correctionOf:null,reviewNote:'Partial review https://secret.example/?token=never-render'},...extra})
const timing=(h=history()):TimingReport=>({projectId,evaluatedAt:at,customerSendingEnabled:false,rules:null,workspaceUrl:'/sales',contacts:[{contactId:id(1),recipient:'info1@dealer.example.com',contactVersion:1,historyRevisionId:h.id,ruleRevisionId:null,latestObservedOutboundAt:null,reminderCount:null,intervalFloorAt:'2026-11-17T10:00:00Z',sourceThrough:at,blockers:['HISTORY_REVIEW_REQUIRED'],initialPreparationAllowed:false}],historyRevisions:[h]})
const input=(extra:Record<string,unknown>={})=>({projectId,evaluatedAt:at,contacts:{status:'ready' as const,contacts:[contact()]},timing:timing(),archive:{status:'disabled' as const},saved:{status:'disabled' as const,candidates:[],outreachReady:false as const},sourceConfigured:false,...extra})

describe('read-only company projection',()=>{
 it('retains observed accepted mail while history remains incomplete; never calls it delivered',()=>{
  const d=buildCompanyDirectory(input());expect(d.rows[0]).toMatchObject({status:'contacted',lastOutboundAt:at,earliestReviewAt:'2026-11-17T10:00:00Z'});expect(d.rows[0].badges).toContain('Kontaktspärr');expect(d.rows[0].gaps.length).toBeGreaterThan(0);expect(d.readOnly).toBe(true);expect(JSON.stringify(d)).not.toContain('never-render');expect(JSON.stringify(d)).not.toContain('not-for-browser')
 })
 it('does not display history from a stale contact version',()=>{
  const d=buildCompanyDirectory(input({contacts:{status:'ready',contacts:[contact(1,{version:2})]}}));expect(d.rows[0].lastOutboundAt).toBeNull();expect(d.rows[0].status).toBe('unknown');expect(d.rows[0].events).toEqual([])
 })
 it('does not display a revision for a different recipient',()=>{
  const d=buildCompanyDirectory(input({timing:timing(history({recipient:'another@example.com'}))}));expect(d.rows[0].events).toEqual([])
 })
 it('keeps shared-domain branches separate and counts a duplicate address once',()=>{
  const contacts=[contact(1,{email:'INFO@dealer.example.com'}),contact(2,{email:'info@dealer.example.com',branchName:'Lund'})];const d=buildCompanyDirectory(input({contacts:{status:'ready',contacts},timing:null}));expect(d.rows).toHaveLength(2);expect(d.uniqueRecipients).toBe(1);expect(d.rows.every(r=>r.badges.includes('Delad mejladress – granska identitet'))).toBe(true)
 })
 it('unknown and not_contacted contact flags alone never establish no contact history',()=>{
  const d=buildCompanyDirectory(input({contacts:{status:'ready',contacts:[contact(1,{history:'not_contacted',suppressed:false})]},timing:null}));expect(d.rows[0].status).toBe('unknown');expect(d.rows[0].lastOutboundAt).toBeNull()
 })
 it('incoming letter and failed-before-send are not a sent invitation',()=>{
  const h=history();h.data.events=[event(3,{direction:'inbound',outcome:'received'}),event(4,{outcome:'failed_before_send'})];const d=buildCompanyDirectory(input({timing:timing(h)}));expect(d.rows[0].lastOutboundAt).toBeNull();expect(d.rows[0].lastInboundAt).toBe(at);expect(d.rows[0].badges).toContain('Mottaget brev – behöver granskas');expect(d.rows[0].status).toBe('contacted')
 })
 it('deduplicates connected provider aliases and explicit duplicate links transitively',()=>{
  const a=event(1),b=event(2),c=event(3,{providerRefs:[a.providerRefs[0],b.providerRefs[0]]}),d=event(4,{reviewedDuplicateOf:a.id});expect(canonicalCompanyEvents([a,b,c,d])).toHaveLength(1)
 })
 it('keeps conflicting outcomes on one canonical message visible without duplicate message counts',()=>{
  const a=event(1),b=event(2,{direction:'inbound',outcome:'bounced',providerRefs:a.providerRefs});const events=canonicalCompanyEvents([a,b]);expect(events).toHaveLength(1);expect(events[0].outcomes).toEqual(expect.arrayContaining(['accepted','bounced']))
 })
 it('does not move the last sent date to the time of a later bounce',()=>{
  const h=history();h.data.events=[event(1,{occurredAt:'2026-11-01T10:00:00Z'}),event(2,{direction:'inbound',outcome:'bounced',occurredAt:'2026-11-02T10:00:00Z',providerRefs:event(1).providerRefs})];const d=buildCompanyDirectory(input({timing:timing(h)}));expect(d.rows[0].lastOutboundAt).toBe('2026-11-01T10:00:00Z')
 })
 it('filters saved records by area and name without claiming nationwide coverage',()=>{
  const d=buildCompanyDirectory(input({contacts:{status:'ready',contacts:[contact(1),contact(2,{companyName:'Other AB',branchName:'Lund'})]},timing:null}));expect(filterCompanies(d.rows,{query:'synthetic',area:'malmö',status:'all'})).toHaveLength(1);expect(filterCompanies(d.rows,{query:'',area:'stockholm',status:'all'})).toHaveLength(0)
 })
 it('attaches exact address warning but not another company identity to an ephemeral result',()=>{
  const d=buildCompanyDirectory(input({publicResults:{candidates:[{sourceId:'node/1',sourceUrl:'https://www.openstreetmap.org/node/1',name:'Different Branch Name',email:'INFO1@dealer.example.com',websiteUrl:'https://dealer.example.com'}],retrievedAt:at,city:'Malmö'}}));const row=d.rows.find(r=>r.id==='public:node/1')!;expect(row.matches).toContain('Samma mejladress i kontaktjournalen');expect(row.lastOutboundAt).toBeNull();expect(row.status).toBe('unknown');expect(row.name).toBe('Different Branch Name')
 })
 it('does not attach an address or company match through a shared domain',()=>{
  const d=buildCompanyDirectory(input({publicResults:{candidates:[{sourceId:'node/2',sourceUrl:'javascript:alert(1)',name:'Unrelated AB',email:'other@dealer.example.com',websiteUrl:'https://dealer.example.com'}],retrievedAt:at,city:'Malmö'}}));const row=d.rows.find(r=>r.id==='public:node/2')!;expect(row.matches).toEqual([]);expect(row.sourceUrl).toBeNull();expect(row.status).toBe('unknown')
 })
 it('source failure is explicit rather than an empty complete baseline',()=>{
  const d=buildCompanyDirectory(input({contacts:{status:'unavailable',contacts:[]},timing:null}));expect(d.uniqueRecipients).toBeNull();expect(d.sources.find(s=>s.key==='contacts')?.state).toBe('unavailable')
 })
 it('shows bounded no-match only for current attested empty history with all fresh complete channels',()=>{
  const h=history();h.data.history='owner_confirmed_none';h.data.olderHistoryAttestation='Owner reviewed older available history.';h.data.events=[];h.data.sources=['strato_sent','strato_inbox','resend'].map((channel,i)=>({...h.data.sources[0],sourceKey:'source'+i,channel:channel as 'strato_sent'|'strato_inbox'|'resend',state:'complete'}));const t=timing(h);t.contacts[0].blockers=[];const d=buildCompanyDirectory(input({timing:t}));expect(d.rows[0].status).toBe('no_match');expect(d.rows[0].gaps).toEqual([]);h.data.sources[0].observedAt='2026-11-01T10:00:00Z';expect(buildCompanyDirectory(input({timing:timing(h)})).rows[0].status).toBe('unknown')
 })
 it('retains recipient stops even without a history revision and includes them in blocked filter',()=>{
  const t=timing();t.contacts[0].historyRevisionId=null;t.contacts[0].blockers=['RECIPIENT_STOPPED'];const d=buildCompanyDirectory(input({contacts:{status:'ready',contacts:[contact(1,{suppressed:false})]},timing:t}));expect(d.rows[0].blocked).toBe(true);expect(filterCompanies(d.rows,{query:'',area:'',status:'blocked'})).toHaveLength(1)
 })
 it('an observed unsubscribe or bounce is included in blocked results independently of contact flags',()=>{
  for(const outcome of ['unsubscribed','bounced'] as const){const h=history();h.data.events=[event(3,{direction:'inbound',outcome})];const d=buildCompanyDirectory(input({contacts:{status:'ready',contacts:[contact(1,{suppressed:false})]},timing:timing(h)}));expect(filterCompanies(d.rows,{query:'',area:'',status:'blocked'})).toHaveLength(1)}
 })
 it('labels a public query centre as search area, never as a verified company city',()=>{
  const d=buildCompanyDirectory(input({publicResults:{candidates:[{sourceId:'node/2',sourceUrl:'https://www.openstreetmap.org/node/2',name:'Unverified Dealer',email:null,websiteUrl:null}],retrievedAt:at,city:'Malmö',radiusKm:25}}));const r=d.rows.find(r=>r.id==='public:node/2')!;expect(r.city).toBeNull();expect(r.searchArea).toBe('Malmö · radie 25 km')
 })
})

describe('paginated, strictly read-only contact reader',()=>{
 const row=(n:number)=>({id:id(n),project_id:projectId,version:1,data:contact(n)})
 it('reads501 rows across stable pages to the end',async()=>{
  const all=Array.from({length:501},(_,i)=>row(i+1)),calls:string[]=[];const r=await readCompanyContacts(projectId,async(after,limit)=>{calls.push(after??'start');return {data:all.filter(r=>after===null||r.id>after).slice(0,limit),error:null}});expect(r.status).toBe('ready');expect(r.contacts).toHaveLength(501);expect(calls).toEqual(['start',id(500)])
 })
 it('refuses repeated, cross-project or malformed rows without partial success',async()=>{
  for(const data of [[row(1),row(1)],[{...row(1),project_id:id(999)}],[{...row(1),version:2}]]){const r=await readCompanyContacts(projectId,async()=>({data,error:null}));expect(r.status).toBe('unavailable');expect(r.contacts).toEqual([])}
 })
 it('marks a10000-row cap as incomplete rather than silently truncating',async()=>{
  const r=await readCompanyContacts(projectId,async(after,limit)=>{const start=after?Number(after.slice(-12))+1:1;return {data:Array.from({length:limit},(_,i)=>row(start+i)),error:null}});expect(r.status).toBe('incomplete');expect(r.contacts).toEqual([])
 })
 it('batches timing reads at200 without invoking workspace reconciliation',async()=>{
  const contacts=Array.from({length:401},(_,i)=>contact(i+1)),sizes:number[]=[];const r=await readCompanyTiming(projectId,contacts,async(ids)=>{sizes.push(ids.length);return {...timing(),contacts:[],historyRevisions:[]}});expect(sizes).toEqual([200,200,1]);expect(r).not.toBeNull()
 })
 it('returns an explicit timing gap if any read batch fails',async()=>{
  const r=await readCompanyTiming(projectId,[contact()],async()=>{throw new Error('unavailable')});expect(r).toBeNull()
 })
})
