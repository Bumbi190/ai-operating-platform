import {it,expect} from 'vitest';
import {projectManualOccurrences} from './occurrences';
import type {CalendarEvent} from './types';
it('does not crash the week if one daily occurrence falls in the spring DST gap',()=>{
 const event:CalendarEvent={id:'10000000-0000-4000-8000-000000000001',kind:'private',title:'Nattpass',description:'',location:'',projectId:null,taskId:null,workStatus:null,repeat:{frequency:'daily',until:'2026-03-30'},time:{kind:'timed',startUtc:'2026-03-27T01:30:00.000Z',endUtc:null,timeZone:'Europe/Stockholm'},version:1,status:'scheduled',createdAt:'2026-03-27T01:30:00.000Z',updatedAt:'2026-03-27T01:30:00.000Z'};
 const entries=projectManualOccurrences([event],{fromDate:'2026-03-23',toDateExclusive:'2026-03-31',timeZone:'Europe/Stockholm'});
 expect(entries.map(e=>e.id)).not.toContain('manual:'+event.id+':2026-03-29');
 expect(entries.map(e=>e.id)).toContain('manual:'+event.id+':2026-03-30');
});