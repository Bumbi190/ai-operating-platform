import {it,expect} from 'vitest';
import {readCalendarDecisions} from './source-decisions';
const range={fromDate:'2026-10-19',toDateExclusive:'2026-10-26',timeZone:'Europe/Stockholm'} as const;
it('does not fetch any decision if there is no authorized project',async()=>{
 let called=false;
 const result=await readCalendarDecisions({userId:'owner',allowedProjectIds:[]},range,{byProject:async()=>{called=true;return [];}});
 expect(called).toBe(false);expect(result).toEqual({decisions:[],available:true,truncated:false});
});
it('denies an unavailable project scope before querying',async()=>{
 let called=false;
 const result=await readCalendarDecisions({userId:'owner',allowedProjectIds:['a'],projectScopeAvailable:false},range,{byProject:async()=>{called=true;return [];}});
 expect(called).toBe(false);expect(result.available).toBe(false);
});
it('does not claim a failed source read succeeded',async()=>{
 const result=await readCalendarDecisions({userId:'owner',allowedProjectIds:['a']},range,{byProject:async()=>{throw Error('unavailable');}});
 expect(result.available).toBe(false);expect(result.decisions).toEqual([]);
});
