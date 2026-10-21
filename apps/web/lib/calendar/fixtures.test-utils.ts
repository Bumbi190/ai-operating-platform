import {randomUUID} from 'node:crypto';
import type {CalendarEventDraft,CalendarMutation} from './types';
export const fixtureDraft=(patch:Partial<CalendarEventDraft>={}):CalendarEventDraft=>({
 kind:'private',title:'Möte med Oscar',description:'Privat anteckning',location:'',projectId:null,taskId:null,
 time:{kind:'timed',startUtc:'2026-10-22T12:00:00.000Z',endUtc:'2026-10-22T13:00:00.000Z',timeZone:'Europe/Stockholm'},workStatus:null,...patch
});
export const fixtureCreate=(patch:Partial<CalendarEventDraft>={}):CalendarMutation=>({operation:'create',eventId:randomUUID(),idempotencyKey:randomUUID(),draft:fixtureDraft(patch)});
export const fixtureRange={fromDate:'2026-10-19',toDateExclusive:'2026-10-26',timeZone:'Europe/Stockholm'} as const;
