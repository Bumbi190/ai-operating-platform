
import {it,expect} from 'vitest'
import {monthlyPlanningSlots} from './planning'
it('keeps January own year and catalog, and never copies December content forward',()=>{
 const batches:any[]=[{batchId:'december',status:'approved',manifest:{items:[{kind:'month_release',releaseCondition:{releaseMonth:'2026-12',catalogSha256:'d'.repeat(64)}}]}}]
 const slots=monthlyPlanningSlots('2026-11-20T10:00:00.000Z',batches)
 expect(slots).toHaveLength(6);expect(slots[0]).toMatchObject({releaseMonth:'2026-12',catalogSha256:'d'.repeat(64)})
 expect(slots[1]).toMatchObject({releaseMonth:'2027-01',localMinute:'2027-01-01T20:30',catalogSha256:null,status:'unprepared'})
 expect(slots[1].scheduledAt).toBe('2027-01-01T19:30:00.000Z')
})
