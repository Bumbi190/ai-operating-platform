import {readFileSync,readdirSync} from 'node:fs'
import {resolve} from 'node:path'
import {initializeContentDb} from '../content/test-db'
import {testSql} from '../../website-build/test-db'
function definition(source:string,name:string){
 const start=source.search(new RegExp('create table if not exists (?:public\\.)?'+name+' \\(','i'))
 if(start<0)throw Error('Missing canonical table '+name)
 const end=source.indexOf('\n);',start);if(end<0)throw Error('Missing table end '+name)
 return source.slice(start,end+3)
}
export function initializeNewsReviewDb(){
 const db=initializeContentDb(),dir=resolve(process.cwd(),'supabase/migrations')
 const media=readFileSync(resolve(dir,'20260520_media_tables.sql'),'utf8')
 for(const name of ['media_news_items','media_scripts'])if(testSql("select to_regclass('public."+name+"') is null;")==='t')testSql(definition(media,name))
 if(testSql("select to_regclass('public.cost_events') is null;")==='t')testSql(definition(readFileSync(resolve(dir,'20260602_cost_events.sql'),'utf8'),'cost_events'))
 if(testSql("select to_regclass('public.asset_provenance') is null;")==='t'){
  const source=readFileSync(resolve(dir,'20260902_media_asset_foundation.sql'),'utf8'),begin=source.indexOf('create or replace function public.asset_reject_mutation()'),end=source.indexOf('--',source.indexOf('alter table public.assets',begin))
  const rls=source.indexOf('alter table public.assets',begin),rlsEnd=source.indexOf('--',source.indexOf(');',source.indexOf('create policy "asset_provenance_owner"',rls))+2)
  testSql(definition(source,'asset_provenance')+'\n'+source.slice(begin,source.indexOf('alter table public.assets',begin))+'\n'+source.slice(rls,rlsEnd))
 }
 testSql('grant select,insert,update on assets,asset_provenance,media_scripts,media_news_items,cost_events to service_role;grant select,insert on asset_provenance to authenticated;grant select on assets,projects to authenticated;')
 const file=readdirSync(dir).find(f=>f.endsWith('_media_news_review_evidence.sql'))!
 testSql('begin;'+readFileSync(resolve(dir,file),'utf8')+'commit;')
 return db
}
