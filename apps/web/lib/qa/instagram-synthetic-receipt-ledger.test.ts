import { describe, expect, it } from 'vitest'
import { createSyntheticReceiptLedger as create } from '../content-growth/instagram-synthetic-receipt-ledger'

const H=3_600_000, start=1000*H, end=start+14*24*H
const published=end-12*H
const scope={projectId:'synthetic-project',accountId:'synthetic-account',bindingId:'synthetic-binding'}
type Enrollment=Parameters<typeof create>[1][number]
type Receipt=Parameters<ReturnType<typeof create>['append']>[0]
const post=(entryId='e1',postId='p1',publishedAtMs:number|null=published):Enrollment=>({...scope,entryId,state:'published',postId,publishedAtMs})
const closed=(state:'cancelled'|'unpublished',entryId:string):Enrollment=>({...scope,entryId,state,postId:null,publishedAtMs:null})
const receipt=(receiptId='r1',age=48,patch:Partial<Receipt>={}):Receipt=>({...scope,receiptId,postId:'p1',origin:'synthetic_refresh',publishedAtMs:published,observedAtMs:published+age*H,views:0,reach:100,saves:null,shares:2,...patch})
const ledger=(entries:readonly Enrollment[]=[post()])=>create(scope,entries,start,end)
const at=(age:number)=>published+age*H

describe('synthetic append-only receipt ledger; not a real storage adapter',()=>{
 it('exact replay is idempotent and preserves first availability timestamp',()=>{
   const l=ledger(),r=receipt()
   expect(l.append(r,at(49))).toBe('retained')
   expect(l.append({...r},at(50))).toBe('replay')
   const f=l.finalize(l.cutoffMs+1)
   expect(f.retainedCount).toBe(1)
   expect(f.posts[0].recordedAtMs).toBe(at(49))
   expect(f.posts[0].candidate?.views).toBe(0)
   expect(f.posts[0].candidate?.saves).toBeNull()
 })
 it('conflicting replay halts instead of overwriting or finalizing a partial report',()=>{
   const l=ledger();l.append(receipt(),at(48))
   expect(()=>l.append(receipt('r1',48,{views:500}),at(49))).toThrow(/Conflicting/)
   expect(()=>l.append(receipt('r2',50),at(50))).toThrow(/halted/)
   expect(()=>l.finalize(l.cutoffMs+1)).toThrow(/conflicting_replay/)
 })
 it('selects earliest measurement, not earliest availability or most favorable counts',()=>{
   const l=ledger()
   l.append(receipt('later',50,{views:900,saves:10}),at(50))
   l.append(receipt('earlier',49,{views:0,saves:null}),at(51))
   const f=l.finalize(l.cutoffMs+1)
   expect(f.posts[0].candidate?.receiptId).toBe('earlier')
   expect(f.posts[0].recordedAtMs).toBe(at(51))
 })
 it('distinct acquisitions tied at earliest time are ambiguous',()=>{
   const l=ledger();l.append(receipt('a',49),at(49));l.append(receipt('b',49),at(50));l.append(receipt('c',51),at(51))
   expect(l.finalize(l.cutoffMs+1).posts[0].status).toBe('ambiguous_earliest')
 })
 it('accepts availability at inclusive cutoff and refuses later arrivals',()=>{
   const l=ledger();expect(l.cutoffMs).toBe(at(54))
   expect(l.append(receipt('a',54),l.cutoffMs)).toBe('retained')
   expect(l.append(receipt('b',48),l.cutoffMs+1)).toBe('after_cutoff')
   const f=l.finalize(l.cutoffMs+1)
   expect(f.posts[0].candidate?.receiptId).toBe('a')
   expect(f.retainedCount).toBe(1)
 })
 it('late-arriving earlier observations cannot backfill a missing post',()=>{
   const l=ledger();expect(l.append(receipt(),l.cutoffMs+1)).toBe('after_cutoff')
   expect(l.finalize(l.cutoffMs+1).posts[0].status).toBe('missing_at_cutoff')
 })
 it('refuses backdated availability and observations from the future',()=>{
   const l=ledger();l.append(receipt(),at(49))
   expect(()=>l.append(receipt('r2',48),at(48))).toThrow(/backwards/)
   expect(()=>l.append(receipt('r2',53),at(50))).toThrow(/receipt/)
 })
 it('does not seal before enrollment end or at inclusive cutoff',()=>{
   const l=ledger()
   expect(()=>l.finalize(l.cutoffMs)).toThrow(/not closed/)
   expect(l.append(receipt('r',54),l.cutoffMs)).toBe('retained')
   expect(l.finalize(l.cutoffMs+1).selectedCount).toBe(1)
   const early=ledger([post('e1','p1',start+H)])
   expect(early.cutoffMs).toBeLessThan(end)
   expect(()=>early.finalize(early.cutoffMs+1)).toThrow(/not closed/)
   expect(early.finalize(end).selectedCount).toBe(0)
 })
 it('keeps sealed result unchanged, rejects all subsequent appends',()=>{
   const l=ledger();l.append(receipt(),at(48))
   const f=l.finalize(l.cutoffMs+1)
   expect(l.append(receipt('late',49),l.cutoffMs+2)).toBe('sealed')
   expect(l.finalize(l.cutoffMs+3)).toBe(f)
   expect(f.retainedCount).toBe(1)
   expect(Object.isFrozen(f)).toBe(true)
   expect(Object.isFrozen(f.posts)).toBe(true)
   expect(Object.isFrozen(f.posts[0].candidate)).toBe(true)
   expect(Object.isFrozen(f.roster[0])).toBe(true)
 })
 it('copies inputs and never stores arbitrary source fields',()=>{
   const e={...post()},r={...receipt(),rawPayload:'synthetic-unused'}
   const l=create(scope,[e],start,end);e.publishedAtMs=start
   l.append(r,at(48));r.views=999;r.rawPayload='changed'
   const f=l.finalize(l.cutoffMs+1)
   expect(f.posts[0].candidate?.views).toBe(0)
   expect(f.roster[0].publishedAtMs).toBe(published)
   expect(JSON.stringify(f)).not.toContain('rawPayload')
 })
 it('reconciles cancelled/unpublished and retains missing published entries',()=>{
   const l=ledger([post(),post('e2','p2'),closed('cancelled','e3'),closed('unpublished','e4')])
   l.append(receipt(),at(48))
   const f=l.finalize(l.cutoffMs+1)
   expect(f.roster).toHaveLength(4)
   expect([f.publishedCount,f.cancelledCount,f.unpublishedCount,f.selectedCount]).toEqual([2,1,1,1])
   expect(f.posts.map(p=>p.status)).toEqual(['selected_candidate','missing_at_cutoff'])
   const empty=ledger([closed('cancelled','e1')]).finalize(end+1)
   expect(empty.publishedCount).toBe(0);expect(empty.selectedCount).toBe(0)
 })
 it('rejects unresolved planned entries, unknown publication time and duplicate IDs',()=>{
   expect(()=>ledger([{...closed('cancelled','e1'),state:'planned'}])).toThrow(/Unreconciled/)
   expect(()=>ledger([post('e1','p1',null)])).toThrow(/known original/)
   expect(()=>ledger([post(),post('e2','p1')])).toThrow(/unique post/)
   expect(()=>ledger([post(),closed('cancelled','e1')])).toThrow(/duplicate/)
   expect(()=>ledger([post('e1','p1',end)])).toThrow(/within enrollment/)
 })
 it('rejects mixed scopes, unrostered post, publication conflict and malformed counts',()=>{
   for(const k of ['projectId','accountId','bindingId'] as const){
     expect(()=>ledger([{...post(),[k]:'other'}])).toThrow(/mixed/)
     expect(()=>ledger().append(receipt('r',48,{[k]:'other'}),at(48))).toThrow(/mixed/)
   }
   expect(()=>ledger().append(receipt('r',48,{postId:'other'}),at(48))).toThrow(/mixed/)
   expect(()=>ledger().append(receipt('r',48,{publishedAtMs:published-1}),at(48))).toThrow(/Conflicting/)
   expect(()=>ledger().append(receipt('r',48,{views:-1}),at(48))).toThrow(/receipt/)
 })
 it('never retains cache, account totals, unknown timestamps or outside age',()=>{
   const l=ledger()
   for(const r of [receipt('cache',48,{origin:'cache_only'}),receipt('account',48,{origin:'account_level'}),receipt('unknown',48,{observedAtMs:null}),receipt('early',47)])expect(l.append(r,at(48))).toBe('not_eligible')
   expect(l.finalize(l.cutoffMs+1).retainedCount).toBe(0)
 })
 it('bounds roster and receipts without silently truncating final report',()=>{
   expect(()=>ledger(Array.from({length:201},(_,i)=>closed('cancelled','e'+i)))).toThrow(/enrollment/)
   const l=ledger()
   for(let i=0;i<800;i++)expect(l.append(receipt('r'+i),at(48))).toBe('retained')
   expect(l.append(receipt('r0'),at(48))).toBe('replay')
   expect(()=>l.append(receipt('overflow'),at(48))).toThrow(/cap reached/)
   expect(()=>l.finalize(l.cutoffMs+1)).toThrow(/capacity_exceeded/)
 })
 it('never emits production observations, authorization or verified provenance',()=>{
   const l=ledger();l.append(receipt(),at(48))
   const f=l.finalize(l.cutoffMs+1)
   expect(f.mode).toBe('synthetic_memory_only');expect(f.evidence).toBe('not_verified')
   expect(f.requiresTrustedSource).toBe(true)
   expect(f.authorizesPilot).toBe(false);expect(f.authorizesPublication).toBe(false)
   expect(f.posts[0].candidate).not.toHaveProperty('source')
 })
})