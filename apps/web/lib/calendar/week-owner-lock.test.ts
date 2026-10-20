import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {spawn} from 'node:child_process';
import {initializeCalendarDb,USER_A,USER_B} from './test-db';

/** Demonstrates Postgres transaction advisory lock behavior; no production lock is installed. */
let fixture:ReturnType<typeof initializeCalendarDb>;
beforeAll(()=>{fixture=initializeCalendarDb()},60000);
afterAll(()=>fixture?.close(),60000);
function parallelSql(sql:string):Promise<{exit:number|null;output:string}> {
 return new Promise((resolve,reject)=>{
  const child=spawn('docker',['exec','-i','omnira-website-build-test-20261014','psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d',fixture.database]);
  let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);child.on('error',reject);child.on('exit',exit=>resolve({exit,output}));child.stdin.end(sql);
 });
}
describe('transaction-scoped owner lock prerequisite',()=>{
 it('serializes same-owner concurrent writers and releases lock after commit',async()=>{
  const key=`hashtextextended('${USER_A}',0)`;
  const first=parallelSql(`begin;select pg_advisory_xact_lock(${key});select pg_sleep(1);commit;select 'first';`);
  await new Promise(resolve=>setTimeout(resolve,180));
  const second=parallelSql(`begin;set local lock_timeout='150ms';select pg_advisory_xact_lock(${key});commit;`);
  const [a,b]=await Promise.all([first,second]);
  expect(a.exit).toBe(0);expect(b.exit).not.toBe(0);expect(b.output).toMatch(/lock timeout/i);
  const retry=await parallelSql(`begin;set local lock_timeout='500ms';select pg_advisory_xact_lock(${key});commit;`);
  expect(retry.exit).toBe(0);
 });
 it('permits another owner to acquire its own transaction lock',async()=>{
  const key=`hashtextextended('${USER_B}',0)`;
  const out=await parallelSql(`begin;select pg_advisory_xact_lock(${key});commit;`);
  expect(out.exit).toBe(0);
 });
});
