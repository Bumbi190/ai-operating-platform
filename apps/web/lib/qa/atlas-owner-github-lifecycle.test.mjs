import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = (relative) => readFileSync(fileURLToPath(new URL(relative, import.meta.url)), 'utf8')
const candidate = read('../../../../docs/architecture/proposed-sql/atlas_owner_github_lifecycle_OPTION_NOT_MIGRATION.sql')
const bootstrap = read('./fixtures/atlas-owner-github-rls/bootstrap_pg17.sql')
const fixture = read('./fixtures/atlas-owner-github-rls/verify_lifecycle_pg17.sql')
const runner = read('../../../../scripts/atlas/verify-owner-github-pg17-rls.ps1')
const tidy = s => s.toLowerCase().replace(/--[^\n]*/g, '').replace(/\s+/g,' ')
const sql = tidy(candidate)

describe('Atlas lifecycle OPTION: no production migration or live provider calls', () => {
  it('is explicitly an alternative NOT a canonical production migration', () => {
    assert.match(candidate,/NOT A CANONICAL MIGRATION/)
    assert.match(candidate,/DO NOT RUN ON LIVE SUPABASE/)
    assert.match(candidate,/independent security\/retention review/i)
  })
  it('keeps both project-owner integrity and safe cascading account erasure', () => {
    assert.match(sql,/foreign key \(project_id,owner_user_id\)/)
    assert.match(sql,/references public\.projects\(id,owner_id\) on delete cascade/)
    assert.match(sql,/foreign key \(owner_user_id\) references auth\.users\(id\) on delete cascade/)
    assert.match(sql,/foreign key \(approved_by\) references auth\.users\(id\) on delete cascade/)
    assert.doesNotMatch(sql,/references public\.projects\(id,owner_id\) on delete restrict/)
  })
  it('separates binding record lifecycle from project-owned audit events', () => {
    assert.match(sql,/create table public\.atlas_owner_github_binding_events/)
    assert.match(sql,/binding_id uuid not null/)
    assert.match(sql,/unique\(binding_id,event_sequence\)/)
    assert.match(sql,/references public\.projects\(id,owner_id\) on delete cascade/)
    assert.doesNotMatch(sql,/binding_id[^\n]{0,80}references public\.atlas_owner_github_bindings/)
  })
  it('does not allow new unapproved provider or high-privilege access', () => {
    assert.match(sql,/alter table public\.atlas_owner_github_binding_events enable row level security/)
    assert.match(sql,/revoke all on public\.atlas_owner_github_binding_events from public, anon, authenticated, service_role/)
    assert.match(sql,/grant select on public\.atlas_owner_github_binding_events to authenticated/)
    assert.match(sql,/grant select on public\.atlas_owner_github_binding_events to service_role/)
    assert.doesNotMatch(sql,/grant\s+(?:insert|update|delete|all)\s+on public\.atlas_owner_github_binding_events/)
    assert.doesNotMatch(sql,/create\s+(?:or replace\s+)?function|security definer|migration_guard_override/)
  })
  it('scopes project audit reads to authenticated project owner', () => {
    assert.match(sql,/for select to authenticated/)
    assert.match(sql,/owner_user_id = \(select auth\.uid\(\)\)/)
    assert.match(sql,/p\.id = atlas_owner_github_binding_events\.project_id/)
    assert.match(sql,/p\.owner_id = \(select auth\.uid\(\)\)/)
  })
  it('documents lack of real decision signatures and actual provider-token revocation', () => {
    assert.match(candidate,/NOT independent proof of/i)
    assert.match(candidate,/not sufficient/i)
    assert.match(candidate,/revoke/i)
    assert.match(candidate,/token/i)
    assert.doesNotMatch(sql,/\b(?:api_key|private_key|access_token|password)\s+(?:text|bytea|varchar)/)
  })
  it('replays revoke, stable audit history, and deletion with one foreign owner preserved', () => {
    assert.match(fixture,/with revoked as \(/i)
    assert.match(fixture,/state='approved' and revoked_at is null/)
    assert.match(fixture,/event_kind,decision_receipt_sha256/)
    assert.match(fixture,/stale duplicate revocation is denied/)
    assert.match(fixture,/unlinked repo has no live mapping but retains 3 project-owned events/)
    assert.match(fixture,/project deletion erases linked audit/)
    assert.match(fixture,/owner erasure cascades only own mappings\/audit; foreign owner intact/)
  })
  it('retains the explicit hold on owner transfer and auth/account lifecycle decision', () => {
    assert.match(fixture,/EXPECTED BLOCKER: project ownership transfer needs explicit unlink and audit handling/)
    assert.match(candidate,/privacy|erasure/i)
    assert.match(bootstrap,/on delete cascade/i)
  })
  it('runs the variant only on the existing disposable networkless PG17 fixture', () => {
    assert.match(runner,/param\(\[switch\]\$LifecycleVariant\)/)
    assert.match(runner,/if \(\$LifecycleVariant\)/)
    assert.match(runner,/lifecycle_option_pg17\.sql/)
    assert.match(runner,/verify_lifecycle_pg17\.sql/)
    assert.match(runner,/--network none --memory 256m --cpus 0\.6/)
    assert.match(runner,/--rm -d --name \$name/)
    assert.match(runner,/if \(\$existing -contains \$name\)/)
    assert.match(runner,/finally \{/)
    assert.match(runner,/docker stop --time 1 \$name/)
    assert.doesNotMatch(runner,/--publish|--privileged|--volume/)
  })
  it('does not add production migrations, release schedules or credentials', () => {
    assert.doesNotMatch(candidate,/\bBEGIN PRIVATE KEY|\bsk-(?:proj-)?[A-Za-z0-9]{20}/)
    assert.doesNotMatch(tidy(candidate),/\b(?:drop table public\.projects|delete from public\.projects|delete from auth\.users)\b/)
    assert.match(fixture,/PG17 lifecycle alternative completed/)
  })
})
