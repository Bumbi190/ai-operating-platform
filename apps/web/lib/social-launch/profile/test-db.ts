import {readFileSync,readdirSync} from 'node:fs'
import {resolve} from 'node:path'
import {initializeContentDb} from '../content/test-db'
import {testSql} from '../../website-build/test-db'
export function initializeProfileDb(){
 const db=initializeContentDb(),dir=resolve(process.cwd(),'supabase/migrations'),f=readdirSync(dir).find(f=>f.endsWith('_social_project_profiles_v1.sql'))
 if(f&&testSql("select to_regclass('public.social_project_profiles') is null;")==='t')testSql('begin;'+readFileSync(resolve(dir,f),'utf8')+'commit;')
 return db
}
