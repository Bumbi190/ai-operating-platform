import {readFileSync,readdirSync} from 'node:fs'
import {resolve} from 'node:path'
import {initializeSocialLaunchDb} from '../social-launch/test-db'
import {testSql} from '../website-build/test-db'
export function initializeConnectionDb(){
 const db=initializeSocialLaunchDb(),dir=resolve(process.cwd(),'supabase/migrations')
 if(testSql("select to_regclass('public.social_account_bindings') is null;")==='t'){
  const files=['20260527_platform_tokens.sql','20260914090000_platform_tokens_client_revoke.sql','20260914090100_platform_credential_events.sql','20260914120000_social_account_bindings.sql','20260914120100_platform_credential_events_account_binding.sql','20260914120200_social_credential_health.sql','20260914120300_platform_tokens_project_binding.sql','20260915170000_youtube_project_oauth.sql']
  // The historical project/account columns predate the canonical constraint migrations.
  const compatibility="alter table public.platform_tokens add column project_id uuid not null references public.projects(id),add column account_id text;alter table public.platform_tokens drop constraint platform_tokens_platform_token_type_key;alter table public.platform_tokens add unique(project_id,platform,token_type);"
  testSql('begin;'+readFileSync(resolve(dir,files[0]),'utf8')+compatibility+files.slice(1).map(f=>readFileSync(resolve(dir,f),'utf8')).join('\n')+'commit;')
 }
 const file=readdirSync(dir).find(f=>f.endsWith('_social_project_connections_v1.sql'))!
 const migration=readFileSync(resolve(dir,file),'utf8')
 if(testSql("select to_regclass('public.social_connection_intents') is null;")==='t'&&migration.includes('create table'))testSql('begin;'+migration+'commit;')
 return db
}
