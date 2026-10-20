import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {initializeCalendarDb,USER_A,USER_B,PROJECT_A} from './test-db';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
let f:ReturnType<typeof initializeCalendarDb>;
beforeAll(()=>{f=initializeCalendarDb();f.sql(readFileSync(resolve(process.cwd(),'lib/calendar/source-revision-probe.sql'),'utf8'));},60000);
afterAll(()=>f?.close(),60000);
const compare=(owner:string,version:number,actor=USER_A)=>f.sql(`select public.calendar_source_revision_probe_compare('${owner}','${PROJECT_A}',${version})`,actor);
describe('source revision comparison in isolated SQL',()=>{
 it('accepts version zero before any writer, then rejects it after bump',()=>{expect(compare(USER_A,0)).toBe('f');f.sql(`select public.calendar_source_revision_probe_bump('${USER_A}','${PROJECT_A}')`,USER_A);expect(compare(USER_A,0)).toBe('f');expect(compare(USER_A,1)).toBe('t');});
 it('rejects foreign actor',()=>expect(()=>compare(USER_A,1,USER_B)).toThrow());
});

