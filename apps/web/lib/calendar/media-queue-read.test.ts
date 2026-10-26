import {expect,it,vi} from 'vitest';
import {readCalendarWeek} from './read';
import {readCalendarMediaQueue} from './source-media-queue';
import {listCalendarEvents} from './store';
import type {CalendarReadDeps} from './types';
vi.mock('./store',()=>({listCalendarEvents:vi.fn(async()=>({events:[],truncated:false}))}));
vi.mock('./source-social',()=>({readCalendarSocial:async()=>({entries:[{id:'existing-family'}],available:true,truncated:false})}));
vi.mock('./source-workflows',()=>({readCalendarWorkflows:async()=>({entries:[],options:[],instances:[],truncated:false})}));
vi.mock('./source-tasks',()=>({readCalendarTasks:async()=>({tasks:[],truncated:false})}));
vi.mock('./source-media-queue',()=>({readCalendarMediaQueue:vi.fn(async()=>({projectId:'p',available:true,truncated:false,readAt:'2026-10-26T10:00:00.000Z',items:[{scriptId:'script'}]}))}));
const actor={userId:'u',allowedProjectIds:['p']},range={fromDate:'2026-10-26',toDateExclusive:'2026-11-02',timeZone:'Europe/Stockholm' as const};
const deps={sessionDb:{},adminDb:{from:()=>({select:()=>({in:()=>({eq:()=>({order:async()=>({data:[],error:null})})})})})}} as unknown as CalendarReadDeps;
it('keeps current queue out of dated entries and retains other sources on queue failure',async()=>{
 const healthy=await readCalendarWeek(deps,actor,range);expect(healthy.mediaQueue?.items).toEqual([{scriptId:'script'}]);expect(healthy.entries.map(e=>e.id)).toEqual(['existing-family']);
 vi.mocked(readCalendarMediaQueue).mockRejectedValueOnce(Error('SECRET'));const degraded=await readCalendarWeek(deps,actor,range);
 expect(degraded.mediaQueue).toMatchObject({available:false,items:[]});expect(degraded.entries.map(e=>e.id)).toEqual(['existing-family']);expect(degraded.availability.manual).toBe(true);expect(JSON.stringify(degraded)).not.toContain('SECRET');expect(listCalendarEvents).toHaveBeenCalled();
});
