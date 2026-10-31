import {describe,it,expect} from 'vitest'
import {readFileSync,readdirSync} from 'node:fs'
import {resolve} from 'node:path'
import {createHash} from 'node:crypto'
import {inspectCanonicalMigrationFiles,evaluateAppliedMigrationLedger,LEGACY_ONLY_PRODUCTION_LEDGER_NAMES,GRANDFATHERED_MIGRATION_NAMES} from '../../scripts/migration-guard-policy.mjs'
const root=resolve(__dirname,'../../../..'),directory=resolve(root,'apps/web/supabase/migrations')
const provenance=JSON.parse(readFileSync(resolve(root,'docs/verification/2026-10-31-web-studio-migration-provenance.json'),'utf8')) as {migrations:Array<{file:string;sha256:string}>}
const known=['sales_b2b_offers','sales_discovery_candidates','social_owner_crosschat_context']
describe('exact canonical cross-track migration reconciliation',()=>{
 it.each(provenance.migrations)('retains the original reviewed SQL bytes: $file',entry=>{
  const source=readFileSync(resolve(directory,entry.file),'utf8').replaceAll('\r\n','\n')
  expect(createHash('sha256').update(source).digest('hex')).toBe(entry.sha256)
 })
 it('recognizes the three canonical names but still rejects a genuinely unknown ledger name',()=>{
  const state=inspectCanonicalMigrationFiles(readdirSync(directory))
  expect(state.sqlFiles).toHaveLength(167);expect(state.enforcedNames).toHaveLength(153)
  for(const name of known)expect(state.enforcedNames).toContain(name)
  const ledger=[...state.enforcedNames,...GRANDFATHERED_MIGRATION_NAMES,...LEGACY_ONLY_PRODUCTION_LEDGER_NAMES]
  expect(()=>evaluateAppliedMigrationLedger(ledger,state)).not.toThrow()
  expect(()=>evaluateAppliedMigrationLedger([...ledger,'unrecognized_schema_mutation'],state)).toThrow()
  for(const name of known)expect(()=>evaluateAppliedMigrationLedger(ledger.filter(n=>n!==name),state)).toThrow()
 })
})

it('validates the actual read-only ledger snapshot without weakening missing/unknown checks',()=>{
 const captured=JSON.parse(readFileSync(resolve(root,'docs/verification/2026-10-31-web-studio-observed-ledger.json'),'utf8'))
 const state=inspectCanonicalMigrationFiles(readdirSync(directory))
 expect(captured.migration_names).toHaveLength(190)
 expect(evaluateAppliedMigrationLedger(captured.migration_names,state)).toMatchObject({enforcedCount:153,appliedLedgerCount:190,unknownLedgerNames:[],duplicateLedgerNames:[]})
 for(const name of known)expect(()=>evaluateAppliedMigrationLedger(captured.migration_names.filter((n:string)=>n!==name),state)).toThrow(new RegExp(name))
})
