import {it,expect} from 'vitest';
import {projectManualOccurrences} from './occurrences';
import type {CalendarEvent} from './types';
const event:CalendarEvent={id:'10000000-0000-4000-8000-000000000009',kind:'private',title:'Nattpass',description:'',location:'',projectId:null,taskId:null,workStatus:null,repeat:{frequency:'weekly',until:null},time:{kind:'timed',startUtc:'2026-10-18T20:00:00.000Z',endUtc:'2026-10-19T01:00:00.000Z',timeZone:'Europe/Stockholm'},version:1,status:'scheduled',createdAt:'2026-10-18T20:00:00.000Z',updatedAt:'2026-10-18T20:00:00.000Z'};
it('projects an overnight occurrence that begins on Sunday and overlaps Monday',()=>{
 const entries=projectManualOccurrences([event],{fromDate:'2026-10-19',toDateExclusive:'2026-10-26',timeZone:'Europe/Stockholm'});
 expect(entries.some(x=>x.id.endsWith('2026-10-18'))).toBe(true);
});
