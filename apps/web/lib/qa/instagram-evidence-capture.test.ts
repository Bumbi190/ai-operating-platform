import {describe,expect,it,vi} from 'vitest'
import {prepareInstagramPublicationCandidate as pub,prepareInstagramMeasurementCandidate as measure} from '../content-growth/instagram-evidence-capture'
const uuid=(n:number)=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0')
const H=3600000, start=1000*H, end=start+14*24*H
const scope={projectId:uuid(1),bindingId:uuid(2),accountId:'synthetic-account',platform:'instagram' as const}
const gate={enabled:true,projectSlug:'ai-media-automation' as const,scope,enrollment:{startMs:start,endMs:end}}
type P=ReturnType<Parameters<typeof pub>[1]>
type M=ReturnType<Parameters<typeof measure>[2]>
const pe=(patch:Partial<P>={}):P=>({...scope,scriptId:uuid(3),mediaId:'synthetic-media',acquisitionId:'pub-1',
 origin:'existing_media_publish_response',dispatchAttempts:1,dryRun:false,recovered:false,skipped:false,needsVerification:false,
 previousMediaId:null,persistedMediaId:'synthetic-media',request:{startMs:start+H,endMs:start+H+1000},nowMs:start+H+1000,...patch})
const me=(patch:Partial<M>={}):M=>({...scope,scriptId:uuid(3),mediaId:'synthetic-media',acquisitionId:'measure-1',
 origin:'existing_insights_response',singleResponseMetrics:true,request:{startMs:start+50*H,endMs:start+50*H+1000},nowMs:start+50*H+1000,
 result:{ok:true,metrics:{views:0,reach:100,saved:0}},...patch})
const publication=()=>{const p=pub(gate,()=>pe());if(p.status!=='candidate_only')throw Error('fixture');return p.candidate}
const runP=(p:Partial<P>={})=>pub(gate,()=>pe(p))
const runM=(p:Partial<M>={})=>measure(gate,publication(),()=>me(p))

describe('unmounted Instagram evidence capture candidate',()=>{
 it('disabled or missing gate never evaluates lazy event, scope or publication',()=>{
   const read=vi.fn(()=>{throw Error('not read')})
   expect(pub(undefined,read).status).toBe('disabled')
   expect(pub({...gate,enabled:false},read).status).toBe('disabled')
   expect(measure(undefined,null,read).status).toBe('disabled')
   expect(read).not.toHaveBeenCalled()
 })
 it('rejects other brand, malformed IDs, and wrong account/project/binding before accepting evidence',()=>{
   const read=vi.fn(()=>pe())
   expect(pub({...gate,projectSlug:'familje-stunden'} as unknown as typeof gate,read).status).toBe('invalid_scope')
   expect(read).not.toHaveBeenCalled()
   for(const k of ['projectId','bindingId','accountId'] as const) {
     expect(runP({[k]:k==='accountId'?'other':uuid(9)}).status).toBe('invalid_scope')
     expect(runM({[k]:k==='accountId'?'other':uuid(9)}).status).toBe('invalid_scope')
   }
   expect(runP({scriptId:'not-uuid'}).status).toBe('invalid_identity')
 })
 it('accepts only one direct first-attempt success with persisted matching media',()=>{
   const v=runP()
   expect(v.status).toBe('candidate_only');expect(v.candidate?.evidence).toBe('unverified_local_interval')
   expect(v.authorizesPilot).toBe(false);expect(v.authorizesPublication).toBe(false)
   expect(v.candidate).not.toHaveProperty('publishedAtMs')
   expect(runP({persistedMediaId:'other'}).status).toBe('invalid_identity')
   expect(runP({persistedMediaId:null}).status).toBe('invalid_identity')
 })
 it('refuses skip, recovery, dry run, retry ambiguity, unknown and old ID',()=>{
   for(const p of [{origin:'recovered'},{origin:'already_published'},{origin:'cache'},{origin:'unknown'},
     {recovered:true},{skipped:true},{dryRun:true},{needsVerification:true},{dispatchAttempts:2},{dispatchAttempts:0},
     {previousMediaId:'old'}] as Partial<P>[])expect(runP(p).status).toBe('untrusted_origin')
 })
 it('requires bounded ordered timestamps and whole enrollment window',()=>{
   expect(runP({request:{startMs:start+1,endMs:start}}).status).toBe('invalid_interval')
   expect(runP({request:{startMs:start,endMs:start+120001},nowMs:start+120001}).status).toBe('invalid_interval')
   expect(runP({request:{startMs:start,endMs:start+1},nowMs:start}).status).toBe('invalid_interval')
   expect(runP({request:{startMs:start-1,endMs:start}}).status).toBe('outside_enrollment')
   expect(runP({request:{startMs:end-1,endMs:end},nowMs:end}).status).toBe('outside_enrollment')
 })
 it('keeps minimal candidate fields; no extra provider or credential fields read or stored',()=>{
   const e={...pe(),get token(){throw Error('token read')},get raw(){throw Error('raw read')}}
   const p=pub(gate,()=>e)
   expect(p.status).toBe('candidate_only');expect(JSON.stringify(p)).not.toMatch(/token|raw|permalink/)
   const m={...me(),result:{...me().result,get raw(){throw Error('raw read')}}}
   const v=measure(gate,publication(),()=>m)
   expect(v.status).toBe('candidate_only');expect(JSON.stringify(v)).not.toMatch(/raw|token/)
 })
 it('rejects wrong media/script, acquisition collision and missing publication',()=>{
   expect(runM({scriptId:uuid(4)}).status).toBe('invalid_identity')
   expect(runM({mediaId:'other'}).status).toBe('invalid_identity')
   expect(runM({acquisitionId:'pub-1'}).status).toBe('invalid_identity')
   const read=vi.fn(()=>me());expect(measure(gate,null,read).status).toBe('invalid_identity')
   expect(read).not.toHaveBeenCalled()
 })
 it('rejects malformed or out-of-enrollment prior publication without reading measurement',()=>{
   const p=publication(),read=vi.fn(()=>me())
   for(const patch of [{startMs:p.endMs+1},{endMs:p.startMs+120001},{projectId:uuid(9)},{mediaId:''}]){
     expect(measure(gate,{...p,...patch},read).status).toBe('invalid_identity')
   }
   expect(read).not.toHaveBeenCalled()
 })
 it('never accepts cache, account totals, failed fetch or combined responses',()=>{
   for(const p of [{origin:'cache'},{origin:'account_snapshot'},{origin:'unknown'},{singleResponseMetrics:false},
     {result:{ok:false,metrics:{views:1}}},{result:{ok:true}}] as Partial<M>[])expect(runM(p).status).toBe('untrusted_origin')
 })
 it('uses conservative age bounds; entire interval must fit inclusive 48–54 hours',()=>{
   const p=publication()
   const good={startMs:p.endMs+48*H,endMs:p.startMs+54*H}
   // Use short intervals at the exact lower and upper edges, not six-hour acquisition.
   for(const w of [{startMs:good.startMs,endMs:good.startMs+1000},{startMs:good.endMs-1000,endMs:good.endMs}]){
     const v=runM({request:w,nowMs:w.endMs})
     expect(v.status).toBe('candidate_only')
   }
   for(const w of [{startMs:good.startMs-1,endMs:good.startMs+1000},{startMs:good.endMs-1000,endMs:good.endMs+1}]){
     expect(runM({request:w,nowMs:w.endMs}).status).toBe('outside_age_window')
   }
 })
 it('rejects future, backwards, overlapping and overly wide measurement intervals',()=>{
   const p=publication()
   expect(runM({request:{startMs:p.endMs-1,endMs:p.endMs},nowMs:p.endMs}).status).toBe('invalid_interval')
   const w={startMs:p.endMs+48*H,endMs:p.endMs+48*H+60001}
   expect(runM({request:w,nowMs:w.endMs}).status).toBe('invalid_interval')
   expect(runM({nowMs:me().request.endMs-1}).status).toBe('invalid_interval')
 })
 it('preserves zero and missing metrics without claiming freshness, recorded time or provider observation',()=>{
   const v=runM();expect(v.status).toBe('candidate_only')
   expect(v.candidate).toMatchObject({views:0,reach:100,saves:0,shares:null,providerFreshness:'unknown',requiresTrustedSource:true})
   expect(v.candidate).not.toHaveProperty('recordedAtMs');expect(v.candidate).not.toHaveProperty('source')
   expect(v.authorizesPilot).toBe(false);expect(v.authorizesPublication).toBe(false)
   expect(runM({result:{ok:true,metrics:{}}}).candidate).toMatchObject({views:null,reach:null,saves:null,shares:null})
 })
 it('rejects negative, noninteger and unsafe metrics; exceptions stay closed',()=>{
   for(const views of [-1,1.1,NaN,Infinity,Number.MAX_SAFE_INTEGER+1])expect(runM({result:{ok:true,metrics:{views}}}).status).toBe('invalid_metrics')
   expect(pub(gate,()=>{throw Error('private detail') })).toEqual({status:'unavailable',candidate:null,authorizesPilot:false,authorizesPublication:false})
   expect(measure(gate,publication(),()=>{throw Error('private detail')})).toEqual({status:'unavailable',candidate:null,authorizesPilot:false,authorizesPublication:false})
 })
})