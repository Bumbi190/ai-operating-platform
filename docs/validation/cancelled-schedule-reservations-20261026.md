# Cancelled schedule reservation repair — 2026-10-26

Production approval of corrected November batch fb5bdae4-93af-4e95-a831-dab75d19c2b7 failed23505: the original unconditional unique(project_id,post_id,revision_id) constraint also reserves cancelled unsent rows. The approval transaction rolled back completely. Existing propose correctly revoked old authority and retained cancelled job/event history.

Fix: replace only that constraint with a unique partial index reserving every non-cancelled row OR any row with publication_id. Thus cancelled rows without any publication attempt may be replaced through the existing owner approval path. Receipt-bearing cancelled rows and all uncertain/published/active/failed/missed rows still reserve the revision. No deletion, history rewriting, new public access, queue function change or provider execution.

Tests: 46 migration/manifest/readiness unit tests passed. Full recovered177-entry local schema replay plus repeat protection and Instagram reconciliation passed; canonical replacement probe verifies old cancellation history, corrected month_release approval, idempotent approval, active duplicate refusal. Additional receipt-bearing cancelled probe passed in the final full-ledger rerun. A first fixture incorrectly inserted uncertain directly and was refused by repeat protection; corrected fixture starts requested and then marks uncertain. Network-isolated synthetic database only, no mounted production data or active cron. Independent read-only review found no correctness issue; requested the additional receipt-bearing test.

Deployment: apply additive migration20261026082914_social_schedule_cancelled_reservations.sql, verify index predicate, retry the exact already-user-approved November schedule approval, then verify exactly two queued replacement jobs and two cancelled originals. Customer access confirmation within24h remains required at publish time. No provider POST or resend is part of this repair.

