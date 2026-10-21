import {readFileSync,readdirSync} from 'node:fs'
import {resolve} from 'node:path'
import {initializeConnectionDb} from '../../social-connections/test-db'
import {testSql} from '../../website-build/test-db'
export function initializeContentDb(){
 const db=initializeConnectionDb(),dir=resolve(process.cwd(),'supabase/migrations')
 if(testSql("select to_regclass('public.assets') is null;")==='t'){
  const source=readFileSync(resolve(dir,'20260902_media_asset_foundation.sql'),'utf8'),start=source.indexOf('create table if not exists public.assets ('),end=source.indexOf('create index if not exists assets_project_created_idx',start)
  testSql(source.slice(start,end)+'grant select on public.assets to service_role;')
 }
 const file=readdirSync(dir).find(f=>f.endsWith('_social_content_preparation_v1.sql'))!
 if(file&&readFileSync(resolve(dir,file),'utf8').includes('create table')&&testSql("select to_regclass('public.social_content_posts') is null;")==='t')testSql('begin;'+readFileSync(resolve(dir,file),'utf8')+'commit;')
 return db
}
