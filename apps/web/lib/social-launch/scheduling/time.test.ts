import {it,expect} from 'vitest'
import {resolveStockholmSchedule,monthlyReleaseSlot} from './time'
it('resolves_both_sides_of_the_october_clock_change',()=>{
 expect(resolveStockholmSchedule('2026-10-23T17:00')).toBe('2026-10-23T15:00:00.000Z')
 expect(resolveStockholmSchedule('2026-10-27T17:00')).toBe('2026-10-27T16:00:00.000Z')
 for(const value of ['2026-10-25T02:30','2027-03-28T02:30','2026-02-30T17:00','2026-10-23 17:00','2026-10-23T24:00'])expect(()=>resolveStockholmSchedule(value)).toThrow()
 expect(monthlyReleaseSlot('2027-01')).toEqual({releaseMonth:'2027-01',localMinute:'2027-01-01T20:30',scheduledAt:'2027-01-01T19:30:00.000Z',requiresReleaseEvidence:true})
 expect(()=>monthlyReleaseSlot('2026-13')).toThrow()
})
