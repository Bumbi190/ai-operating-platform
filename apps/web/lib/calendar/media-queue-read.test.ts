import {expect,it,vi} from 'vitest';
import {readCalendarWeek} from './read';
import {readCalendarMediaEvents} from './source-media-events';
import {listCalendarEvents} from './store';
import type {CalendarReadDeps} from './types';
vi.mock('./store',()=>({listCalendarEvents:vi.fn(async()=>({events:[],truncated:false}))}));
vi.mock('./source-social',()=>({readCalendarSocial:async()=>({entries:[{id:'existing-family'}],available:true,truncated:false})}));
vi.mock('./source-workflows',()=>({readCalendarWorkflows:async()=>({entries:[],options:[],instances:[],truncated:false})}));
vi.mock('./source-tasks',()=>({readCalendarTasks:async()=>({tasks:[],truncated:false})}));
vi.mock('./source-media-events',()=>({emptyMediaEvents:(available=true)=>({available,truncated:false,entries:[],undated:[]}),readCalendarMediaEvents:vi.fn(async()=>({available:true,truncated:false,undated:[],entries:[{id:'media-script'}]}))}));
const actor={userId:'u',allowedProjectIds:['p']},range={fromDate:'2026-10-26',toDateExclusive:'2026-11-02',timeZone:'Europe/Stockholm' as const};
const deps={sessionDb:{},adminDb:{from:()=>({select:()=>({in:()=>({eq:()=>({order:async()=>({data:[],error:null})})})})})}} as unknown as CalendarReadDeps;
it('merges dated media cards and retains other sources on media failure',async()=>{
 const healthy=await readCalendarWeek(deps,actor,range);expect(healthy.entries.map(e=>e.id)).toEqual(['existing-family','media-script']);
 vi.mocked(readCalendarMediaEvents).mockRejectedValueOnce(Error('SECRET'));const degraded=await readCalendarWeek(deps,actor,range);
 expect(degraded.mediaEvents).toMatchObject({available:false,undated:[]});expect(degraded.entries.map(e=>e.id)).toEqual(['existing-family']);expect(degraded.availability.manual).toBe(true);expect(JSON.stringify(degraded)).not.toContain('SECRET');expect(listCalendarEvents).toHaveBeenCalled();
});
