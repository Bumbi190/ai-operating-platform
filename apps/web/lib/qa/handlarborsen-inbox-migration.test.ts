import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { inspectCanonicalMigrationFiles, evaluateAppliedMigrationLedger } from '../../scripts/migration-guard-policy.mjs'

const migration = 'handlarborsen_candidate_inbox_v1'
const dir = resolve(process.cwd(), 'supabase/migrations')
const normalize = (value: string) => value.replace(/\r\n/g, '\n')
describe('approved Handlarborsen inbox schema promotion', () => {
  it('preserves every approved proposal byte after the promotion comment', () => {
    const names = readdirSync(dir).filter(name => name.endsWith('_' + migration + '.sql'))
    expect(names).toHaveLength(1)
    const canonical = normalize(readFileSync(resolve(dir, names[0]), 'utf8'))
    const proposal = normalize(readFileSync(resolve(process.cwd(), '../../docs/sql/handlarborsen_candidate_inbox_p0_proposed.sql'), 'utf8'))
    expect(canonical.split('\n').slice(1).join('\n')).toBe(proposal.split('\n').slice(1).join('\n'))
    expect(canonical).toContain('-- Operator-approved 2026-10-17; canonical inbox schema.')
  })
  it('enforces the new schema rather than grandfathering or ignoring its ledger name', () => {
    const state = inspectCanonicalMigrationFiles(readdirSync(dir))
    expect(state.enforcedNames).toContain(migration)
    expect(state.grandfatheredNames).not.toContain(migration)
    expect(() => evaluateAppliedMigrationLedger(state.repositoryNames.filter(name => name !== migration), state)).toThrow(/handlarborsen_candidate_inbox_v1/)
    expect(() => evaluateAppliedMigrationLedger([...state.repositoryNames, migration], state)).toThrow(/duplicate/)
  })
})
