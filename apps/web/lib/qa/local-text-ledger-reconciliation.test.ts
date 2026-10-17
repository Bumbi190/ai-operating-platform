import { createHash } from 'node:crypto'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { inspectCanonicalMigrationFiles, evaluateAppliedMigrationLedger, LEGACY_ONLY_PRODUCTION_LEDGER_NAMES } from '../../scripts/migration-guard-policy.mjs'
const dir=resolve(process.cwd(),'supabase/migrations')
describe('source-only reconciliation of already-applied local text authority',()=>{
  it('retains the exact frozen source deployed as ledger20261017174301',()=>{
    const file=resolve(dir,'20261017090351_atlas_local_text.sql')
    expect(existsSync(file)).toBe(true)
    const sql=readFileSync(file,'utf8').replace(/\r\n/g,'\n')
    expect(sql.length).toBe(95490)
    expect(createHash('sha256').update(sql).digest('hex')).toBe('5024a72db523f63ce7f42f4a5e0f774d50b34cda9a3f6e6f1c3f698610eba180')
  })
  it('requires that exact enforced name once and rejects missing or duplicate entries',()=>{
    const state=inspectCanonicalMigrationFiles(readdirSync(dir))
    expect(state.enforcedNames).toContain('atlas_local_text')
    const names=[...state.repositoryNames,...LEGACY_ONLY_PRODUCTION_LEDGER_NAMES]
    expect(()=>evaluateAppliedMigrationLedger(names.filter(n=>n!=='atlas_local_text'),state)).toThrow(/atlas_local_text/)
    expect(()=>evaluateAppliedMigrationLedger([...names,'atlas_local_text'],state)).toThrow(/duplicate/)
  })
})
