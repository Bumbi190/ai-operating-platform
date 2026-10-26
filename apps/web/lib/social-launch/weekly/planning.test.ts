import {it,expect} from 'vitest'
import {planMarketingWeek} from './planning'
const now='2026-10-26T10:00:00Z'
const occasion=(time:string,channels:('facebook'|'instagram')[]=['facebook','instagram'],kind:'ordinary'|'month_release'='ordinary')=>({key:time,scheduledAt:time,channels,kind,sourcePostIds:['post']})
it('leaves full Wednesday/Sunday weeks alone and merges duplicate sources',()=>{
 const a=occasion('2026-10-28T19:30:00Z'),b=occasion('2026-11-01T19:30:00Z')
 const r=planMarketingWeek('2026-10-26',now,[a,a,b],false)
 expect(r.slots).toEqual([]);expect(r.existing).toHaveLength(2)
})
it('adds only Friday to a Wednesday week and reports a missing channel without filling it',()=>{
 const r=planMarketingWeek('2026-10-26',now,[occasion('2026-10-28T19:30:00Z',['facebook'])],false)
 expect(r.slots.map(s=>s.localMinute)).toEqual(['2026-10-30T20:30']);expect(r.missing).toContain('existing_channel_missing:2026-10-28T19:30:00.000Z:instagram')
})
it('offers two ordinary occasions and an enabled monthly third occasion',()=>{
 const r=planMarketingWeek('2026-10-26',now,[],true)
 expect(r.slots.map(s=>s.localMinute)).toEqual(['2026-10-27T17:00','2026-10-30T20:30','2026-11-01T20:30'])
 expect(r.slots[2].releaseMonth).toBe('2026-11');expect(r.slots[0].scheduledAt).toBe('2026-10-27T16:00:00.000Z')
})
it('skips elapsed defaults and handles the ISO year boundary',()=>{
 expect(planMarketingWeek('2026-10-26','2026-10-29T12:00:00Z',[],false).slots).toHaveLength(1)
 const r=planMarketingWeek('2026-12-28','2026-12-27T12:00:00Z',[],true)
 expect(r.weekEndExclusive).toBe('2027-01-04');expect(r.slots).toHaveLength(2)
 expect(r.slots.find(s=>s.releaseMonth==='2027-01')?.localMinute).toBe('2027-01-01T20:30')
})
it('rejects malformed non-Monday and out-of-horizon input and ignores other weeks',()=>{
 for(const date of ['2026-02-30','2026-10-27','2028-01-03'])expect(()=>planMarketingWeek(date,now,[],false)).toThrow()
 expect(planMarketingWeek('2026-10-26',now,[occasion('2026-11-08T19:30:00Z')],false).existing).toEqual([])
})
