import {createHash} from 'node:crypto'
import {readFileSync,readdirSync} from 'node:fs'
import {resolve} from 'node:path'
import {describe,it,expect} from 'vitest'
import {inspectCanonicalMigrationFiles,evaluateAppliedMigrationLedger} from '../../scripts/migration-guard-policy.mjs'
const dir=resolve(process.cwd(),'supabase/migrations'),name='sales_strato_inbox'
describe('already-applied sales inbox source reconciliation',()=>{
 it('pins the exact reviewed source and unique canonical name',()=>{const files=readdirSync(dir).filter(f=>f.endsWith('_'+name+'.sql'));expect(files).toEqual(['20261017191904_sales_strato_inbox.sql']);const sql=readFileSync(resolve(dir,files[0]),'utf8').replace(/\r\n/g,'\n');expect(sql.length).toBe(36094);expect(createHash('sha256').update(sql).digest('hex')).toBe('1013142706f4fc1ebd60c31f64cc3f38d6d0d9082c58610487ddc46a4bc606a1')})
 it('keeps missing, duplicate and unknown ledger entries fail-closed',()=>{const state=inspectCanonicalMigrationFiles(readdirSync(dir));expect(state.enforcedNames).toContain(name);expect(state.grandfatheredNames).not.toContain(name);expect(()=>evaluateAppliedMigrationLedger(state.repositoryNames.filter(n=>n!==name),state)).toThrow(/sales_strato_inbox/);expect(()=>evaluateAppliedMigrationLedger([...state.repositoryNames,name],state)).toThrow(/duplicate/);expect(()=>evaluateAppliedMigrationLedger([...state.repositoryNames,'future_unreviewed_schema'],state)).toThrow(/unknown/)})
 it('adds only four server-only classifications to the registry',()=>{const registry=JSON.parse(readFileSync(resolve(process.cwd(),'tests/isolation/schema-security.json'),'utf8'));for(const table of ['sales_inbox_configs','sales_inbox_messages','sales_inbox_occurrences','sales_inbox_batches'])expect(registry.tables[table]).toMatchObject({class:'SERVER_ONLY',rls:true,policies:0,anon_grants:false,authenticated_grants:false,service_role:true})})
})
