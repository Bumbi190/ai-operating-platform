/**
 * PR-0 / leak-harness — table-level isolation test.
 *
 * For every seeded tenant table, proves that owner A (RLS client) and anon CANNOT read
 * owner B's rows. Includes a NEGATIVE SELF-TEST: service-role MUST see B's row — if it
 * can't, the test data is wrong and green ticks would be meaningless.
 *
 * MEASUREMENT ONLY. This test is expected to FAIL (red) today for tables whose RLS
 * policies are missing — that is the point: it shows what is red before we harden.
 * It is wired into CI in REPORTING mode (continue-on-error) until the system is green.
 *
 * Requires the Supabase test branch + service-role key. Skipped if env is absent.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { service, asUser, anon, haveEnv } from './clients';
import { setup, teardown, type Fixture } from './fixtures';

const RUN = haveEnv();
let fx: Fixture;

describe.skipIf(!RUN)('table-level isolation: A and anon cannot read B', () => {
  beforeAll(async () => { fx = await setup(); }, 60_000);
  afterAll(async () => { if (fx) await teardown(fx); });

  it('negative self-test: service-role CAN see B (else data is wrong)', async () => {
    const db = service();
    const { data } = await db.from('runs').select('id').eq('project_id', fx.projectB);
    expect((data ?? []).length).toBeGreaterThan(0);
  });

  it('owner A cannot read any of B\'s seeded tenant rows', async () => {
    const aClient = asUser(fx.tokenA);
    const leaks: string[] = [];
    for (const table of fx.seededTables) {
      const { data } = await aClient.from(table).select('id').eq('project_id', fx.projectB);
      if ((data ?? []).length > 0) leaks.push(table);
    }
    // Expected RED until RLS policies land (PR-1*). The list of leaking tables IS the dashboard.
    expect(leaks, `LEAK: owner A can read B's rows in: ${leaks.join(', ')}`).toEqual([]);
  });

  it('anon cannot read any of B\'s seeded tenant rows', async () => {
    const a = anon();
    const leaks: string[] = [];
    for (const table of fx.seededTables) {
      const { data } = await a.from(table).select('id').eq('project_id', fx.projectB);
      if ((data ?? []).length > 0) leaks.push(table);
    }
    expect(leaks, `LEAK: anon can read B's rows in: ${leaks.join(', ')}`).toEqual([]);
  });
});
