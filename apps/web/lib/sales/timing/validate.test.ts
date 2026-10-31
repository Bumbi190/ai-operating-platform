import {describe,it,expect} from 'vitest'
import {parseHistoryRevision,parseTimingRead,parseTimingRules} from './validate'
const ids=Array.from({length:8},(_,i)=>'10000000-0000-4000-8000-'+String(i+1).padStart(12,'0'))
const source={sourceKey:'sent',channel:'strato_sent',identityRef:'mailbox:1',scopeRef:'uidvalidity:1',since:'2026-10-01T00:00:00Z',through:'2026-10-19T06:00:00Z',observedAt:'2026-10-19T06:00:00Z',state:'complete',reference:'UID1'}
const event={id:ids[4],sourceRefs:['sent'],providerRefs:[{sourceKey:'sent',id:'1'}],occurredAt:'2026-10-08T10:00:00Z',direction:'outbound',outcome:'accepted',kind:'initial',invitationId:ids[5],inReplyToEventId:null,reviewedDuplicateOf:null}
const valid=()=>({projectId:ids[0],contactId:ids[1],expectedContactVersion:1,idempotencyKey:ids[2],expectedPreviousId:null,confirmed:true,data:{schemaVersion:1,contactVersions:[{id:ids[1],version:1}],history:'contacted',olderHistoryAttestation:null,sources:[{...source}],events:[{...event}],correctionOf:null,reviewNote:'Source checked'}})
describe('history metadata boundary',()=>{
 it('accepts precise reviewed metadata',()=>expect(parseHistoryRevision(valid())).toEqual(valid()))
 for(const field of ['body','subject','password','token','fetchUrl','recipient'])it('refuses '+field,()=>expect(()=>parseHistoryRevision({...valid(),[field]:'x'})).toThrow('INVALID_BODY'))
 for(const timestamp of ['2026-10-08','2026-10-08T10:00:00','2026-02-30T10:00:00Z','invalid'])it('refuses imprecise timestamp '+timestamp,()=>{const v=valid();v.data.events[0].occurredAt=timestamp;expect(()=>parseHistoryRevision(v)).toThrow('INVALID_BODY')})
 it('refuses unknown metadata keys',()=>{const v=valid();Object.assign(v.data.events[0],{secret:'x'});expect(()=>parseHistoryRevision(v)).toThrow('INVALID_BODY')})
 it('refuses duplicate events',()=>{const v=valid();v.data.events.push({...event});expect(()=>parseHistoryRevision(v)).toThrow('INVALID_BODY')})
 it('refuses duplicate sources',()=>{const v=valid();v.data.sources.push({...source});expect(()=>parseHistoryRevision(v)).toThrow('INVALID_BODY')})
 it('refuses missing sources',()=>{const v=valid();v.data.events[0].sourceRefs=['other'];expect(()=>parseHistoryRevision(v)).toThrow('INVALID_BODY')})
 it('refuses a duplicate reference to itself',()=>{const v=valid();v.data.events[0].reviewedDuplicateOf=event.id as never;expect(()=>parseHistoryRevision(v)).toThrow('INVALID_BODY')})
 it('refuses excessive events',()=>{const v=valid();v.data.events=Array.from({length:101},()=>({...event}));expect(()=>parseHistoryRevision(v)).toThrow('INVALID_BODY')})
 it('refuses impossible source window',()=>{const v=valid();v.data.sources[0].since='2026-10-20T00:00:00Z';expect(()=>parseHistoryRevision(v)).toThrow('INVALID_BODY')})
 it('requires older history attestation for no-contact assertion',()=>{const v=valid();v.data.history='owner_confirmed_none';v.data.events=[];expect(()=>parseHistoryRevision(v)).toThrow('INVALID_BODY')})
 it('refuses invalid direction/outcome pair',()=>{const v=valid();v.data.events[0].direction='inbound';expect(()=>parseHistoryRevision(v)).toThrow('INVALID_BODY')})
})
describe('timing read and rules',()=>{
 const rules={projectId:ids[0],idempotencyKey:ids[2],expectedPreviousId:null,confirmed:true,minWaitSeconds:1209600,maxReminders:1,maxSourceAgeSeconds:900}
 it('accepts proposal rules',()=>expect(parseTimingRules(rules)).toEqual(rules))
 for(const change of [{minWaitSeconds:1209599},{maxReminders:2},{maxSourceAgeSeconds:901},{maxReminders:-1},{minWaitSeconds:Infinity},{confirmed:false}])it('refuses weaker/invalid rules '+JSON.stringify(change),()=>expect(()=>parseTimingRules({...rules,...change})).toThrow('INVALID_BODY'))
 it('refuses model time or address override',()=>expect(()=>parseTimingRead({projectId:ids[0],now:'2026-10-19'})).toThrow('INVALID_BODY'))
 it('accepts contact IDs',()=>expect(parseTimingRead({projectId:ids[0],contactIds:[ids[1]]})).toEqual({projectId:ids[0],contactIds:[ids[1]]}))
 it('refuses duplicate IDs',()=>expect(()=>parseTimingRead({projectId:ids[0],contactIds:[ids[1],ids[1]]})).toThrow('INVALID_BODY'))
 it('refuses empty IDs',()=>expect(()=>parseTimingRead({projectId:ids[0],contactIds:[]})).toThrow('INVALID_BODY'))
 it('does not silently truncate oversized selection',()=>expect(()=>parseTimingRead({projectId:ids[0],contactIds:Array.from({length:201},(_,i)=>'10000000-0000-4000-8000-'+String(i).padStart(12,'0'))})).toThrow('INVALID_BODY'))
})
