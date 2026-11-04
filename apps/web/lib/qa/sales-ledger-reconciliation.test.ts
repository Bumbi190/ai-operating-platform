import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { inspectCanonicalMigrationFiles, evaluateAppliedMigrationLedger } from '../../scripts/migration-guard-policy.mjs'

describe('already-applied sales schema reconciliation', () => {
  it('retains the exact SQL recorded in production ledger 20261017130254', () => {
    const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261017100633_atlas_sales_pilot.sql'), 'utf8').replace(/\r\n/g, '\n')
    expect(createHash('sha256').update(sql).digest('hex')).toBe('7ea3de34909ac582d2534b291b448fb9ba3781c196167c0475fc4e1f2c301ca9')
  })
  it('enforces the migration and still rejects missing, duplicate and unknown ledger names', () => {
    const state = inspectCanonicalMigrationFiles(readdirSync(resolve(process.cwd(), 'supabase/migrations')))
    expect(state.enforcedNames).toContain('atlas_sales_pilot')
    expect(state.grandfatheredNames).not.toContain('atlas_sales_pilot')
    expect(() => evaluateAppliedMigrationLedger(state.repositoryNames.filter(n => n !== 'atlas_sales_pilot'), state)).toThrow(/atlas_sales_pilot/)
    expect(() => evaluateAppliedMigrationLedger([...state.repositoryNames, 'atlas_sales_pilot'], state)).toThrow(/duplicate/)
    expect(() => evaluateAppliedMigrationLedger([...state.repositoryNames, 'unreviewed_future_schema'], state)).toThrow(/unknown/)
  })
})

it('reconciles the exact already-applied inbox SQL without a grandfathered bypass',()=>{
 const path=resolve(process.cwd(),'supabase/migrations/20261017151021_handlarborsen_candidate_inbox_v1.sql')
 const sql=readFileSync(path,'utf8').replace(/\r\n/g,'\n')
 expect(createHash('sha256').update(sql).digest('hex')).toBe('e7f3efe782086aa8f818ab071dab7c96ccadde95ec58320e30048bd487fe663c')
 const proposal=readFileSync(resolve(process.cwd(),'../../docs/sql/handlarborsen_candidate_inbox_p0_proposed.sql'),'utf8').replace(/\r\n/g,'\n')
 expect(sql.split('\n').slice(1)).toEqual(proposal.split('\n').slice(1))
 const state=inspectCanonicalMigrationFiles(readdirSync(resolve(process.cwd(),'supabase/migrations')))
 expect(state.enforcedNames).toContain('handlarborsen_candidate_inbox_v1')
 expect(state.grandfatheredNames).not.toContain('handlarborsen_candidate_inbox_v1')
})
