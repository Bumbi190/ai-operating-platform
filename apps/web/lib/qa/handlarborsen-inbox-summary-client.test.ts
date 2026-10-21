import { afterEach, describe, expect, it, vi } from 'vitest'
import { createInboxSummaryResource, parseInboxSummary, inboxLinks, type InboxSummaryState } from '@/lib/atlas/project-analytics/handlarborsen-inbox-summary-client'
afterEach(() => vi.useRealTimers())
const ok = (unreadCount=1,totalCount=2) => new Response(JSON.stringify({status:'ok',unreadCount,totalCount}))
describe('personal inbox summary resource', () => {
  it('accepts only exact bounded counts and rejects malformed or evidence-bearing payloads', () => {
    expect(parseInboxSummary({status:'ok',unreadCount:0,totalCount:0})).toEqual({status:'ok',unreadCount:0,totalCount:0})
    for (const input of [null, [], {status:'ok',unreadCount:2,totalCount:1},
      {status:'ok',unreadCount:-1,totalCount:1}, {status:'ok',unreadCount:0.5,totalCount:1},
      {status:'ok',unreadCount:0,totalCount:31}, {status:'ok',unreadCount:0,totalCount:0,recipient:'other'}]) {
      expect(parseInboxSummary(input)).toEqual({status:'unavailable'})
    }
  })
  it('uses the exact role route, credentials and no shared cache', async () => {
    for (const audience of ['owner','collaborator'] as const) {
      const states: InboxSummaryState[] = []
      const request = vi.fn(async () => ok())
      const resource = createInboxSummaryResource(audience, state => states.push(state), {fetch:request,now:()=>0})
      await resource.refresh()
      expect(request).toHaveBeenCalledWith(inboxLinks[audience].api, expect.objectContaining({method:'GET',credentials:'same-origin',cache:'no-store'}))
      expect(states).toEqual([{status:'loading'},{status:'ok',unreadCount:1,totalCount:2}])
      resource.dispose()
    }
    expect(inboxLinks.collaborator.page).toBe('/organization/projects/handlarborsen/competitors#hb-atlas-inbox-title')
  })
  it('throttles focus refresh, but explicit open and receipts invalidate immediately', async () => {
    let now = 0
    const states: InboxSummaryState[] = []
    let calls = 0
    const resource = createInboxSummaryResource('owner',state=>states.push(state),{
      now:()=>now,fetch:async()=>{calls++;return ok(calls===1?1:0)},
    })
    await resource.refresh()
    now = 29_999
    await resource.refresh()
    expect(calls).toBe(1)
    await resource.refresh(true)
    expect(states.at(-1)).toEqual({status:'ok',unreadCount:0,totalCount:2})
    now += 30_000
    await resource.refresh()
    expect(calls).toBe(3)
    resource.dispose()
  })
  it.each([401,403,404,409])('hides a revoked, signed-out or disabled inbox (%s)', async status => {
    const states: InboxSummaryState[]=[]
    const resource=createInboxSummaryResource('collaborator',s=>states.push(s),{
      fetch:async()=>new Response('{}',{status}),now:()=>0,
    })
    await resource.refresh()
    expect(states.at(-1)).toEqual({status:'hidden'})
    resource.dispose()
  })
  it('replaces a former positive count with unknown on network and service failure', async () => {
    const states: InboxSummaryState[]=[]
    let count=0
    const resource=createInboxSummaryResource('owner',s=>states.push(s),{
      fetch:async()=>{if(count++===0)return ok();throw Error('offline')},now:()=>0,
    })
    await resource.refresh()
    await resource.refresh(true)
    expect(states.at(-1)).toEqual({status:'unavailable'})
    resource.dispose()
  })
  it('ignores an older response after a receipt starts a fresh read', async () => {
    let resolveOld!: (response:Response)=>void
    let calls=0
    const states: InboxSummaryState[]=[]
    const resource=createInboxSummaryResource('owner',s=>states.push(s),{
      fetch:async()=>++calls===1?new Promise<Response>(resolve=>{resolveOld=resolve}):ok(0),now:()=>0,
    })
    const old=resource.refresh()
    await resource.refresh(true)
    resolveOld(ok(2))
    await old
    expect(states.at(-1)).toEqual({status:'ok',unreadCount:0,totalCount:2})
    resource.dispose()
  })
  it('aborts on disposal without publishing another state', async () => {
    let resolve!: (response:Response)=>void
    let signal:AbortSignal|undefined
    const states: InboxSummaryState[]=[]
    const resource=createInboxSummaryResource('owner',s=>states.push(s),{
      fetch:async(_url,options)=>{signal=options?.signal as AbortSignal;return new Promise<Response>(r=>{resolve=r})},now:()=>0,
    })
    const pending=resource.refresh()
    resource.dispose()
    expect(signal?.aborted).toBe(true)
    resolve(ok())
    await pending
    expect(states).toEqual([{status:'loading'}])
  })
  it('terminates a hung read as unknown after ten seconds', async () => {
    vi.useFakeTimers()
    const states: InboxSummaryState[]=[]
    const resource=createInboxSummaryResource('owner',s=>states.push(s),{
      fetch:async(_url,options)=>new Promise<Response>((_resolve,reject)=>{
        options?.signal?.addEventListener('abort',()=>reject(Error('aborted')))
      }),now:()=>0,
    })
    const pending=resource.refresh()
    await vi.advanceTimersByTimeAsync(10_000)
    await pending
    expect(states.at(-1)).toEqual({status:'unavailable'})
    resource.dispose()
  })
})
