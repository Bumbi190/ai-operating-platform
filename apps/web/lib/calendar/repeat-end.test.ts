import {it,expect} from 'vitest';
import {repeatDates} from './repeat';
it('keeps past sessions but drops future sessions when recurrence gets an end date',()=>{
 const sessions=repeatDates('2026-10-05',{frequency:'weekly',until:'2026-10-19'},'2026-10-05','2026-11-02');
 expect(sessions).toEqual(['2026-10-05','2026-10-12','2026-10-19']);
});
