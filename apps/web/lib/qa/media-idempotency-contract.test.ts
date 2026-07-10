import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const repoRoot = join(__dirname, '..', '..', '..', '..')

function read(path: string) {
  return readFileSync(join(repoRoot, path), 'utf8')
}

describe('media pipeline idempotency contract', () => {
  it('9. two concurrent cron runs select work through SKIP LOCKED claim functions', () => {
    const migration = read('supabase/migrations/20260707190359_media_semantic_duplicate_guard.sql')
    expect(migration).toContain('for update skip locked')
    expect(migration).toContain('claim_pending_novelty_review')
    expect(migration).toContain('claim_media_script_for_voice')
    expect(migration).toContain('claim_media_script_for_render')
    expect(migration).toContain('p_project_id uuid')
    expect(migration).toContain("n.novelty_policy_outcome = 'novelty_passed'")
    expect(migration).toContain('n.novelty_workflow_run_id is not null')
  })

  it('10. retry after script failure reuses the same news item instead of creating parallel active scripts', () => {
    const fullPipeline = read('apps/web/app/api/media/pipeline/full/route.ts')
    const migration = read('supabase/migrations/20260707190359_media_semantic_duplicate_guard.sql')
    expect(fullPipeline).toContain("Existing script reused for this news item")
    expect(fullPipeline).toContain(".eq('news_item_id', newsItemId)")
    expect(migration).toContain('unique_active_script_per_news_item')
  })

  it('11. retry after render failure resumes the same script through the render claim', () => {
    const step3 = read('apps/web/app/api/media/cron/step3/route.ts')
    const retry = read('apps/web/app/api/media/cron/pipeline-retry/route.ts')
    expect(step3).toContain("rpc('claim_media_script_for_render'")
    expect(step3).toContain('p_project_id')
    expect(retry).toContain("callStep('/api/media/cron/step3', s.id)")
  })

  it('12. publication claiming is delegated to the atomic database RPC', () => {
    const ledger = read('apps/web/lib/media/publication-ledger.ts')
    const migration = read('supabase/migrations/20260707190359_media_semantic_duplicate_guard.sql')
    expect(ledger).toContain("rpc('claim_media_publication'")
    expect(migration).toContain('create or replace function public.claim_media_publication')
    expect(migration).toContain("return query select 'in_progress'")
    expect(migration).toContain("return query select 'already_published'")
    expect(migration).toContain('unknown_external_outcome')
    expect(migration).toContain('reconciliation_required')
    expect(migration).toContain('provider_attempt_id is not null')
    expect(migration).toContain('provider_container_id is null')
    expect(migration).toContain('provider attempt started without a persisted container id')
  })

  it('12b. retryable_failed rows with persisted upload-session evidence are never actionable retry claims', () => {
    const migration = read('supabase/migrations/20260707190359_media_semantic_duplicate_guard.sql')
    // The defense-in-depth branch exists…
    expect(migration).toContain("row.state = 'retryable_failed'")
    expect(migration).toContain('provider upload-session evidence exists without an external id; reconcile before retry')
    // …with the exact fail-closed predicate (evidence present, no external id,
    // container-carrying Instagram retries stay reclaimable)…
    const guard = migration.indexOf("if row.state = 'retryable_failed'")
    expect(guard).toBeGreaterThan(-1)
    const guardBlock = migration.slice(guard, migration.indexOf('end if;', guard))
    expect(guardBlock).toContain('row.provider_attempt_id is not null')
    expect(guardBlock).toContain('row.provider_container_id is null')
    expect(guardBlock).toContain('row.external_publication_id is null')
    expect(guardBlock).toContain("state = 'reconciliation_required'")
    // …and it runs before the final reclaim update can hand back a retry.
    const reclaim = migration.indexOf("retry_count = case when row.state = 'retryable_failed'")
    expect(reclaim).toBeGreaterThan(guard)
    // Runtime behavior of the claim function is verified against real
    // PostgreSQL in supabase/tests/claim_media_publication_guard.test.sql;
    // the route-level fail-closed behavior is proven in
    // lib/qa/media-youtube-publication.test.ts.
  })

  it('12c. publish routes classify ambiguous Facebook outcomes as unknown, not retryable', () => {
    const facebook = read('apps/web/lib/media/facebook.ts')
    const cronPublish = read('apps/web/app/api/media/cron/publish/route.ts')
    const manualPublish = read('apps/web/app/api/media/publish/instagram/route.ts')
    expect(facebook).toContain('FacebookAmbiguousOutcomeError')
    expect(cronPublish).toContain('isFacebookAmbiguousOutcomeError')
    expect(manualPublish).toContain('isFacebookAmbiguousOutcomeError')
    // Behavioral coverage of the classification itself lives in
    // lib/qa/media-facebook-outcome.test.ts.
  })

  it('13. candidate intake is a project-scoped deterministic RPC with a unique database guard', () => {
    const novelty = read('apps/web/lib/media/novelty.ts')
    const migration = read('supabase/migrations/20260707190359_media_semantic_duplicate_guard.sql')
    expect(novelty).toContain('candidateIdempotencyKey')
    expect(novelty).toContain("rpc('claim_media_news_candidate'")
    expect(migration).toContain('create unique index if not exists unique_project_candidate_idempotency')
    expect(migration).toContain('on public.media_news_items(project_id, candidate_idempotency_key)')
    expect(migration).toContain('for update')
    expect(migration).toContain('candidate.candidate_identity is distinct from p_candidate_identity')
  })

  it('14. production eligibility is enforced fail-closed by database triggers', () => {
    const migration = read('supabase/migrations/20260707190359_media_semantic_duplicate_guard.sql')
    expect(migration).toContain('create or replace function public.enforce_media_news_production_eligibility')
    expect(migration).toContain('create trigger enforce_media_news_production_eligibility')
    expect(migration).toContain('create or replace function public.enforce_media_script_production_eligibility')
    expect(migration).toContain('create trigger enforce_media_script_production_eligibility')
    expect(migration).toContain("new.status in ('approved', 'scripted', 'published')")
    expect(migration).toContain("new.status in ('approved', 'publishing', 'published')")
    expect(migration).toContain('candidate_idempotency_key is null or new.candidate_identity is null')
    expect(migration).toContain('editorial_approved_at is null')
    expect(migration).toContain("durable_run.kind is distinct from 'media_novelty_review'")
    expect(migration).toContain('revoke all on function public.enforce_media_news_production_eligibility() from public, anon, authenticated')
  })

  it('15. legacy unsafe rows are audited and quarantined before trigger activation', () => {
    const migration = read('supabase/migrations/20260707190359_media_semantic_duplicate_guard.sql')
    const legacyNews = migration.indexOf('legacy_news_quarantined')
    const legacyScripts = migration.indexOf('legacy_script_quarantined')
    const newsTrigger = migration.indexOf('create trigger enforce_media_news_production_eligibility')
    const scriptTrigger = migration.indexOf('create trigger enforce_media_script_production_eligibility')
    expect(legacyNews).toBeGreaterThan(-1)
    expect(legacyScripts).toBeGreaterThan(-1)
    expect(legacyNews).toBeLessThan(newsTrigger)
    expect(legacyScripts).toBeLessThan(scriptTrigger)
    expect(migration).toContain("status = 'uncertain_requires_review'")
    expect(migration).toContain("status = 'pending_review'")
  })

  it('16. step4 remains render-only and Instagram provider calls live behind the canonical ledger publisher', () => {
    const step4 = read('apps/web/app/api/media/cron/step4/route.ts')
    const cronPublish = read('apps/web/app/api/media/cron/publish/route.ts')
    const manualPublish = read('apps/web/app/api/media/publish/instagram/route.ts')
    const canonical = read('apps/web/lib/media/instagram-publication.ts')
    // step4 must never import or invoke any Instagram provider helper.
    expect(step4).not.toContain('createReelContainer')
    expect(step4).not.toContain('buildInstagramCaption')
    expect(step4).not.toContain("@/lib/media/instagram")
    expect(step4).toContain("status:   'render_ready'")
    // Both publish routes go through the canonical ledger publisher and never
    // call the provider directly.
    expect(cronPublish).toContain('publishInstagramWithLedger')
    expect(cronPublish).not.toContain('createReelContainer')
    expect(cronPublish).not.toContain('publishContainer')
    expect(manualPublish).toContain('publishInstagramWithLedger')
    expect(manualPublish).not.toContain('createReelContainer')
    expect(manualPublish).not.toContain('publishContainer')
    // The canonical publisher is the only module that both claims the ledger
    // and talks to the provider. The runtime ordering guarantee (claim before
    // any provider interaction) is proven behaviorally in
    // media-instagram-publication.test.ts, not by source-position heuristics.
    expect(canonical).toContain('claimPublicationChannel')
    expect(canonical).toContain('createReelContainer')
  })
})