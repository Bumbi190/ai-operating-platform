import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '../../../../../')

function read(path) {
  return readFileSync(join(root, path), 'utf8')
}

function listFiles(dir) {
  const base = join(root, dir)
  return readdirSync(base).flatMap(name => {
    const path = join(base, name)
    const relative = join(dir, name)
    return statSync(path).isDirectory() ? listFiles(relative) : [relative]
  })
}

test('manager evaluation persistence uses canonical Stage 1 columns', () => {
  const route = read('apps/web/app/api/manager/route.ts')

  assert.match(route, /toCanonicalManagerEvaluationRecord/)
  assert.doesNotMatch(route, /evaluator_name/)
  assert.doesNotMatch(route, /approval_id,\s*\n\s*evaluator_name/)
  assert.doesNotMatch(route, /score:\s*evaluation\.score/)
  assert.doesNotMatch(route, /approved:\s*evaluation\.approved/)

  const helper = read('apps/web/lib/ai/memory/stage1-foundation.ts')
  assert.match(helper, /overall_score/)
  assert.match(helper, /passed/)
  assert.match(helper, /content_type/)
  assert.match(helper, /project_id/)
})

test('feedback-derived memory still writes content_feedback and platform_memory', () => {
  const feedbackStore = read('apps/web/lib/ai/memory/feedback-store.ts')
  const approvalRoute = read('apps/web/app/api/approvals/[id]/route.ts')

  assert.match(feedbackStore, /\.from\('content_feedback'\)/)
  assert.match(feedbackStore, /\.from\('platform_memory'\)/)
  assert.match(feedbackStore, /Math\.min\(0\.99/)
  assert.match(feedbackStore, /rejection_triggers/)
  assert.match(feedbackStore, /avoided_phrases/)
  assert.match(approvalRoute, /runs\(project_id\)/)
  assert.doesNotMatch(approvalRoute, /existing\.project_id/)
})

test('memory seed route validates request fields and The Prompt project scope', () => {
  const route = read('apps/web/app/api/memory/patterns/route.ts')
  const page = read('apps/web/app/(platform)/memory/page.tsx')

  assert.match(route, /readMemoryPatternPostFields/)
  assert.match(route, /validateMemoryPatternPostFields/)
  assert.match(route, /isThePromptSeedProject/)
  assert.match(route, /owner_id/)
  assert.match(page, /STAGE1_THE_PROMPT_SEED_ACTION/)
  assert.match(page, /canSeedThePromptMemory/)
})

test('memory correction path tombstones with auditability instead of hard delete', () => {
  const route = read('apps/web/app/api/memory/patterns/route.ts')
  const store = read('apps/web/lib/ai/memory/memory-store.ts')

  assert.match(route, /tombstoneMemoryItem/)
  assert.match(route, /Memory item not found/)
  assert.match(route, /lifecycleState: 'tombstoned'/)
  assert.match(store, /lifecycle_state: 'tombstoned'/)
  assert.match(store, /audit_events/)
  assert.match(store, /\.eq\('lifecycle_state', 'active'\)/)
  assert.doesNotMatch(store, /\.delete\(\)/)
})

test('normal Stage 1 migrations do not contain DROP TABLE', () => {
  const migrationFiles = listFiles('supabase/migrations').filter(file => file.endsWith('.sql'))

  assert.ok(migrationFiles.some(file => file.includes('20260706_stage1_memory_foundation.sql')))
  assert.ok(migrationFiles.some(file => file.includes('20260522_evaluation_memory_fix.sql')))
  for (const file of migrationFiles) {
    assert.doesNotMatch(read(file), /\bDROP\s+TABLE\b/i, `${file} must not drop tables`)
  }
})

test('Stage 1 migration backfills lifecycle and audit fields before enforcing defaults', () => {
  const sql = read('supabase/migrations/20260706_stage1_memory_foundation.sql')

  assert.match(sql, /ADD COLUMN IF NOT EXISTS lifecycle_state TEXT;/)
  assert.match(sql, /ADD COLUMN IF NOT EXISTS audit_events JSONB;/)
  assert.match(sql, /SET lifecycle_state = 'active'\s+WHERE lifecycle_state IS NULL;/)
  assert.match(sql, /SET audit_events = '\[\]'::jsonb\s+WHERE audit_events IS NULL;/)
  assert.match(sql, /ALTER COLUMN lifecycle_state SET DEFAULT 'active'/)
  assert.match(sql, /ALTER COLUMN lifecycle_state SET NOT NULL/)
  assert.match(sql, /ALTER COLUMN audit_events SET DEFAULT '\[\]'::jsonb/)
  assert.match(sql, /ALTER COLUMN audit_events SET NOT NULL/)
})

test('fresh setup schemas contain canonical Stage 1 tables and lifecycle fields', () => {
  for (const file of [
    'packages/db/schema.sql',
    'packages/db/full_schema_run_in_supabase.sql',
  ]) {
    const sql = read(file)

    assert.match(sql, /CREATE TABLE IF NOT EXISTS evaluations/)
    assert.match(sql, /project_id\s+UUID\s+NOT NULL REFERENCES projects/)
    assert.match(sql, /content_type\s+TEXT\s+NOT NULL/)
    assert.match(sql, /CREATE TABLE IF NOT EXISTS content_feedback/)
    assert.match(sql, /CREATE TABLE IF NOT EXISTS platform_memory/)
    assert.match(sql, /lifecycle_state/)
    assert.match(sql, /audit_events/)
  }
})
