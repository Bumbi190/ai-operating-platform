import {createHash} from 'node:crypto'
import {readFileSync,readdirSync} from 'node:fs'
import {resolve} from 'node:path'
import {it,expect} from 'vitest'
import {inspectCanonicalMigrationFiles,evaluateAppliedMigrationLedger} from '../../scripts/migration-guard-policy.mjs'
it('reconciles exact already-live reply source without weakening ledger checks',()=>{
 const dir=resolve(process.cwd(),'supabase/migrations'),name='sales_reply_preparation'
 const files=readdirSync(dir).filter(f=>f.endsWith('_'+name+'.sql'))
 expect(files).toEqual(['20261018040242_sales_reply_preparation.sql'])
 const sql=readFileSync(resolve(dir,files[0]))
 expect(createHash('sha256').update(sql).digest('hex')).toBe('7516d8566ae7776086452ff8fdd51058ce34a10ab70973bcdbf4ee14f655a3cc')
 const state=inspectCanonicalMigrationFiles(readdirSync(dir))
 expect(state.enforcedNames).toContain(name)
 expect(state.grandfatheredNames).not.toContain(name)
 expect(()=>evaluateAppliedMigrationLedger(state.repositoryNames.filter(n=>n!==name),state)).toThrow(/sales_reply_preparation/)
 expect(()=>evaluateAppliedMigrationLedger([...state.repositoryNames,name],state)).toThrow(/duplicate/)
 const registry=JSON.parse(readFileSync(resolve(process.cwd(),'tests/isolation/schema-security.json'),'utf8'))
 for(const table of ['sales_reply_jobs','sales_reply_attempts','sales_reply_draft_revisions'])expect(registry.tables[table]).toMatchObject({class:'SERVER_ONLY',rls:true,policies:0,anon_grants:false,authenticated_grants:false,service_role:true})
})
