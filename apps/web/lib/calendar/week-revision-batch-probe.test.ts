import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {initializeCalendarDb,USER_A,USER_B,PROJECT_A} from './test-db';
let f:ReturnType<typeof initializeCalendarDb>;
beforeAll(()=>{f=initializeCalendarDb();for(const file of ['source-revision-probe.sql','owner-lock-candidate.sql','batch-probe-candidate.sql','week-revision-batch-probe.sql'])f.sql(readFileSync(resolve(process.cwd(),'lib/calendar/'+file),'utf8'));},60000);
afterAll(()=>f?.close(),60000);
const rows=JSON.stringify([{title:'Protected',startUtc:'2026-11-12T08:00:00.000Z',endUtc:'2026-11-12T09:00:00.000Z'}]);
const call=(version:number,actor=USER_A)=>f.sql(`select public.calendar_week_revision_batch_probe('${rows}'::jsonb,'${randomUUID()}','${PROJECT_A}',${version})`,actor);
const count=()=>f.sql(`select count(*) from public.user_calendar_events where owner_user_id='${USER_A}'`);
describe('isolated owner/project source-revision batch guard',()=>{
 it('refuses a missing revision row, writing nothing',()=>{expect(()=>call(0)).toThrow(/STALE_SOURCE/);expect(count()).toBe('0');});
 it('accepts the matching version then refuses a stale version without duplicates',()=>{f.sql(`insert into public.calendar_source_revision_probe(owner_user_id,project_id,revision) values('${USER_A}','${PROJECT_A}',1)`);expect(JSON.parse(call(1))).toMatchObject({ok:true,count:1});expect(count()).toBe('1');f.sql(`select public.calendar_source_revision_probe_bump('${USER_A}','${PROJECT_A}')`,USER_A);expect(()=>call(1)).toThrow(/STALE_SOURCE/);expect(count()).toBe('1');});
 it('refuses a foreign actor',()=>expect(()=>call(2,USER_B)).toThrow());
});
