import {test} from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync,readdirSync} from 'node:fs'
import {join} from 'node:path'

const canonical=readdirSync('apps/web/supabase/migrations')
  .filter(name=>/_the_prompt_factcheck_evidence_v1\.sql$/.test(name))
assert.deepEqual(canonical,[],
  'Unreleased FactCheck SQL must NOT enter the canonical production migrations')
const files=readdirSync('docs/workflows/proposed-migrations')
  .filter(name=>/_the_prompt_factcheck_evidence_v1\.sql$/.test(name))
assert.equal(files.length,1,'Exactly one proposed FactCheck migration is required')
const migration=readFileSync(join('docs/workflows/proposed-migrations',files[0]),'utf8')
const pagePath='apps/web/app/(platform)/projects/[slug]/factcheck/page.tsx'
const page=readFileSync(pagePath,'utf8')
const media=readFileSync(
  'apps/web/app/(platform)/projects/[slug]/media/page.tsx','utf8')

test('private fact-check evidence table exists only in draft migration',()=>{
  assert.match(migration,/create table public\.media_factcheck_reports\s*\(/i)
  assert.match(migration,/project_id uuid not null references public\.projects/i)
  assert.match(migration,/script_id uuid not null references public\.media_scripts/i)
  assert.match(migration,/run_id uuid not null references public\.runs/i)
  assert.match(migration,/claim_id uuid not null/i)
  assert.match(migration,/content_sha256 text not null/i)
  assert.match(migration,/source_set_sha256 text/i)
  assert.match(migration,/manuscript_snapshot jsonb not null/i)
  assert.match(migration,/findings jsonb not null/i)
  assert.match(migration,/source_receipts jsonb not null/i)
})

test('report is evidence, never editorial approval or dispatch authority',()=>{
  assert.match(migration,/outcome in \('ready_for_editor','requires_review','rejected'\)/)
  assert.match(migration,/constraint media_factcheck_report_outcome_guard check/i)
  assert.match(migration,/outcome = 'ready_for_editor'/)
  assert.match(migration,/source_set_sha256 is not null/i)
  assert.match(migration,/jsonb_array_length\(source_receipts\) >= 2/i)
  assert.doesNotMatch(migration,/create policy/i)
  assert.doesNotMatch(migration,/publish.*\(/i)
})

test('private table has RLS and no anon/authenticated grants',()=>{
  assert.match(migration,/alter table public\.media_factcheck_reports enable row level security/i)
  assert.match(migration,/revoke all on public\.media_factcheck_reports from public, anon, authenticated, service_role/i)
  assert.match(migration,/grant select, insert on public\.media_factcheck_reports to service_role/i)
  assert.doesNotMatch(migration,/grant\s+.*(?:update|delete).*media_factcheck_reports/i)
  assert.doesNotMatch(migration,/security definer/i)
})

test('append-only even for privileged roles',()=>{
  assert.match(migration,/raise exception 'FACTCHECK_EVIDENCE_IMMUTABLE'/i)
  assert.match(migration,/before update or delete on public\.media_factcheck_reports/i)
  assert.match(migration,/for each row execute function public\.media_factcheck_report_append_only/i)
})

test('insert guard binds run claim and script to the same project',()=>{
  assert.match(migration,/id = new\.script_id and project_id = new\.project_id for share/i)
  assert.match(migration,/coalesce\(script_row\.version, 1\) <> new\.script_version/i)
  assert.match(migration,/script_row\.captions/i)
  assert.match(migration,/run_row\.project_id is distinct from new\.project_id/i)
  assert.match(migration,/run_row\.claim_id is distinct from new\.claim_id/i)
  assert.match(migration,/run_row\.cancel_requested/i)
  assert.match(migration,/current_user not in \('service_role', 'postgres'\)/i)
})

test('history page uses RLS project identity BEFORE privileged scoped reads',()=>{
  assert.match(page,/export const dynamic = 'force-dynamic'/)
  const getIndex=page.indexOf('await getProjectBySlug(params.slug)')
  const blockIndex=page.indexOf("project.slug !== 'ai-media-automation'")
  const adminIndex=page.indexOf('createAdminClient()')
  assert.ok(getIndex>0 && blockIndex>getIndex && adminIndex>blockIndex)
  assert.match(page,/\.from\('media_factcheck_reports'\)/)
  assert.match(page,/\.eq\('project_id', project\.id\)/)
  assert.match(page,/\.limit\(25\)/)
  assert.doesNotMatch(page,/\.insert\(|\.update\(|\.delete\(|\.upsert\(/)
})

test('unavailable schema gives truthful disabled state without fake records',()=>{
  assert.match(page,/if \(error\)/)
  assert.match(page,/Rapportlagring är ännu inte tillgänglig/)
  assert.match(page,/Inga sparade faktagranskningar ännu/)
  assert.match(page,/Befintliga kvalitetsbetyg på manus räknas inte som faktagranskningar/)
  assert.match(page,/Granskning är inte samma sak som publicering/)
})

test('owner can navigate to history only from The Prompt media area',()=>{
  assert.match(media,/isNewsProject && \(/)
  assert.match(media,/\/projects\/\$\{params\.slug\}\/factcheck/)
  assert.match(page,/recognizeSource\(obj\.url\)/)
  assert.match(page,/rel="noopener noreferrer"/)
})

test('schema registry must not claim a not-yet-canonical proposal is deployed',()=>{
  const registry=JSON.parse(readFileSync('apps/web/tests/isolation/schema-security.json','utf8'))
  assert.equal(Object.hasOwn(registry.tables,'media_factcheck_reports'),false)
  assert.equal(registry._meta?.created_not_live?.tables?.includes('media_factcheck_reports'),false)
  assert.match(migration,/private, append-only source-grounded review evidence/i)
  assert.match(migration,/grant select, insert on public\.media_factcheck_reports to service_role/i)
})
