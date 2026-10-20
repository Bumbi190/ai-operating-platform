import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {initializeCalendarDb,USER_A,PROJECT_A} from './test-db';
let fixture:ReturnType<typeof initializeCalendarDb>;
beforeAll(()=>{fixture=initializeCalendarDb();fixture.sql(readFileSync(resolve(process.cwd(),'lib/calendar/source-revision-probe.sql'),'utf8'));fixture.sql(`insert into public.calendar_source_revision_probe(owner_user_id,project_id,revision) values('${USER_A}','${PROJECT_A}',1)`);},60000);
afterAll(()=>fixture?.close(),60000);
const auth=`begin;set local role authenticated;set local "request.jwt.claim.sub"='${USER_A}';`;
function query(body:string){return new Promise<{code:number|null;output:string}>((resolve,reject)=>{const p=spawn('docker',['exec','-i','omnira-website-build-test-20261014','psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d',fixture.database]);let output='';p.stdout.on('data',d=>output+=d);p.stderr.on('data',d=>output+=d);p.on('error',reject);p.on('close',code=>resolve({code,output}));p.stdin.end(body);});}
describe('held source revision row lock',()=>{
 it('runs held-row comparison concurrently with a version bump',async()=>{
  // This is a concurrent smoke test, not proof of precise lock acquisition order.
  const holder=query(`${auth}select public.calendar_source_revision_probe_compare('${USER_A}','${PROJECT_A}',1);select pg_sleep(1);commit;`);
  // Both sessions run concurrently; the revision must eventually bump exactly once.
  const writer=query(`${auth}select public.calendar_source_revision_probe_bump('${USER_A}','${PROJECT_A}');commit;`);
  const [a,b]=await Promise.all([holder,writer]);
  expect(a.code).toBe(0);expect(b.code).toBe(0);
  expect(a.output).toContain('t');expect(b.output).toContain('2');
  expect(fixture.sql(`select revision from public.calendar_source_revision_probe where owner_user_id='${USER_A}'`)).toBe('2');
 });
});
