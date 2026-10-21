/**
 * Disposable PostgreSQL 17 verification of actual P7 SQL migration.
 * Local Docker only: --network none, no published ports or host mounts.
 * Never touches Supabase or unrelated Docker containers.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {spawnSync,spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import {resolve} from 'node:path';

const docker=process.env.DOCKER_BIN ||
  'C:\\Program Files\\Docker\\Docker\\resources\\bin\\docker.exe';
const image='postgres@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24';
const container='omnira-creative-pg17-p9-'+process.pid;
const migration=readFileSync(resolve(import.meta.dirname,
  '../../../apps/web/supabase/creative-drafts/20261020230500_atlas_creative_queue_staging_p7.sql'),'utf8');
const pgArgs=['exec','-i',container,'psql','-X','-A','-t','-v','ON_ERROR_STOP=1',
  '-U','postgres','-d','postgres'];
const project='00000000-0000-4000-8000-000000000011';
const imageId='00000000-0000-4000-8000-000000000021';
const otherId='00000000-0000-4000-8000-000000000023';
const worker='HultgrenCreative01';
const h=c=>c.repeat(64);
let count=0,created=false;
function run(args,opts={}) {
  const r=spawnSync(docker,args,{encoding:'utf8',timeout:30000,
    maxBuffer:3*1024*1024,...opts});
  if(r.error) throw r.error;
  return r;
}
const sql=q=>run(pgArgs,{input:q+'\n'});
function ok(query,label) {
  const r=sql(query);
  assert.equal(r.status,0,label+': '+r.stderr);
  return r.stdout.trim();
}
function reject(query,pattern,label) {
  const r=sql(query);
  assert.notEqual(r.status,0,label+': unexpectedly succeeded');
  assert.match(r.stderr,pattern,label);
}
function pass(label,fn) { fn(); console.log('PASS '+(++count)+' '+label); }
const setup=[
  'create role service_role nologin;',
  'create role authenticated nologin;',
  'create role anon nologin;',
  'create table public.projects(id uuid primary key);',
  'create table public.assets(id uuid primary key,project_id uuid not null references public.projects(id),',
  ' checksum_sha256 text not null,status text not null,kind text not null);',
  "insert into public.projects(id) values('00000000-0000-4000-8000-000000000011'),",
  " ('00000000-0000-4000-8000-000000000012');",
  "insert into public.assets(id,project_id,checksum_sha256,status,kind) values",
  " ('00000000-0000-4000-8000-000000000021','00000000-0000-4000-8000-000000000011',repeat('d',64),'active','image'),",
  " ('00000000-0000-4000-8000-000000000022','00000000-0000-4000-8000-000000000011',repeat('e',64),'active','video'),",
  " ('00000000-0000-4000-8000-000000000023','00000000-0000-4000-8000-000000000012',repeat('f',64),'active','image');"
].join('\n');
function job(name,opts={}) {
  const v={sourceId:imageId,sourceSha:h('d'),ticket:h('a'),nonce:h('b'),
    operation:'photocraft.convert-webp',...opts};
  return [
    'insert into public.atlas_creative_queue_staging',
    '(work_id,project_id,source_asset_id,source_sha256,worker_id,operation_id,',
    ' binary_sha256,approval_receipt_sha256,signed_ticket_sha256,claim_nonce_sha256,',
    ' output_max_bytes,ticket_issued_at,ticket_expires_at) values (',
    "'"+name+"','"+project+"','"+v.sourceId+"','"+v.sourceSha+"','"+worker+"','"+v.operation+"',",
    "'"+h('9')+"','"+h('c')+"','"+v.ticket+"','"+v.nonce+"',500000,",
    "clock_timestamp()-interval '30 seconds',clock_timestamp()+interval '2 minutes');"
  ].join('\n');
}
function claim(name,opts={}) {
  const v={worker,ticket:h('a'),nonce:h('b'),approval:h('c'),...opts};
  return 'select * from public.atlas_creative_claim_staging_p7('+
    "'"+name+"','"+v.worker+"','"+v.ticket+"','"+v.nonce+"',"+
    (v.approval===null?'NULL':"'"+v.approval+"'")+');';
}
const asRole=(query,role='service_role',jwtRole=role)=>
  'set role '+role+";\nselect set_config('request.jwt.claim.role','"+jwtRole+"',false);\n"+query+'\n';
function asyncSql(input) {
  return new Promise((finish,rejectErr)=>{
    const child=spawn(docker,pgArgs,{windowsHide:true,stdio:['pipe','pipe','pipe']});
    let stdout='',stderr='';
    child.stdout.on('data',x=>{stdout+=x.toString()});
    child.stderr.on('data',x=>{stderr+=x.toString()});
    child.on('error',rejectErr);
    child.on('close',code=>finish({code,stdout,stderr}));
    child.stdin.end(input+'\n');
  });
}
try {
  assert.equal(run(['image','inspect',image,'--format','{{.Id}}']).status,0,
    'Required image missing. Run docker pull postgres:17-alpine first.');
  const exists=run(['ps','-a','--filter','name=^/'+container+'$','--format','{{.Names}}']);
  assert.equal(exists.stdout.trim(),'');
  const launch=run(['run','-d','--rm','--name',container,'--network','none',
    '--memory','384m','--tmpfs','/var/lib/postgresql/data:rw,size=256m',
    '-e','POSTGRES_HOST_AUTH_METHOD=trust',image]);
  assert.equal(launch.status,0,launch.stderr);
  created=true;
  let ready=false;
  for(let n=0;n<40;n++){
    if(run(['exec',container,'pg_isready','-U','postgres']).status===0){
      ready=true;break;
    }
    await sleep(250);
  }
  assert.ok(ready,'Temporary database not ready');
  const v=ok('show server_version;','version');
  assert.match(v,/^17\./);
  console.log('ENGINE PostgreSQL '+v);
  pass('isolated container has no Docker network or port mapping',()=>{
    const state=run(['inspect','--format','{{.HostConfig.NetworkMode}}|{{json .HostConfig.PortBindings}}',container]);
    assert.equal(state.status,0);
    assert.match(state.stdout.trim(),/^none\|(null|\{\})$/);
  });
  ok(setup,'prepare test-only projects and assets');
  ok(migration,'execute actual unapplied P7 migration');
  pass('P7 migration executes in PostgreSQL 17',()=>{
    assert.equal(ok("select to_regclass('public.atlas_creative_queue_staging');",'table'),
      'atlas_creative_queue_staging');
  });
  pass('browser roles cannot execute SQL claim',()=>{
    assert.equal(ok("select has_function_privilege('authenticated','public.atlas_creative_claim_staging_p7(text,text,text,text,text)','EXECUTE');",'priv'),'f');
    assert.equal(ok("select has_table_privilege('anon','public.atlas_creative_queue_staging','SELECT');",'priv'),'f');
  });
  ok(job('oneJobP91'),'stage success');
  pass('valid claim fences once and rejects replay',()=>{
    assert.match(ok(asRole(claim('oneJobP91')),'claim'),/claimed_preview_only/);
    reject(asRole(claim('oneJobP91')), /creative job unavailable/,'replay');
    assert.equal(ok("select claim_fence from public.atlas_creative_queue_staging where work_id='oneJobP91';",'fence'),'1');
  });
  ok(job('roleJobP92',{ticket:h('2'),nonce:h('3')}),'stage role');
  pass('spoofed service-role header cannot bypass browser grants',()=>{
    reject(asRole(claim('roleJobP92',{ticket:h('2'),nonce:h('3')}),
      'authenticated','service_role'),/permission denied/,'role');
  });
  pass('null approval SHA fails closed',()=>{
    reject(asRole(claim('roleJobP92',{ticket:h('2'),nonce:h('3'),approval:null})),
      /creative claim invalid/,'null approval');
  });
  ok(job('foreignJobP93',{sourceId:otherId,sourceSha:h('f'),
    ticket:h('4'),nonce:h('5')}),'stage foreign');
  pass('cross-project input cannot claim',()=>{
    reject(asRole(claim('foreignJobP93',{ticket:h('4'),nonce:h('5')})),
      /creative source invalid/,'foreign');
  });
  ok(job('raceJobP94',{ticket:h('6'),nonce:h('7')}),'stage concurrency');
  const action=claim('raceJobP94',{ticket:h('6'),nonce:h('7')});
  const first=asyncSql(asRole('begin;\n'+action+"\nselect pg_sleep(2);\ncommit;"));
  await sleep(400);
  const second=asyncSql(asRole(action));
  const results=await Promise.all([first,second]);
  pass('simultaneous distinct PostgreSQL sessions: one winner, one rejection',()=>{
    assert.equal(results.filter(r=>r.code===0).length,1,JSON.stringify(results));
    assert.equal(results.filter(r=>r.code!==0).length,1,JSON.stringify(results));
    assert.match(results.find(r=>r.code!==0).stderr,/creative job unavailable/);
    assert.equal(ok("select claim_fence from public.atlas_creative_queue_staging where work_id='raceJobP94';",'fence'),'1');
  });
  console.log('SUMMARY '+count+' PostgreSQL 17 integration checks passed.');
} finally {
  if(created) {
    const cleanup=run(['rm','-f',container],{timeout:15000});
    console.log('CLEANUP isolated container removed='+String(cleanup.status===0));
  }
}
