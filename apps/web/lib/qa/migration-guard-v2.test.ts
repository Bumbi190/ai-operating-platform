import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { runMigrationGuard } from '../../scripts/check-migrations.mjs'
import {
  assertMigrationGuardPolicyIntegrity,
  evaluateAppliedMigrationLedger,
  EXPECTED_CANONICAL_SQL_COUNT,
  EXPECTED_ENFORCED_COUNT,
  GRANDFATHERED_MIGRATION_NAMES,
  inspectCanonicalMigrationFiles,
  LEGACY_ONLY_PRODUCTION_LEDGER_NAMES,
  MIGRATION_GUARD_POLICY_VERSION,
} from '../../scripts/migration-guard-policy.mjs'

const CANONICAL_DIR = resolve(__dirname, '../../supabase/migrations')
const canonicalFiles = readdirSync(CANONICAL_DIR)
const repositoryState = inspectCanonicalMigrationFiles(canonicalFiles)

const GRANDFATHERED_PRESENT_IN_VERIFIED_LEDGER = [
  'atlas_bi_foundation',
  'cost_events',
  'project_budgets',
  'h1p1_execution_policy_foundation',
  'media_rls_hardening',
  'h1p3_run_steps_snapshot',
  'migration_guard_fn',
]

// Enforced canonical migrations that exist in the repository but are NOT yet applied to
// production. This list is the only place a migration may be declared "not yet applied";
// remove an entry in the same change that records its real, operator-approved apply.
//   handlarborsen_marketplace_snapshots — P1B, file 20261010100000; NOT applied.
const ENFORCED_NOT_YET_APPLIED = ['handlarborsen_marketplace_snapshots']

// The CURRENT, verified production history: every enforced migration that has really
// been applied (133 rows) plus the grandfathered and legacy-only names. It deliberately
// omits ENFORCED_NOT_YET_APPLIED, so the guard must reject it while one is pending.
const currentVerifiedProductionLedger = [
  ...repositoryState.enforcedNames.filter((name) => !ENFORCED_NOT_YET_APPLIED.includes(name)),
  ...GRANDFATHERED_PRESENT_IN_VERIFIED_LEDGER,
  ...LEGACY_ONLY_PRODUCTION_LEDGER_NAMES,
]

// HYPOTHETICAL future history (134 rows): the current production ledger after the pending
// migration(s) have been applied. It is a synthetic fixture for exercising the guard in
// its healthy state; it does NOT describe production today and nothing is marked applied
// by it. The perturbation tests below start from this healthy history.
const postApplySyntheticLedger = [
  ...currentVerifiedProductionLedger,
  ...ENFORCED_NOT_YET_APPLIED,
]

const quietLogger = {
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}
const runtimeHarness = {
  readDirectory: (() => canonicalFiles) as unknown as typeof readdirSync,
  logger: quietLogger as unknown as Console,
}

describe('Migration Guard v2 — frozen policy and repository set', () => {
  // 101/87, not 100/86: Phase 1C1A, Phase 1C1B, Atlas Survival Phase 2B, Phase 1C2 and
  // Atlas Autonomy Licensing Phase 2C each arrived on their own branch, and each moved
  // the enforced count by one. The reconciled total is the sum of all five arrivals.
  //
  // 99 → 100: `sdf1c2_broker_control_channel` (Phase 1C2), merged to main and already
  // applied to production.
  // 100 → 101: `autonomy_license_phase2c` (Phase 2C), on this branch.
  // 101 → 102: `autonomy_trace_decisions` (Phase 3B1A) — merged and APPLIED.
  // 102 → 103: `autonomy_bind_atomic` (Phase 3B1B) — APPLIED to production on
  // 2026-10-01 under operator-approved rollout (ledger version 20261001130412); the
  // production-ledger pin below is reconciled 125 → 126 accordingly.
  // 103 → 104: `m0_durable_spend_settlement` (M0) — APPLIED to production on
  // 2026-10-02 under the operator-approved M0 rollout (ledger version 20261002062908);
  // the production-ledger pin below is reconciled 126 → 127 accordingly.
  // 104 → 105: `autonomy_authority_serialization` (Phase 3B1B2 M1) — APPLIED to production
  // on 2026-10-02 under the operator-approved M1 rollout (ledger version 20261002134227);
  // the production-ledger pin below is reconciled 127 → 128 accordingly.
  // 105 → 106: `survival_input_epoch` (Phase 3B1B2 M2) — APPLIED to production on
  // 2026-10-03 under the operator-approved M2 rollout (ledger version 20261003053532);
  // the production-ledger pin below is reconciled 128 → 129 accordingly.
  // 106 → 107: `survival_commit_fence` (Phase 3B1B2 M3) — APPLIED to production on
  // 2026-10-03 under the operator-approved M3 rollout (ledger version 20261003183855);
  // the production-ledger pin below is reconciled 129 → 130 accordingly.
  // 107 → 110: `survival_threshold_status_canonical`, `m4a_licensed_authority_substrate`
  // and `m4b_licensed_bind` (Phase 3B1B2 M4) — APPLIED to production on 2026-10-07 under
  // the operator-approved M4 database rollout (ledger versions 20261007094814,
  // 20261007095425 and 20261007100001); the production-ledger pin below is reconciled
  // 130 → 133 accordingly.
  //
  // 1C2 and 2C each computed 100/86 — both were written against main's 99/85 — which is
  // exactly why the number alone could not distinguish them and why the merged figure is
  // neither branch's. Same reconciliation Phase 2B's ruling performed.
  //
  // NOTE ON 3B1A: these two counts describe the CANONICAL CORPUS, so they move as soon
  // as the file exists. The production APPLY is a separate fact, and it has NOT happened
  // for 3B1A — see the ledger assertion below, which is deliberately left RED.
  it('pins policy v2 and the current 111/97/14/30 counts', () => {
    expect(MIGRATION_GUARD_POLICY_VERSION).toBe(2)
    expect(EXPECTED_CANONICAL_SQL_COUNT).toBe(111)
    expect(EXPECTED_ENFORCED_COUNT).toBe(97)
    expect(GRANDFATHERED_MIGRATION_NAMES).toHaveLength(14)
    expect(LEGACY_ONLY_PRODUCTION_LEDGER_NAMES).toHaveLength(30)
    expect(repositoryState.sqlFiles).toHaveLength(111)
    expect(repositoryState.enforcedNames).toHaveLength(97)
  })

  it('uses exact explicit names with no wildcard policy entries', () => {
    for (const name of [...GRANDFATHERED_MIGRATION_NAMES, ...LEGACY_ONLY_PRODUCTION_LEDGER_NAMES]) {
      expect(name).toMatch(/^[a-z0-9_]+$/)
      expect(name).not.toMatch(/[?*\[\]]/)
    }
    expect(() => assertMigrationGuardPolicyIntegrity()).not.toThrow()
  })

  it('fails on accidental grandfathered-list growth', () => {
    expect(() => assertMigrationGuardPolicyIntegrity({
      grandfatheredNames: [...GRANDFATHERED_MIGRATION_NAMES, 'new_grandfathered_name'],
    })).toThrow(/grandfathered migration list drifted/)
  })

  it('fails when the canonical SQL count drifts', () => {
    expect(() => inspectCanonicalMigrationFiles(canonicalFiles.slice(1))).toThrow(/canonical SQL count drifted/)
  })

  it('fails when the enforced count tripwire drifts', () => {
    expect(() => inspectCanonicalMigrationFiles(canonicalFiles, {
      expectedEnforcedCount: EXPECTED_ENFORCED_COUNT - 1,
    })).toThrow(/enforced migration count drifted/)
  })

  it('fails when two canonical files derive the same ledger name', () => {
    const enforcedFile = canonicalFiles.find((file) => file.endsWith('_youtube_project_oauth.sql'))
    expect(enforcedFile).toBeTruthy()
    const duplicate = `99999999_${enforcedFile!.replace(/^\d+_/, '')}`
    const files = canonicalFiles.map((file) => file === canonicalFiles[0] ? duplicate : file)
    expect(() => inspectCanonicalMigrationFiles(files)).toThrow(/duplicate canonical migration ledger name/)
  })
})

describe('Migration Guard v2 — production ledger set integrity', () => {
  it('REJECTS the exact current verified production history (133) while an enforced migration is not yet applied', () => {
    expect(currentVerifiedProductionLedger).toHaveLength(133)
    expect(ENFORCED_NOT_YET_APPLIED.every((name) => repositoryState.enforcedNames.includes(name))).toBe(true)
    let message = ''
    try {
      evaluateAppliedMigrationLedger(currentVerifiedProductionLedger, repositoryState)
    } catch (error) {
      message = error instanceof Error ? error.message : String(error)
    }
    expect(message).toMatch(/not applied to the production ledger/)
    for (const name of ENFORCED_NOT_YET_APPLIED) expect(message).toContain(name)
  })

  it('passes the hypothetical post-apply synthetic history (134)', () => {
    const result = evaluateAppliedMigrationLedger(postApplySyntheticLedger, repositoryState)
    // 125 = main's 124 (which already contains sdf1c1b_broker_claim_credentials,
    // survival_funding_phase2b, sdf1c2_broker_control_channel and
    // autonomy_license_phase2c) + Phase 3B1A's autonomy_trace_decisions. The
    // fixture is built FROM `repositoryState.enforcedNames`, so it models the
    // post-apply world — the world this branch must be merged in, because the
    // guard's contract is apply-before-PR and `check-migrations.mjs` refuses an
    // enforced migration that production has not applied yet.
    //
    // POST-APPLY RECORD (this replaces a pre-apply red state — see below).
    //
    // Phase 3B1A added `autonomy_trace_decisions`, taking the enforced set from
    // 87 to 88 and this fixture from 124 to 125. That migration was APPLIED to
    // production on 2026-09-26 under its own review, and the production ledger
    // now holds 125 rows; the applied row's version is 20260926082643 — note
    // that a migration's production VERSION is assigned at apply time and is
    // NOT the filename's timestamp (the file is named 20260925120000).
    // `schema_migrations` contains the name exactly once.
    //
    // Before that apply this literal read 124 and its failure was the
    // apply-before-PR tripwire doing its job: the repository corpus carried an
    // enforced migration production had not applied. After the apply, 124 would
    // no longer be safety — it would be stale information — so it is reconciled
    // to the truth it is asserting.
    //
    // The number stays HARDCODED and deliberately so: it is a concurrency
    // tripwire, not a derived value. Two branches each adding a canonical
    // migration would both look reviewed while only one was counted, and a
    // computed count would hide exactly that. If a future branch moves the
    // corpus again, this line must move with it, by hand.
    //
    // POST-APPLY RECORD — Phase 3B1B. `autonomy_bind_atomic` took the enforced
    // set from 88 to 89 and this fixture from 125 to 126. It was APPLIED to
    // production on 2026-10-01 under the operator-approved Phase 3B1B rollout;
    // the production ledger now holds 126 rows and contains the name exactly
    // once, at version 20261001130412 (the file is named 20260926120000). The
    // applied file is the reviewed one (sha256 601c24b7…5a2), so 125 here would
    // now be stale information rather than safety.
    //
    // POST-APPLY RECORD — Phase M0. `m0_durable_spend_settlement` took the
    // enforced set from 89 to 90 and this fixture from 126 to 127. It was APPLIED
    // to production on 2026-10-02 under the operator-approved M0 rollout; the
    // production ledger now holds 127 rows and contains the name exactly once, at
    // version 20261002062908 (the file is named 20261001160000). The applied
    // statement is byte-identical to the reviewed file (sha256 13c5582d…6ac16,
    // verified against `schema_migrations.statements`), so 126 here would now be
    // stale information rather than safety.
    //
    // POST-APPLY RECORD — Phase 3B1B2 M1. `autonomy_authority_serialization` took the
    // enforced set from 90 to 91 and this fixture from 127 to 128. It was APPLIED to
    // production on 2026-10-02 under the operator-approved M1 rollout; the production
    // ledger now holds 128 rows and contains the name exactly once, at version
    // 20261002134227 (the file is named 20261002140000). The applied statement is
    // byte-identical to the reviewed file (sha256 c84f604d…87cd5, verified against
    // `schema_migrations.statements`), so 127 here would now be stale information.
    //
    // POST-APPLY RECORD — Phase 3B1B2 M2. `survival_input_epoch` took the enforced set
    // from 91 to 92 and this fixture from 128 to 129. It was APPLIED to production on
    // 2026-10-03 under the operator-approved M2 rollout; the production ledger now holds
    // 129 rows and contains the name exactly once, at version 20261003053532 (the file is
    // named 20261002190000). The applied statement is byte-identical to the reviewed file
    // (sha256 93e002f0…761d80, verified against `schema_migrations.statements`), so 128
    // here would now be stale information.
    //
    // POST-APPLY RECORD — Phase 3B1B2 M3. `survival_commit_fence` took the enforced set
    // from 92 to 93 and this fixture from 129 to 130. It was APPLIED to production on
    // 2026-10-03 under the operator-approved M3 rollout; the production ledger now holds
    // 130 rows and contains the name exactly once, at version 20261003183855 (the file is
    // named 20261003120000). The applied statement is byte-identical to the reviewed file
    // (sha256 c114496b…752cb7, verified against `schema_migrations.statements`), so 129
    // here would now be stale information.
    //
    // POST-APPLY RECORD — Phase 3B1B2 M4. Three enforced migrations took the enforced set
    // from 93 to 96 and this fixture from 130 to 133. They were APPLIED to production on
    // 2026-10-07 under the operator-approved M4 database rollout, in order; the production
    // ledger now holds 133 rows and contains each name exactly once:
    //   survival_threshold_status_canonical  version 20261007094814  (file 20261004090000)
    //     sha256 2ea819a3…ec11f91
    //   m4a_licensed_authority_substrate     version 20261007095425  (file 20261004100000)
    //     sha256 d9ecf802…719f593
    //   m4b_licensed_bind                    version 20261007100001  (file 20261004110000)
    //     sha256 d4e124c7…2aa417d3
    // Each applied statement is byte-identical to its reviewed file (verified against
    // `schema_migrations.statements`), so 130 here would now be stale information. The M4
    // APPLICATION is not deployed by that rollout; this pin records the database only.
    // HYPOTHETICAL: P1B `handlarborsen_marketplace_snapshots` took the enforced set from 96
    // to 97. It is NOT applied to production, so production stays at 133 (see the test
    // above); 134 is the history this branch requires before it may merge.
    expect(result.appliedLedgerCount).toBe(134)
    expect(result.unknownLedgerNames).toEqual([])
    expect(result.duplicateLedgerNames).toEqual([])
  })

  it('passes when every grandfathered name is absent', () => {
    expect(() => evaluateAppliedMigrationLedger([
      ...repositoryState.enforcedNames,
      ...LEGACY_ONLY_PRODUCTION_LEDGER_NAMES,
    ], repositoryState)).not.toThrow()
  })

  it('passes when every grandfathered name is present', () => {
    expect(() => evaluateAppliedMigrationLedger([
      ...repositoryState.repositoryNames,
      ...LEGACY_ONLY_PRODUCTION_LEDGER_NAMES,
    ], repositoryState)).not.toThrow()
  })

  it('accepts every exact documented legacy-only ledger row', () => {
    const result = evaluateAppliedMigrationLedger([
      ...repositoryState.enforcedNames,
      ...LEGACY_ONLY_PRODUCTION_LEDGER_NAMES,
    ], repositoryState)
    expect(result.legacyOnlyAllowlistCount).toBe(30)
  })

  it('does not claim order, version, SQL hashes, or replayability', () => {
    const result = evaluateAppliedMigrationLedger([...postApplySyntheticLedger].reverse(), repositoryState)
    expect(result.doesNotVerify).toEqual([
      'application order',
      'ledger version values',
      'migration SQL content hashes',
      'full-schema replayability',
    ])
  })

  it('fails when an enforced migration is missing', () => {
    const missing = repositoryState.enforcedNames[0]
    expect(() => evaluateAppliedMigrationLedger(
      postApplySyntheticLedger.filter((name) => name !== missing),
      repositoryState,
    )).toThrow(/not applied to the production ledger/)
  })

  it('fails on an unknown production ledger name', () => {
    expect(() => evaluateAppliedMigrationLedger([
      ...postApplySyntheticLedger,
      'unknown_production_migration',
    ], repositoryState)).toThrow(/unknown migration name/)
  })

  it('fails on a duplicate production ledger name before Set construction can hide it', () => {
    expect(() => evaluateAppliedMigrationLedger([
      ...postApplySyntheticLedger,
      postApplySyntheticLedger[0],
    ], repositoryState)).toThrow(/duplicate migration name/)
  })

  it('fails on a malformed ledger payload', () => {
    expect(() => evaluateAppliedMigrationLedger({ names: postApplySyntheticLedger }, repositoryState)).toThrow(/did not return an array/)
    expect(() => evaluateAppliedMigrationLedger([...postApplySyntheticLedger, 'not-explicit-*'], repositoryState)).toThrow(/malformed migration name/)
  })
})

describe('Migration Guard v2 — Vercel fail-closed runtime', () => {
  const vercelEnv: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: 'test',
    VERCEL: '1',
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'synthetic-test-key',
  }

  it('fails when the Vercel build lacks required credentials', async () => {
    await expect(runMigrationGuard({
      env: {
        ...process.env,
        NODE_ENV: 'test',
        VERCEL: '1',
        NEXT_PUBLIC_SUPABASE_URL: '',
        SUPABASE_SERVICE_ROLE_KEY: '',
      },
      ...runtimeHarness,
    })).rejects.toThrow(/missing — cannot verify migrations/)
  })

  it('fails closed when the ledger RPC request fails', async () => {
    await expect(runMigrationGuard({
      env: vercelEnv,
      fetchImpl: vi.fn().mockRejectedValue(new Error('synthetic network failure')),
      ...runtimeHarness,
    })).rejects.toThrow(/ledger RPC call failed/)
  })

  it('fails closed when the ledger RPC payload has the wrong shape', async () => {
    await expect(runMigrationGuard({
      env: vercelEnv,
      fetchImpl: vi.fn().mockResolvedValue({ ok: true, json: async () => ({ names: [] }) }),
      ...runtimeHarness,
    })).rejects.toThrow(/did not return an array/)
  })

  it('fails a Vercel build against the current production ledger while a migration is unapplied', async () => {
    await expect(runMigrationGuard({
      env: vercelEnv,
      fetchImpl: vi.fn().mockResolvedValue({ ok: true, json: async () => currentVerifiedProductionLedger }),
      ...runtimeHarness,
    })).rejects.toThrow(/not applied to the production ledger/)
  })

  it('passes a Vercel build only for the validated known ledger set (hypothetical post-apply)', async () => {
    const result = await runMigrationGuard({
      env: vercelEnv,
      fetchImpl: vi.fn().mockResolvedValue({ ok: true, json: async () => postApplySyntheticLedger }),
      ...runtimeHarness,
    })
    // The whole post-apply picture in one assertion: the canonical corpus is
    // 110 files / 96 enforced after Phase 3B1B2 M4, and the HYPOTHETICAL post-apply
    // ledger is 134 (production itself is 133 until P1B is applied; M4's three migrations
    // were applied as versions 20261007094814, 20261007095425, 20261007100001).
    expect(result).toMatchObject({
      skipped: false,
      policyVersion: 2,
      canonicalSqlCount: 111,
      enforcedCount: 97,
      appliedLedgerCount: 134,
    })
  })
})
