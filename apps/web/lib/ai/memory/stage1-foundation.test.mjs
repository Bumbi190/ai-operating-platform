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

test('manager evaluate contract is typed and route-compatible', () => {
  const manager = read('apps/web/lib/ai/manager.ts')
  const route = read('apps/web/app/api/manager/route.ts')
  const helper = read('apps/web/lib/ai/memory/stage1-foundation.ts')

  // Real typed return contract on the Manager class.
  assert.match(manager, /export interface EvaluationResult \{/)
  assert.match(manager, /async evaluateOutput\(approvalId: string\): Promise<EvaluationResult>/)

  // The EvaluationResult shape satisfies ManagerEvaluationInput (route passes
  // the result straight into toCanonicalManagerEvaluationRecord).
  const evaluationResult = manager.match(/export interface EvaluationResult \{[\s\S]*?\n\}/)?.[0] ?? ''
  assert.match(evaluationResult, /score: number/)
  assert.match(evaluationResult, /approved: boolean/)
  assert.match(evaluationResult, /issues: string\[\]/)
  assert.match(evaluationResult, /feedback: string/)
  assert.match(helper, /export interface ManagerEvaluationInput \{/)

  // Route still calls the restored contract and persists canonically.
  assert.match(route, /manager\.evaluateOutput\(approval_id\)/)
  assert.match(route, /toCanonicalManagerEvaluationRecord\(evaluation/)
})

test('evaluate action authorizes project ownership before LLM call and persistence', () => {
  const route = read('apps/web/app/api/manager/route.ts')

  // The route resolves the caller's allow-list and gates on it.
  assert.match(route, /getAllowedProjectIds/)
  assert.match(route, /assertProjectAllowed\(projectId, allowedProjectIds\)/)

  // Missing, lineage-less, and foreign approvals share ONE fail-closed 404 —
  // existence of another user's approval must not be leakable.
  assert.match(route, /!approval \|\| !projectId \|\| !assertProjectAllowed/)
  assert.match(route, /\{ error: 'Not found' \}, \{ status: 404 \}/)

  // Ordering invariant: ownership gate BEFORE the LLM call, LLM call BEFORE
  // canonical persistence. No admin-side effect can precede authorization.
  const gateAt = route.indexOf('assertProjectAllowed(projectId, allowedProjectIds)')
  const llmAt = route.indexOf('manager.evaluateOutput(approval_id)')
  const persistAt = route.indexOf("from('evaluations')")
  assert.ok(gateAt > -1 && llmAt > -1 && persistAt > -1)
  assert.ok(gateAt < llmAt, 'ownership gate must precede the LLM evaluation call')
  assert.ok(llmAt < persistAt, 'persistence must follow the gated evaluation')

  // The gate uses the shared fail-closed isolation boundary, not an ad-hoc check.
  const isolation = read('apps/web/lib/atlas/isolation.ts')
  assert.match(isolation, /if \(!userId\) return \[\]/)
  assert.match(isolation, /allowedIds\.includes\(id\)/)
})

test('tombstoning preserves existing audit events and appends the tombstone event', () => {
  const store = read('apps/web/lib/ai/memory/memory-store.ts')

  // Existing events are read first, kept, and the new event is appended.
  assert.match(store, /\.select\('audit_events'\)/)
  assert.match(store, /Array\.isArray\(existing\.audit_events\)/)
  assert.match(store, /audit_events: \[\.\.\.auditEvents, event\]/)
  assert.match(store, /createMemoryLifecycleAuditEvent/)
  assert.match(store, /tombstoned_by: actorId/)
  // No physical delete anywhere in the store.
  assert.doesNotMatch(store, /\.delete\(\)/)
})

test('generated Supabase types expose Stage 1 platform_memory lifecycle columns', () => {
  const types = read('apps/web/lib/supabase/database.types.ts')
  const block = types.match(/platform_memory: \{[\s\S]*?Relationships/)?.[0] ?? ''

  assert.match(block, /audit_events: Json/)
  assert.match(block, /lifecycle_state: string/)
  assert.match(block, /correction_state: string \| null/)
  assert.match(block, /tombstoned_at: string \| null/)
  assert.match(block, /tombstoned_by: string \| null/)
  // Database-defaulted columns stay optional in Insert.
  assert.match(block, /audit_events\?: Json/)
  assert.match(block, /lifecycle_state\?: string/)
})

test('no Stage 2 retrieval or embedding behavior in the memory module', () => {
  const memoryFiles = listFiles('apps/web/lib/ai/memory')
    .filter(file => !file.endsWith('.test.mjs'))
  for (const file of memoryFiles) {
    const source = read(file)
    assert.doesNotMatch(source, /embedding/i, `${file} must not contain embeddings (Stage 2)`)
    assert.doesNotMatch(source, /pgvector/i, `${file} must not contain pgvector (Stage 2)`)
  }
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
