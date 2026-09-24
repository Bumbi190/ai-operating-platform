/** Structural proof that SDF-1B1/B2 remains control-plane-only. */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '../../../..')
const CONTROL = resolve(ROOT, 'apps/web/lib/atlas/code-work/control-plane')
const MIGRATION = resolve(ROOT, 'apps/web/supabase/migrations/20260918095827_sdf1b1_code_work_control_plane.sql')

describe('SDF-1B control plane boundary', () => {
  it('contains only server policy/store modules and no execution bridge', () => {
    const files = readdirSync(CONTROL).filter(file => file.endsWith('.ts')).sort()
    expect(files).toEqual([
      'authorization.ts', 'derive-admission.ts', 'operator-admission.ts',
      'operator-authorization.ts', 'operator-model.ts', 'operator-read.ts',
      'operator-write.ts', 'principal-read.ts', 'principal-write.ts', 'store.ts',
      'types.ts', 'work-package.ts',
    ])
    const source = files.map(file => readFileSync(join(CONTROL, file), 'utf8')).join('\n')
    expect(source).not.toMatch(/(?:node:)?child_process|\b(?:spawn|exec|execFile|fork)\s*\(/)
    expect(source).not.toMatch(/from ['"](?:node:)?fs['"]|\b(?:writeFile|appendFile|mkdir|rm|unlink|rename)\s*\(/)
    expect(source).not.toMatch(/@anthropic-ai\/sdk|from ['"]openai['"]|\bfetch\s*\(|axios/)
    expect(source).not.toMatch(/git\s+(?:worktree|commit|push|merge)|gh\s+pr|vercel\s+(?:deploy|promote)/i)
    expect(source).not.toMatch(/apply[_-]?patch|command[_-]?runner|worker[_-]?adapter.*invoke/i)
  })

  it('keeps B1 persistence unchanged while B2 exposes only its purpose-specific operator route', () => {
    const sql = readFileSync(MIGRATION, 'utf8')
    const executableSql = sql.replace(/--.*$/gm, '')
    expect((sql.match(/create table public\.atlas_code_work_/g) ?? [])).toHaveLength(2)
    expect(sql).toContain('atlas.code_work.receipt_chain.v1')
    expect(sql).toContain("set search_path = ''")
    expect(executableSql).not.toMatch(/cron\.schedule|pg_net|net\.http|http_(?:get|post)|dblink|copy\s+.+program|listen\s|notify\s/i)
    expect(executableSql).not.toMatch(/after\s+(?:insert|update|delete).*atlas_code_work/i)
    expect(existsSync(resolve(ROOT, 'apps/web/app/api/atlas/code-work/route.ts'))).toBe(true)
    expect(existsSync(resolve(ROOT, 'apps/web/app/api/atlas/code-work/[workId]/route.ts'))).toBe(true)
    expect(existsSync(resolve(ROOT, 'apps/web/app/api/atlas/code-work/claim'))).toBe(false)
    expect(existsSync(resolve(ROOT, 'apps/web/app/api/atlas/code-work/execute'))).toBe(false)
    // SDF-1C1 adds identity-only broker routes. The B1/B2 boundary still denies
    // every claim/preflight/execution route and pins the two allowed C1 leaves.
    expect(readdirSync(resolve(ROOT, 'apps/web/app/api/atlas/code-work/broker')).sort()).toEqual(['enroll', 'identity'])
    expect(existsSync(resolve(ROOT, 'apps/web/app/api/atlas/code-work/broker/claim'))).toBe(false)
    expect(existsSync(resolve(ROOT, 'apps/web/app/api/atlas/code-work/broker/preflight'))).toBe(false)
    expect(existsSync(resolve(ROOT, 'apps/web/app/api/atlas/code-work/broker/execute'))).toBe(false)
    expect(existsSync(resolve(ROOT, 'apps/web/app/atlas/code-work'))).toBe(false)
  })

  it('has an anti-skip SQL floor and a dedicated required-check workflow', () => {
    const sqlTest = readFileSync(resolve(ROOT, 'apps/web/lib/qa/sdf1b-code-work-control-plane-sql.test.ts'), 'utf8')
    const workflow = readFileSync(resolve(ROOT, '.github/workflows/sdf1b-control-plane-boundary.yml'), 'utf8')
    expect(sqlTest).toContain("ATLAS_SQL_TEST_REQUIRED === '1'")
    expect(sqlTest).toContain('concurrently(')
    expect(workflow).toContain('SDF-1B Control Plane Boundary')
    expect(workflow).toContain('ATLAS_SQL_TEST_REQUIRED: 1')
    expect(workflow).toContain('postgres:16')
    expect(workflow).toContain('passed < 13')
    expect(workflow).toContain('pending !== 0')
  })
})
