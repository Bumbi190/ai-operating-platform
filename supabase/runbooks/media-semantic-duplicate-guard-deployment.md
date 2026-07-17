# Media Semantic Duplicate Guard Deployment

This hotfix migration must be applied while media automation is paused. The pause is defense in depth: the database triggers fail closed, but pausing prevents the previous app version from repeatedly attempting now-invalid production transitions during the deploy window.

1. Pause media intake, script production, render, and publish automation in the operator controls.
2. Confirm no `media_scripts.status = 'publishing'` rows are actively publishing in the current run window.
3. Apply `supabase/migrations/20260707190359_media_semantic_duplicate_guard.sql`.
4. Review `media_duplicate_guard_migration_audit` for `legacy_news_quarantined`, `legacy_script_quarantined`, and duplicate conflict audit rows.
5. Resolve any rows that should be manually restored by re-running editorial review through the application, not by direct SQL status edits.
6. Deploy the app code that writes candidate idempotency evidence, durable novelty run evidence, and editorial approval timestamps.
7. Run the focused media tests and repository bypass searches from the release checklist.
8. Resume media intake first and verify new candidates land in `pending_novelty_review` with `candidate_idempotency_key`.
9. Resume production stages after at least one candidate completes novelty review and editorial approval.
10. Resume publication last and monitor `media_publication_ledger` for `unknown_external_outcome` or `reconciliation_required`.

Rollback is forward-only for data state. If app deploy rollback is required, keep automation paused until either the new app is restored or the trigger/functions are intentionally replaced by a follow-up migration.