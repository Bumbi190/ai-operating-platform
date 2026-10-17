// Isolated Docker-only fixture proof. No host ports, production connection or provider call.
import fs from 'node:fs';import cp from 'node:child_process';import path from 'node:path';import crypto from 'node:crypto';import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const name='omnira-hb-inbox-test-'+process.pid+'-'+Date.now();const image='public.ecr.aws/supabase/postgres:17.6.1.095';
function docker(args,input,allowFailure=false){const r=cp.spawnSync('docker',args,{input,encoding:'utf8',timeout:30000,windowsHide:true});if(r.status!==0&&!allowFailure)throw new Error((r.stderr||r.stdout||r.error?.message||'docker failed').slice(0,4000));return r;}
function sql(q,fail=false){return docker(['exec','-i',name,'psql','-h','/tmp','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-At'],q,fail);}
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const source=read('apps/web/supabase/migrations/20261017150717_handlarborsen_candidate_inbox_v1.sql');
const receipt={image,sqlSha256:crypto.createHash('sha256').update(source.replace(/\r\n/g,'\n')).digest('hex'),checks:[],productionAccess:false};
(async()=>{let created=false;try{
 const existing=docker(['ps','-a','--filter','name=^/'+name+'$','--format','{{.Names}}']).stdout.trim();if(existing)throw new Error('test container already exists, refusing to reuse');
 docker(['run','-d','--name',name,'--network','none','--entrypoint','bash',image,'-lc','mkdir /tmp/hbdata && chown postgres:postgres /tmp/hbdata && gosu postgres initdb -D /tmp/hbdata -A trust -U postgres >/tmp/hb-init.log && exec gosu postgres postgres -D /tmp/hbdata -k /tmp -c listen_addresses=']);created=true;
 let ready=false;for(let i=0;i<25;i++){if(docker(['exec',name,'pg_isready','-h','/tmp','-U','postgres'],undefined,true).status===0){ready=true;break;}await new Promise(r=>setTimeout(r,500));}if(!ready)throw new Error('test DB not ready');
 receipt.version=sql('select version();').stdout.trim();
 sql(`create role anon nologin;create role authenticated nologin;create role service_role nologin bypassrls;
 create schema auth;create table auth.users(id uuid primary key);
 create table public.projects(id uuid primary key,owner_id uuid not null,slug text not null);
 create table public.omnira_organization_memberships(user_id uuid primary key,role text not null,revoked_at timestamptz);
 grant usage on schema public,auth to service_role,anon,authenticated;
 grant select on public.projects,public.omnira_organization_memberships to service_role;
 insert into auth.users values('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
 insert into public.projects values('8f673c09-1c8f-4d78-876e-4c14bf1c89b3','11111111-1111-4111-8111-111111111111','handlarborsen');
 insert into public.omnira_organization_memberships values('11111111-1111-4111-8111-111111111111','owner',null),('22222222-2222-4222-8222-222222222222','collaborator',null);`);
 sql(read('apps/web/supabase/migrations/20261016195000_handlarborsen_competitor_candidates_v1.sql'));
 const candidate=(host,title)=>`insert into public.handlarborsen_competitor_candidates(project_id,host,name,official_url,observed_on,relevance,provenance,evidence_digest) values('8f673c09-1c8f-4d78-876e-4c14bf1c89b3','${host}','${title}','https://${host}/','2026-10-17','Fixture dealer marketplace.','independently_checked_official_website',encode(sha256(convert_to('${title}'||E'\\n'||'https://${host}/'||E'\\n'||'2026-10-17'||E'\\n'||'Fixture dealer marketplace.','UTF8')),'hex'));`;
 sql(candidate('tradingsolutions.se','Existing Fixture'));sql(source);sql(read('docs/sql/handlarborsen_candidate_inbox_p0_fixture.sql'));
 receipt.checks.push('no historical backfill','exactly two notices for active recipients','duplicate insertion no-op','recipient-only read/unread and idempotent replay','revoked collaborator rejected and not notified','RLS and FORCE RLS, no policies');
 const denied=[['anon SELECT','set role anon;select * from public.handlarborsen_candidate_inbox;'],['authenticated INSERT',"set role authenticated;insert into public.handlarborsen_candidate_inbox(project_id,candidate_host,recipient_id,evidence_digest) values('8f673c09-1c8f-4d78-876e-4c14bf1c89b3','auctionexample.org','11111111-1111-4111-8111-111111111111',repeat('0',64));"],['authenticated RPC',"set role authenticated;select * from public.handlarborsen_set_candidate_inbox_read_v1('8f673c09-1c8f-4d78-876e-4c14bf1c89b3','auctionexample.org','11111111-1111-4111-8111-111111111111',true);"],['service DELETE','set role service_role;delete from public.handlarborsen_candidate_inbox;'],['service evidence UPDATE',"set role service_role;update public.handlarborsen_candidate_inbox set evidence_digest=repeat('0',64);"]];
 for(const[label,q]of denied){const r=sql(q,true);if(r.status===0||!r.stderr.includes('permission denied'))throw new Error('expected permission denial: '+label+' '+r.stderr);receipt.checks.push(label+' denied');}
 sql('set role service_role;'+candidate('service-fixture.org','Service Fixture'));
 const count=sql('select count(*) from public.handlarborsen_candidate_inbox;').stdout.trim();if(count!=='4')throw new Error('service insert did not emit exactly one notice');
 const ack=sql("set role service_role;select outcome from public.handlarborsen_set_candidate_inbox_read_v1('8f673c09-1c8f-4d78-876e-4c14bf1c89b3','service-fixture.org','11111111-1111-4111-8111-111111111111',true);").stdout.trim();if(!ack.endsWith('updated'))throw new Error('service receipt failed '+ack);
 receipt.checks.push('actual service role insert trigger and owner receipt');receipt.finalNoticeCount=Number(count);receipt.status='passed';
}finally{if(created){docker(['rm','-f',name]);receipt.containerRemoved=true;}receipt.finishedAt=new Date().toISOString();const receiptPath=process.env.HB_INBOX_TEST_RECEIPT;if(receiptPath)fs.writeFileSync(receiptPath,JSON.stringify(receipt,null,2)+'\n');}
console.log(JSON.stringify(receipt));})().catch(e=>{console.error(e.message);process.exitCode=1;});
