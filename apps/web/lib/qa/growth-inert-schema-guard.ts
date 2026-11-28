/**
 * Growth Engine's first migration is intentionally inert. This is a scoped
 * fail-closed source/replay check, NOT a PostgreSQL ACL or Data API proof.
 * Any subsequent migration directly mentioning this boundary requires a
 * separate reviewed change to this guard. Indirect/dynamic SQL, role inheritance
 * and actual deployed exposure still require target-specific catalog checks.
 */
import { createHash } from 'node:crypto'
import type { Allowlist, MigrationFile, Model } from './migration-security-gate'

export const GROWTH_INERT_NAME = 'growth_machine_foundation_inert'
export const GROWTH_INERT_LF_SHA256 = 'dce92b5b16571657d71c038033abe2eb30ac12bd0d9db58b58d3bcd70ab10b3b'
export const GROWTH_INERT_SCHEMAS: readonly string[] = [
  'ge_authority_private', 'ge_capture', 'ge_delivery', 'ge_outbox', 'ge_stage_api',
]
const TABLES = [
  'ge_capture.batches', 'ge_capture.machine_grants', 'ge_capture.measurements',
  'ge_capture.publications', 'ge_outbox.jobs',
]
const POLICIES = [
  'ge_capture.batches|ge_stage_batch_read', 'ge_capture.batches|ge_stage_batch_update',
  'ge_capture.machine_grants|ge_stage_grant_lock', 'ge_capture.machine_grants|ge_stage_grant_select',
  'ge_capture.machine_grants|ge_stage_grant_write_denied',
  'ge_capture.measurements|ge_stage_measure_insert', 'ge_capture.measurements|ge_stage_measure_read',
  'ge_capture.publications|ge_stage_pub_insert', 'ge_capture.publications|ge_stage_pub_read',
  'ge_outbox.jobs|ge_stage_job_insert', 'ge_outbox.jobs|ge_stage_job_read',
  'ge_outbox.jobs|ge_stage_job_update',
]
const marker = /\b(?:ge_authority_(?:private|api|exec|anon)|ge_capture(?:_exec)?|ge_delivery|ge_outbox(?:_[a-z0-9_]+)?|ge_stage_[a-z0-9_]+|growth_authority_generation|growth_owner_generation(?:_assert)?|growth_release_inert|capture_batch_(?:guard|no_truncate)|capture_(?:publications|measurements)_immutable)\b/i
const filename = /^\d{14}_growth_machine_foundation_inert\.sql$/
const sameSet = (a: string[], b: string[]) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort())
const digest = (s: string) => createHash('sha256').update(s.replace(/\r\n/g, '\n'), 'utf8').digest('hex')

type Source = Pick<MigrationFile, 'relPath' | 'root' | 'sql'> | { relPath: string; root: 'bootstrap'; sql: string }
export interface GrowthInertIssue {
  migration: string
  root: MigrationFile['root'] | 'bootstrap'
  detail: string
}

/** Exact reviewed introduction + exact table/policy inventory. No exception path. */
export function inspectGrowthInertBoundary(
  files: MigrationFile[], bootstrapSql: string, allowlist: Allowlist, model: Model,
): GrowthInertIssue[] {
  const bootstrap: Source = { relPath: 'packages/db/full_schema_run_in_supabase.sql', root: 'bootstrap', sql: bootstrapSql }
  const entries = allowlist.internal_schemas.filter(s => GROWTH_INERT_SCHEMAS.includes(s.schema) || s.schema === 'ge_authority_api')
  const candidates = files.filter(f => filename.test(f.name))
  // Deliberately conservative even about comments/string literals. This is a
  // review tripwire for directly visible references, not an SQL parser.
  const references: Source[] = [bootstrap, ...files].filter(f => marker.test(f.sql))
  if (entries.length === 0 && candidates.length === 0 && references.length === 0) return []
  const anchor: Source = candidates[0] ?? references[0] ?? {
    relPath: 'apps/web/tests/isolation/migration-security-allowlist.json', root: 'bootstrap', sql: '',
  }
  const issues: GrowthInertIssue[] = []
  const fail = (detail: string, source: Source = anchor) => {
    issues.push({ migration: source.relPath, root: source.root, detail })
  }
  if (candidates.length !== 1) fail('Expected exactly one named canonical inert Growth foundation; found ' + candidates.length)
  const install = candidates.length === 1 ? candidates[0] : undefined
  if (install) {
    if (install.root !== 'apps/web' || install.relPath !== 'apps/web/supabase/migrations/' + install.name ||
        install.version !== install.name.slice(0, 14)) {
      fail('Growth foundation must be in the canonical apps/web migration root', install)
    }
    if (digest(install.sql) !== GROWTH_INERT_LF_SHA256) fail('Growth foundation SQL differs from the exact reviewed LF-normalized source', install)
  }
  for (const f of references) if (f !== install) fail('Unreviewed migration or bootstrap directly references the inert Growth boundary', f)
  if (!sameSet(entries.map(s => s.schema), [...GROWTH_INERT_SCHEMAS]) ||
      entries.some(s => s.exposed_via_data_api !== false || !s.verified?.trim() || !s.justification?.trim())) {
    fail('All five unique internal-schema classifications must be present with nonexposure and evidence; no partial or speculative classification')
  }
  const rels = [...model.rels.values()].filter(r => GROWTH_INERT_SCHEMAS.includes(r.schema))
  if (!sameSet(rels.map(r => r.key), TABLES)) fail('Private Growth relation inventory differs from the five reviewed tables')
  for (const r of rels) {
    if (r.kind !== 'table' || !r.rls) fail('Growth relation must be a table with RLS enabled: ' + r.key)
    for (const [role, privileges] of r.grants) {
      if (privileges.size > 0 && role !== 'ge_capture_exec') fail('Unexpected modeled direct Growth table grant: ' + r.key + ' to ' + role)
    }
  }
  const policies = [...model.pols.values()].filter(p => GROWTH_INERT_SCHEMAS.includes(p.table.split('.')[0]))
  if (!sameSet(policies.map(p => p.table + '|' + p.name), POLICIES)) fail('Private Growth policy inventory differs from the twelve reviewed policies')
  for (const p of policies) {
    if (!p.explicitRoles || !sameSet(p.roles, ['ge_capture_exec'])) fail('Growth policy not restricted to the NOLOGIN executor: ' + p.table + ' ' + p.name)
  }
  return issues
}