import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { analyze, discoverMigrations, gate, type Registry, type Allowlist } from '@/lib/qa/migration-security-gate'
describe('website migration joins the canonical security gate', () => {
  it('is explicitly registered as observed tenant RLS without a security bypass', () => {
    const registry = JSON.parse(readFileSync(resolve('tests/isolation/schema-security.json'), 'utf8')) as Registry
    const allowlist = JSON.parse(readFileSync(resolve('tests/isolation/migration-security-allowlist.json'), 'utf8')) as Allowlist
    const file = 'apps/web/supabase/migrations/20261014065527_website_build_sessions.sql'
    const analysis = analyze({ files: discoverMigrations(resolve('../..')), registry, allowlist, bootstrapSql: readFileSync(resolve('../../packages/db/full_schema_run_in_supabase.sql'), 'utf8') })
    const findings = analysis.findings.filter(finding => finding.migration === file)
    expect(findings.length).toBeGreaterThan(0)
    expect(gate(findings, allowlist).blocking, JSON.stringify(findings)).toEqual([])
  })
})
