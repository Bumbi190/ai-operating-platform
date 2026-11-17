import {describe,it,expect} from 'vitest'
import {readFileSync,readdirSync} from 'node:fs'
import {resolve} from 'node:path'
import {createHash} from 'node:crypto'
import {inspectCanonicalMigrationFiles,evaluateAppliedMigrationLedger,LEGACY_ONLY_PRODUCTION_LEDGER_NAMES,GRANDFATHERED_MIGRATION_NAMES} from '../../scripts/migration-guard-policy.mjs'
const root=resolve(__dirname,'../../../..'),directory=resolve(root,'apps/web/supabase/migrations')
const observedPosthog=JSON.parse(readFileSync(resolve(root,'docs/verification/web-studio/2026-11-04-posthog-ledger-observation.json'),'utf8')).migrationNames as string[]
const currentProduction=JSON.parse(readFileSync(resolve(root,'docs/verification/web-studio/2026-11-09-production-ledger-observation.json'),'utf8'))
function expectCurrentProductionLedger(state:ReturnType<typeof inspectCanonicalMigrationFiles>){
 expect(currentProduction.migrationNames).toHaveLength(198)
 expect(currentProduction.migration.version).toBe('20261109111500')
 expect(currentProduction.migration.name).toBe('webbuilder_prospects')
 expect(currentProduction.migration.statementSha256).toBe('669fdaca272a4140a210b222e003895e9f7c171b0d0ae9265d69e9382c32e5d9')
 expect(evaluateAppliedMigrationLedger(currentProduction.migrationNames,state)).toMatchObject({canonicalSqlCount:175,enforcedCount:161,appliedLedgerCount:198,unknownLedgerNames:[],duplicateLedgerNames:[]})
}
const provenance=JSON.parse(readFileSync(resolve(root,'docs/verification/2026-10-31-web-studio-migration-provenance.json'),'utf8')) as {migrations:Array<{file:string;sha256:string}>}
const known=['sales_b2b_offers','sales_discovery_candidates','social_owner_crosschat_context']
describe('exact canonical cross-track migration reconciliation',()=>{
 it.each(provenance.migrations)('retains the original reviewed SQL bytes: $file',entry=>{
  const source=readFileSync(resolve(directory,entry.file),'utf8').replaceAll('\r\n','\n')
  expect(createHash('sha256').update(source).digest('hex')).toBe(entry.sha256)
 })
 it('recognizes the three canonical names but still rejects a genuinely unknown ledger name',()=>{
  const state=inspectCanonicalMigrationFiles(readdirSync(directory))
  expect(state.sqlFiles).toHaveLength(175);expect(state.enforcedNames).toHaveLength(161)
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
 // Preserve the historical190-name capture; the later exact-claim migration now makes it incomplete.
 expect(()=>evaluateAppliedMigrationLedger(captured.migration_names,state)).toThrow(/human_story_exact_claim/)
 const current=JSON.parse(readFileSync(resolve(root,'docs/verification/2026-11-04-web-studio-initial-send-observation.json'),'utf8'))
 // The immutable real195-name capture predates the proposed allowance.
 expect(()=>evaluateAppliedMigrationLedger(current.migration_names,state)).toThrow(/project_total_allowance/)
 // The 197-name PostHog snapshot remains historical; the new 198-name production observation is checked below.
 expect(()=>evaluateAppliedMigrationLedger([...current.migration_names,'project_total_allowance'],state)).toThrow(/posthog_approved_read/)
 expect(observedPosthog).toHaveLength(197)
 expect(observedPosthog).not.toContain('webbuilder_prospects')
 expect(()=>evaluateAppliedMigrationLedger(observedPosthog,state)).toThrow(/webbuilder_prospects/)
 expectCurrentProductionLedger(state)
 for(const name of known)expect(()=>evaluateAppliedMigrationLedger(current.migration_names.filter((n:string)=>n!==name),state)).toThrow(new RegExp(name))
})

it('preserves the historical post-install ledger and exact reviewed allowance SQL',()=>{
 const receipt=JSON.parse(readFileSync(resolve(root,'docs/verification/web-studio/2026-11-04-total-budget-applied.json'),'utf8'))
 const state=inspectCanonicalMigrationFiles(readdirSync(directory))
 expect(receipt.migration_names).toHaveLength(196)
 expect(()=>evaluateAppliedMigrationLedger(receipt.migration_names,state)).toThrow(/posthog_approved_read/)
 expect(observedPosthog).toHaveLength(197)
 expect(observedPosthog).not.toContain('webbuilder_prospects')
 expect(()=>evaluateAppliedMigrationLedger(observedPosthog,state)).toThrow(/webbuilder_prospects/)
 expectCurrentProductionLedger(state)
 const sql=readFileSync(resolve(directory,'20261104110000_project_total_allowance.sql'),'utf8').replaceAll('\r\n','\n')
 expect(receipt.migration[0].statement_sha256).toBe(createHash('sha256').update(sql).digest('hex'))
 expect(receipt.active_caps).toBe(0)
 expect(receipt.project.paused).toBe(true)
 expect(receipt.functions.every((fn:{anon:boolean;authenticated:boolean})=>!fn.anon&&!fn.authenticated)).toBe(true)
 expect(receipt.constraints.every((constraint:{validated:boolean})=>constraint.validated)).toBe(true)
})
