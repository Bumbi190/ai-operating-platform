import {beforeEach,describe,expect,it,vi} from 'vitest'
import {randomUUID} from 'node:crypto'
import type {ProjectAccessOk} from '@/lib/auth/project-access'
const state=vi.hoisted(()=>({calls:[] as Array<Record<string,string>>,failedTicket:''}))
vi.mock('./read',()=>({readVerifiedReference:async(_db:unknown,_owner:unknown,ref:Record<string,string>)=>{
  state.calls.push(ref)
  if(ref.ticketId===state.failedTicket)
    throw Object.assign(new Error('missing'),{code:'NOT_FOUND',status:404})
  return {assetId:ref.ticketId,bytes:Uint8Array.from([82,73,70,70]),mimeType:'image/webp'}
}}))
import {prepareReferenceTurn,parseTurnReferenceSelection} from './turn-references'

const ownerId=randomUUID(),projectId=randomUUID(),conversationId=randomUUID(),turnId=randomUUID()
const first=randomUUID(),second=randomUUID(),third=randomUUID(),fourth=randomUUID()
const selection={projectId,conversationId,turnId,messageText:'Create a site inspired by these design images.',ticketIds:[first,second]}
const owner:ProjectAccessOk={ok:true,userId:ownerId,allowedProjectIds:[projectId]}
const active={projectId,conversationId,turnId,messageText:selection.messageText}
const db={} as never
beforeEach(()=>{
  vi.stubEnv('ATLAS_REFERENCE_UPLOAD_ENABLED','true')
  state.calls=[];state.failedTicket=''
})
describe('exact-turn reference preflight',()=>{
  it('rejects duplicates, URLs, unknown fields, missing content or empty refs',()=>{
    for(const bad of [
      {...selection,ownerId}, {...selection,storageUrl:'https://evil.example/a.png'},
      {...selection,turnId:'bad'},
      {...selection,projectId:'bad'},
      {...selection,messageText:''},
      {...selection,messageText:'x'.repeat(10001)},
      {...selection,ticketIds:[]},
      {...selection,ticketIds:[first,first]},
      {...selection,ticketIds:[first,second,third,fourth,randomUUID()]},
      {...selection,ticketIds:['https://example.com/image.png']},
    ])expect(()=>parseTurnReferenceSelection(bad)).toThrow()
    expect(parseTurnReferenceSelection(selection)).toEqual(selection)
  })
  it('refuses stale/future message identity, switched project, changed text before storage',async()=>{
    for(const wrong of [
      {...active,turnId:randomUUID()},
      {...active,conversationId:randomUUID()},
      {...active,projectId:randomUUID()},
      {...active,messageText:selection.messageText+' '},
    ])await expect(prepareReferenceTurn(db,owner,selection,wrong))
      .rejects.toMatchObject({code:'NOT_FOUND'})
    await expect(prepareReferenceTurn(db,{...owner,allowedProjectIds:[]},selection,active))
      .rejects.toMatchObject({code:'NOT_FOUND'})
    expect(state.calls).toHaveLength(0)
  })
  it('never dispatches private images while the feature is disabled',async()=>{
    vi.stubEnv('ATLAS_REFERENCE_UPLOAD_ENABLED','false')
    await expect(prepareReferenceTurn(db,owner,selection,active))
      .rejects.toMatchObject({code:'REFERENCE_UNAVAILABLE'})
    expect(state.calls).toHaveLength(0)
  })
  it('resolves only the requested tickets, in turn order, with opaque verifiable receipts',async()=>{
    const expected=await prepareReferenceTurn(db,owner,selection,active)
    expect(expected.images).toHaveLength(2)
    expect(expected.images.map(x=>x.ticketId)).toEqual([first,second])
    expect(expected.images.map(x=>x.assetId)).toEqual([first,second])
    expect(expected.images.every(x=>x.mimeType==='image/webp')).toBe(true)
    expect(expected.messageSha256).toMatch(/^[a-f0-9]{64}$/)
    expect(expected.referenceSha256).toMatch(/^[a-f0-9]{64}$/)
    expect(state.calls).toEqual([first,second].map(ticketId=>({projectId,conversationId,ticketId})))
    const swapped=await prepareReferenceTurn(db,owner,{...selection,ticketIds:[second,first]},active)
    expect(swapped.referenceSha256).not.toBe(expected.referenceSha256)
  })
  it('rejects entire preflight if one attachment fails, never silently drops the failed image',async()=>{
    state.failedTicket=second
    await expect(prepareReferenceTurn(db,owner,selection,active))
      .rejects.toMatchObject({code:'NOT_FOUND'})
    expect(state.calls.map(x=>x.ticketId)).toEqual([first,second])
  })
  it('enforces exactly up to four verified reference images',async()=>{
    const all={...selection,ticketIds:[first,second,third,fourth]}
    const result=await prepareReferenceTurn(db,owner,all,active)
    expect(result.images).toHaveLength(4)
    expect(state.calls).toHaveLength(4)
  })
})
