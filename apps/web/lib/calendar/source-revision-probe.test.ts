import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {initializeCalendarDb,USER_A,USER_B,PROJECT_A} from './test-db';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
let f:ReturnType<typeof initializeCalendarDb>;
beforeAll(()=>{f=initializeCalendarDb();f.sql(readFileSync(resolve(process.cwd(),'lib/calendar/source-revision-probe.sql'),'utf8'));},60000);
afterAll(()=>f?.close(),60000);
const revision=()=>f.sql(`select revision from public.calendar_source_revision_probe where owner_user_id='${USER_A}' and project_id='${PROJECT_A}'`);
describe('isolated external writer revision gate',()=>{
 it('increments monotonically in a transaction',()=>{expect(f.sql(`select public.calendar_source_revision_probe_bump('${USER_A}','${PROJECT_A}')`,USER_A)).toBe('1');expect(f.sql(`select public.calendar_source_revision_probe_bump('${USER_A}','${PROJECT_A}')`,USER_A)).toBe('2');expect(revision()).toBe('2');});
 it('rejects a foreign principal without revision change',()=>{expect(()=>f.sql(`select public.calendar_source_revision_probe_bump('${USER_A}','${PROJECT_A}')`,USER_B)).toThrow();expect(revision()).toBe('2');});
 it('rolls back revision changes when a later operation fails',()=>{expect(()=>f.sql(`select public.calendar_source_revision_probe_bump('${USER_A}','${PROJECT_A}');select 1/0`,USER_A)).toThrow();expect(revision()).toBe('2');});
});
