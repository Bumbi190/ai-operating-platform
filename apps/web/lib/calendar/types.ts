export const CALENDAR_TIME_ZONE = 'Europe/Stockholm' as const;
export type CalendarRange = {fromDate:string;toDateExclusive:string;timeZone:typeof CALENDAR_TIME_ZONE};
export type CalendarTime =
 | {kind:'timed';startUtc:string;endUtc:string|null;timeZone:typeof CALENDAR_TIME_ZONE}
 | {kind:'all_day';startDate:string;endDateExclusive:string;timeZone:typeof CALENDAR_TIME_ZONE};
export type CalendarEventDraft = {kind:'private'|'work_block';title:string;description:string;location:string;projectId:string|null;taskId:string|null;time:CalendarTime;workStatus:'planned'|'in_progress'|'done'|null;repeat?:{frequency:'daily'|'weekly';until:string|null}|null};
export type CalendarEvent = CalendarEventDraft & {id:string;version:number;status:'scheduled'|'cancelled';createdAt:string;updatedAt:string};
export type CalendarActor = {userId:string;allowedProjectIds:string[];projectScopeAvailable?:boolean};
export type CalendarSourceRef = {kind:'manual';eventId:string;version:number}|{kind:'social';projectId:string;postId:string;revisionId:string;sha256:string;jobId:string|null}|{kind:'workflow';projectId:string;instanceId:string}|{kind:'monthly';projectId:string;releaseMonth:string};
export type CalendarEntry = {id:string;source:CalendarSourceRef;title:string;time:CalendarTime;projectId:string|null;status:string;editable:boolean;href:string|null;manualEvent?:CalendarEvent;pendingChange:{time:CalendarTime;reviewHref:string}|null};
export type CalendarEventPage = {events:CalendarEvent[];truncated:boolean};
export type CalendarLayout = {days:{date:string;allDay:CalendarEntry[];timed:{entryId:string;startMinute:number;endMinute:number;column:number;columnCount:number;isPoint:boolean}[]}[]};
export type CalendarWeekModel = {range:CalendarRange;entries:CalendarEntry[];unscheduledTasks:{id:string;projectId:string;title:string;status:string}[];projects:{id:string;name:string;color:string}[];availability:{manual:boolean;social:boolean;workflows:boolean;tasks:boolean};truncated:{manual:boolean;social:boolean;workflows:boolean;tasks:boolean}};
export type CalendarMutation =
 | {operation:'create';eventId:string;idempotencyKey:string;draft:CalendarEventDraft}
 | {operation:'update';eventId:string;expectedVersion:number;idempotencyKey:string;draft:CalendarEventDraft}
 | {operation:'cancel'|'restore';eventId:string;expectedVersion:number;idempotencyKey:string};
export type CalendarDb = Awaited<ReturnType<typeof import('../supabase/server').createClient>>;
export type AdminDb = ReturnType<typeof import('../supabase/admin').createAdminClient>;
export type CalendarReadDeps = {sessionDb:CalendarDb;adminDb:AdminDb};
export type CalendarReceipt = {ok:true;mutationId:string;event:CalendarEvent;calendarHref:string};
export type CalendarFailure = {ok:false;code:'UNAUTHORIZED'|'NOT_FOUND'|'INVALID_INPUT'|'CONFLICT'|'UNAVAILABLE'};
export class CalendarError extends Error {
 constructor(readonly code:CalendarFailure['code']) {super(code);this.name='CalendarError';}
}
