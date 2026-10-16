// Owned local SQL fixture only; never imported by application code.
import {readFileSync,readdirSync} from 'node:fs'
import {resolve} from 'node:path'
import {initializeWorkerDb,testSql} from '../website-build/test-db'
export function initializeSocialLaunchDb(){
 const db=initializeWorkerDb()
 if(testSql("select to_regclass('public.social_launch_plans') is null;")==='t'){
  const dir=resolve(process.cwd(),'supabase/migrations'),file=readdirSync(dir).find(f=>f.endsWith('_social_launch_plans_v1.sql'))!
  testSql('begin;'+readFileSync(resolve(dir,file),'utf8')+'commit;')
 }
 return db
}
