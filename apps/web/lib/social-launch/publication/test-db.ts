import {readFileSync,readdirSync} from 'node:fs'
import {resolve} from 'node:path'
import {initializeContentDb} from '../content/test-db'
import {testSql} from '../../website-build/test-db'
export function initializePublicationDb(){const db=initializeContentDb(),dir=resolve(process.cwd(),'supabase/migrations'),file=readdirSync(dir).find(f=>f.endsWith('_social_manual_publication_v1.sql'));if(file&&testSql("select to_regclass('public.social_publications') is null;")==='t')testSql('begin;'+readFileSync(resolve(dir,file),'utf8')+'commit;');return db}
