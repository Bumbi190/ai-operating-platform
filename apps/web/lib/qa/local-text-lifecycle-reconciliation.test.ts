import {createHash} from 'node:crypto'
import {existsSync,readFileSync,readdirSync} from 'node:fs'
import {resolve} from 'node:path'
import {describe,expect,it} from 'vitest'
import {inspectCanonicalMigrationFiles,evaluateAppliedMigrationLedger,LEGACY_ONLY_PRODUCTION_LEDGER_NAMES} from '../../scripts/migration-guard-policy.mjs'
const dir=resolve(process.cwd(),'supabase/migrations')
describe('exact source of already-applied local-text lifecycle',()=>{
  it('preserves the source deployed in ledger20261017180713',()=>{
    const path=resolve(dir,'20261017115403_atlas_local_text_lifecycle.sql')
    expect(existsSync(path)).toBe(true)
    const sql=readFileSync(path,'utf8').replace(/\r\n/g,'\n')
    expect(sql.length).toBe(59067)
    expect(createHash('sha256').update(sql).digest('hex')).toBe('d5c1ca9aba0c993a6be27625cfa9852d0eb719be5ccc5eb826bfa95acfd0aba3')
  })
  it('requires the lifecycle ledger name once without changing frozen allowlists',()=>{
    const state=inspectCanonicalMigrationFiles(readdirSync(dir))
    expect(state.enforcedNames).toContain('atlas_local_text_lifecycle')
    const names=[...state.repositoryNames,...LEGACY_ONLY_PRODUCTION_LEDGER_NAMES]
    expect(()=>evaluateAppliedMigrationLedger(names.filter(n=>n!=='atlas_local_text_lifecycle'),state)).toThrow(/atlas_local_text_lifecycle/)
    expect(()=>evaluateAppliedMigrationLedger([...names,'atlas_local_text_lifecycle'],state)).toThrow(/duplicate/)
  })
})
