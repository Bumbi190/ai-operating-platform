import {describe,it,expect} from 'vitest';
import {projectManualOccurrences} from './occurrences';
import type {CalendarEvent} from './types';
const event:CalendarEvent={id:'10000000-0000-4000-8000-000000000001',kind:'private',title:'Gym',description:'',location:'',projectId:null,taskId:null,workStatus:null,
 time:{kind:'timed',startUtc:'2026-10-19T07:00:00.000Z',endUtc:null,timeZone:'Europe/Stockholm'},version:1,status:'scheduled',createdAt:'2026-10-19T07:00:00.000Z',updatedAt:'2026-10-19T07:00:00.000Z'};
const range={fromDate:'2026-10-19',toDateExclusive:'2026-10-26',timeZone:'Europe/Stockholm'} as const;
describe('bounded recurrence projections',()=>{
 it('does not alter legacy one-off identity',()=>{const e=projectManualOccurrences([event],range);expect(e).toHaveLength(1);expect(e[0].id).toBe('manual:'+event.id);});
 it('expands daily but references the same versioned series',()=>{const e=projectManualOccurrences([{...event,repeat:{frequency:'daily',until:'2026-10-21'}}],range);expect(e.map(x=>x.id)).toEqual(['manual:'+event.id+':2026-10-19','manual:'+event.id+':2026-10-20','manual:'+event.id+':2026-10-21']);expect(e.every(x=>x.source.kind==='manual'&&x.source.eventId===event.id)).toBe(true);});
 it('keeps weekly meetings at local 09 across the DST boundary',()=>{const e=projectManualOccurrences([{...event,repeat:{frequency:'weekly',until:null}}],{...range,fromDate:'2026-10-26',toDateExclusive:'2026-11-02'});expect(e).toHaveLength(1);expect(e[0].time).toMatchObject({startUtc:'2026-10-26T08:00:00.000Z'});});
});