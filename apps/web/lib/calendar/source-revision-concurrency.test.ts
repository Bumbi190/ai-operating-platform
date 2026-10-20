import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {initializeCalendarDb,USER_A,PROJECT_A} from './test-db';
let fixture:ReturnType<typeof initializeCalendarDb>;
beforeAll(()=>{fixture=initializeCalendarDb();fixture.sql(readFileSync(resolve(process.cwd(),'lib/calendar/source-revision-probe.sql'),'utf8'));fixture.sql(`insert into public.calendar_source_revision_probe(owner_user_id,project_id,revision) values('${USER_A}','${PROJECT_A}',1)`);},60000);
afterAll(()=>fixture?.close(),60000);
function query(body:string){return new Promise<{code:number|null;output:string}>((done,reject)=>{const p=spawn('docker',['exec','-i','omnira-website-build-test-20261014','psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d',fixture.database]);let output='';p.stdout.on('data',x=>output+=x);p.stderr.on('data',x=>output+=x);p.on('error',reject);p.on('close',code=>done({code,output}));p.stdin.end(body);});}
const auth=`begin;set local role authenticated;set local "request.jwt.claim.sub"='${USER_A}';`;
const bump=`select public.calendar_source_revision_probe_bump('${USER_A}','${PROJECT_A}');`;
const compare=(v:number)=>`select public.calendar_source_revision_probe_compare('${USER_A}','${PROJECT_A}',${v});`;
describe('real SQL concurrent source revisions',()=>{
 it('stale reader cannot approve if writer and comparison race',async()=>{
  const [a,b]=await Promise.all([query(auth+bump+'commit;'),query(auth+compare(1)+'commit;')]);
  expect(a.code).toBe(0);expect(b.code).toBe(0);
  expect(fixture.sql(`select revision from public.calendar_source_revision_probe where owner_user_id='${USER_A}'`)).toBe('2');
  expect(['t','f']).toContain(b.output.trim());
  expect((await query(auth+compare(1)+'commit;')).output.trim()).toBe('f');
 });
});
