// Creates a new owned test DB with the canonical website fixture, then enriches it.
import {spawnSync} from 'node:child_process'
import {resolve} from 'node:path'
const root=resolve(import.meta.dirname,'../../..')
const result=spawnSync(process.execPath,[resolve(root,'apps/web/scripts/test-website-build-db.mjs')],{cwd:root,encoding:'utf8',env:{...process.env,WEBSITE_BUILD_TEST_DATABASE_URL:'postgresql://postgres:local-fixture@127.0.0.1:54389/omnira_website_test',WEBSITE_BUILD_TEST_KEEP_DATABASE:'1'},maxBuffer:8*1024*1024})
if(result.status!==0)throw Error(result.stderr.slice(-3000))
const db=result.stdout.match(/KEEP_DB=(website_test_\d+)/)?.[1]
if(!db)throw Error('Owned fixture did not report its database')
const sql="alter table public.conversations add column project_id uuid references public.projects; update public.conversations set project_id='10000000-0000-4000-8000-000000000001'; create table public.project_budgets(project_id uuid primary key references public.projects, monthly_sek numeric); insert into project_budgets values('10000000-0000-4000-8000-000000000001',100); grant select on project_budgets to service_role;"
const enriched=spawnSync('docker',['exec','-i','omnira-website-build-test-20261014','psql','-X','-v','ON_ERROR_STOP=1','-U','postgres','-d',db],{input:sql,encoding:'utf8'})
if(enriched.status!==0)throw Error(enriched.stderr)
console.log('PLANNING_FIXTURE='+db)
