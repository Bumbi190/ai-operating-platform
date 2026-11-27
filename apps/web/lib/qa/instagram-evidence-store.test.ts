import {describe,it,expect,vi} from 'vitest'
import {flushLocalInstagramEvidence as flush,type LocalEvidenceWrite,prepareLocalInstagramEvidenceQueue as prepareQueue,enqueueLocalInstagramEvidence as enqueueQueue,type LocalEvidenceQueueCommand} from '../content-growth/instagram-evidence-store'
import type {createLocalInstagramEvidenceSession} from '../content-growth/instagram-evidence-hooks'
type Snapshot=ReturnType<ReturnType<typeof createLocalInstagramEvidenceSession>['snapshot']>
const uuid=(n:number)=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0')
const H=3600000,base=1000*H
const scope={projectId:uuid(1),bindingId:uuid(2),accountId:'synthetic-account',platform:'instagram' as const}
const target={...scope,batchId:'synthetic-batch',owner:'synthetic-owner',startMs:base-1000,endMs:base+H}
const p:Snapshot['publications'][number]={...scope,kind:'publication_interval_candidate',evidence:'unverified_local_interval',
 acquisitionId:uuid(3),scriptId:uuid(4),mediaId:'synthetic-media',startMs:base,endMs:base+1000}
const m:Snapshot['measurements'][number]={...scope,kind:'measurement_interval_candidate',evidence:'unverified_local_interval',
 acquisitionId:uuid(5),publicationAcquisitionId:p.acquisitionId,scriptId:p.scriptId,mediaId:p.mediaId,
 requestStartMs:base+49*H,responseEndMs:base+49*H+1000,lowerAgeMs:49*H-1000,upperAgeMs:49*H+1000,
 views:0,reach:100,saves:null,shares:2,providerFreshness:'unknown',requiresTrustedSource:true}
const snap:Snapshot={mode:'local_unverified_only',halted:false,publications:[p],measurements:[m],authorizesPilot:false}
describe('unmounted store boundary',()=>{
 it('keeps original IDs and sends publications first, then measurements, minimal fields',async()=>{
  const write=vi.fn(async (_c:LocalEvidenceWrite)=>'retained_unverified')
  const input={...snap,publications:[{...p,rawPayload:'omit'}],measurements:[{...m,token:'omit'}]}
  expect(await flush(target,input,write)).toEqual({status:'complete_unverified',reason:null,retained:2,replayed:0,requiresTrustedSource:true,authorizesPilot:false})
  expect(write.mock.calls.map(([c])=>c.candidate.acquisitionId)).toEqual([p.acquisitionId,m.acquisitionId])
  expect(write.mock.calls[1][0].candidate).toEqual(m)
  expect(JSON.stringify(write.mock.calls)).not.toMatch(/rawPayload|token/)
 })
 it('replays same envelope IDs without minting new acquisitions',async()=>{
  const write=vi.fn(async (_c:LocalEvidenceWrite)=>'replay')
  expect((await flush(target,JSON.parse(JSON.stringify(snap)),write)).replayed).toBe(2)
  expect(write.mock.calls.map(([c])=>c.candidate.acquisitionId)).toEqual([p.acquisitionId,m.acquisitionId])
 })
 it('validates the whole envelope before any write',async()=>{
  const write=vi.fn()
  for(const bad of [{...m,lowerAgeMs:1},{...m,mediaId:'other'},{...m,bindingId:uuid(8)},{...m,acquisitionId:p.acquisitionId},{...m,views:undefined},{...m,providerFreshness:'verified'}]){
   expect((await flush(target,{...snap,measurements:[bad as typeof m]},write)).status).toBe('invalid_envelope')
  }
  expect(write).not.toHaveBeenCalled()
 })
 it('rejects halted sessions, duplicates, foreign target and absent publication',async()=>{
  const write=vi.fn()
  for(const s of [{...snap,halted:true},{...snap,publications:[p,p]},{...snap,measurements:[m,m]},{...snap,publications:[]}]){
   expect((await flush(target,s,write)).status).toBe('invalid_envelope')
  }
  expect((await flush({...target,projectId:uuid(9)},snap,write)).status).toBe('invalid_envelope')
  expect(write).not.toHaveBeenCalled()
 })
 it('stops on refusal, returns committed-prefix counts and no automatic retry',async()=>{
  const write=vi.fn().mockResolvedValueOnce('retained_unverified').mockResolvedValueOnce('denied_scope')
  expect(await flush(target,snap,write)).toMatchObject({status:'stopped',reason:'denied_scope',retained:1,replayed:0,authorizesPilot:false})
  expect(write).toHaveBeenCalledTimes(2)
 })
 it('transport exception or unknown reply stays uncertain without raw error leakage',async()=>{
  const err=vi.fn().mockResolvedValueOnce('retained_unverified').mockRejectedValueOnce(Error('synthetic private detail'))
  expect(await flush(target,snap,err)).toMatchObject({status:'uncertain',reason:'transport_error',retained:1})
  const unknown=vi.fn().mockResolvedValue('secret-like unexpected reply')
  expect(await flush(target,snap,unknown)).toMatchObject({status:'uncertain',reason:'unexpected_reply',retained:0})
  expect(unknown).toHaveBeenCalledTimes(1)
 })
 it('bounds collections and rejects out-of-window measurement even when age fields agree',async()=>{
  const write=vi.fn()
  expect((await flush(target,{...snap,publications:Array(201).fill(p)},write)).status).toBe('invalid_envelope')
  expect((await flush(target,{...snap,measurements:Array(801).fill(m)},write)).status).toBe('invalid_envelope')
  const early={...m,requestStartMs:base+47*H,responseEndMs:base+47*H,lowerAgeMs:47*H-1000,upperAgeMs:47*H}
  expect((await flush(target,{...snap,measurements:[early]},write)).status).toBe('invalid_envelope')
  expect(write).not.toHaveBeenCalled()
 })
})

describe('local atomic outbox handoff',()=>{
 it('cleans the complete snapshot and preserves original capture IDs with one queue call',async()=>{
  const input={...snap,publications:[{...p,rawPayload:'omit'}],measurements:[{...m,token:'omit'}]}
  const command=prepareQueue(target,input)
  expect(command.eventKey).toMatch(/^[a-f0-9]{64}$/)
  expect(command.envelope.snapshot).toEqual(snap)
  expect(Object.isFrozen(command.envelope.snapshot.measurements[0])).toBe(true)
  expect(JSON.stringify(command)).not.toMatch(/rawPayload|token/)
  const write=vi.fn(async (_c:LocalEvidenceQueueCommand)=>'queued')
  expect(await enqueueQueue(command,write)).toEqual({status:'queued_unverified',reason:null,requiresTrustedSource:true,authorizesPilot:false})
  expect(write).toHaveBeenCalledTimes(1)
  expect(write).toHaveBeenCalledWith(command)
 })
 it('same immutable retry has same key; changed metrics with same acquisition IDs conflict at storage',async()=>{
  const command=prepareQueue(target,snap)
  const replay=JSON.parse(JSON.stringify(command))
  const changed=prepareQueue(target,{...snap,measurements:[{...m,views:9}]})
  expect(changed.eventKey).toBe(command.eventKey)
  expect(changed.envelope).not.toEqual(command.envelope)
  expect(prepareQueue(target,{...snap,measurements:[{...m,acquisitionId:uuid(99)}]}).eventKey).not.toBe(command.eventKey)
  const write=vi.fn().mockResolvedValueOnce('replay').mockResolvedValueOnce('conflict')
  expect((await enqueueQueue(replay,write)).status).toBe('replayed_unverified')
  expect(await enqueueQueue(changed,write)).toMatchObject({status:'stopped',reason:'conflict'})
 })
 it('canonical ordering makes equivalent input order produce identical command',()=>{
  const next={...m,acquisitionId:uuid(6)}
  expect(prepareQueue(target,{...snap,measurements:[next,m]})).toEqual(prepareQueue(target,{...snap,measurements:[m,next]}))
 })
 it('rejects empty, wrong key, malformed envelope and invalid IDs before queue call',async()=>{
  const command=prepareQueue(target,snap)
  const write=vi.fn()
  expect(()=>prepareQueue(target,{...snap,publications:[],measurements:[]})).toThrow()
  expect(()=>prepareQueue(target,{...snap,publications:[{...p,scriptId:'AAAAAAAA-0000-4000-8000-000000000004'}],measurements:[]})).toThrow()
  expect((await enqueueQueue({...command,eventKey:'wrong'},write)).status).toBe('invalid_envelope')
  expect((await enqueueQueue({...command,envelope:{target,snapshot:{...snap,halted:true}}},write)).status).toBe('invalid_envelope')
  expect(write).not.toHaveBeenCalled()
 })
 it('transport uncertainty never retries automatically or leaks raw errors',async()=>{
  const command=prepareQueue(target,snap)
  const write=vi.fn().mockRejectedValueOnce(Error('private')).mockResolvedValueOnce({secret:'unexpected'})
  expect(await enqueueQueue(command,write)).toMatchObject({status:'uncertain',reason:'transport_error'})
  expect(write).toHaveBeenCalledTimes(1)
  expect(await enqueueQueue(command,write)).toMatchObject({status:'uncertain',reason:'unexpected_reply'})
  expect(write).toHaveBeenCalledTimes(2)
 })
})
