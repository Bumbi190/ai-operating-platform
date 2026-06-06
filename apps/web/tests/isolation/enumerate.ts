/**
 * PR-0 / inventory-drift — catalog enumeration runner.
 *
 * Calls the read-only `omnira_isolation_inventory()` RPC and prints an objective
 * red/green inventory of every public table's isolation posture. MEASUREMENT ONLY —
 * it fixes nothing; it reports what is red so later PRs can turn it green.
 *
 * A TENANT table is GREEN when: rls_enabled && policy_count > 0 && project_id NOT NULL.
 * GLOBAL allowlist tables are exempt. UNSCOPED candidates are expected RED (targets).
 * UNCLASSIFIED tables (no project_id, not allowlisted) are flagged for review.
 *
 * Exit code: 0 always in PR-0 (reporting mode). A `--strict` flag makes it exit 1 on
 * any tenant RED — that switch is flipped on by a LATER PR once the system is green.
 *
 * Run (needs the Supabase test branch + service-role key):
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npx tsx tests/isolation/enumerate.ts
 *
 * NOTE: authored in PR-0; not executed in this environment (no DB/secret here).
 */
import { createClient } from '@supabase/supabase-js';
import { classifyTable, FK_INDIRECT_TENANT } from './config';

type InventoryRow = {
  table_name: string;
  has_project_id: boolean;
  rls_enabled: boolean;
  policy_count: number;
  project_id_nullable: boolean;
  has_project_id_index: boolean;
};

const URL = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const STRICT = process.argv.includes('--strict');

async function main() {
  if (!URL || !KEY) {
    console.error('Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(2);
  }

  const db = createClient(URL, KEY, { auth: { persistSession: false } });
  const { data, error } = await db.rpc('omnira_isolation_inventory');
  if (error) {
    console.error('omnira_isolation_inventory() failed:', error.message);
    console.error('Did you apply tests/isolation/sql/omnira_isolation_inventory.sql?');
    process.exit(2);
  }

  const rows = (data ?? []) as InventoryRow[];
  let tenantRed = 0;
  const report: string[] = [];

  for (const r of rows) {
    const cls = classifyTable(r.table_name, r.has_project_id);
    if (cls === 'system') continue;

    if (cls === 'tenant') {
      const green = r.rls_enabled && r.policy_count > 0 && !r.project_id_nullable;
      const reasons: string[] = [];
      if (!r.rls_enabled) reasons.push('RLS off');
      if (r.policy_count === 0) reasons.push('no policy');
      if (r.project_id_nullable) reasons.push('project_id nullable');
      if (!r.has_project_id_index && r.has_project_id) reasons.push('no index');
      if (!green) tenantRed++;
      const indirect = FK_INDIRECT_TENANT[r.table_name] ? ` (${FK_INDIRECT_TENANT[r.table_name]})` : '';
      report.push(`${green ? '🟢' : '🔴'} tenant   ${r.table_name}${indirect}${reasons.length ? '  — ' + reasons.join(', ') : ''}`);
    } else if (cls === 'global') {
      report.push(`⚪ global   ${r.table_name}  (allowlisted, exempt)`);
    } else if (cls === 'unscoped-candidate') {
      tenantRed++;
      report.push(`🔴 unscoped ${r.table_name}  — tenant-relevant but no project scope (hardening target)`);
    } else {
      report.push(`🟡 review   ${r.table_name}  — no project_id and not allowlisted; classify it`);
    }
  }

  report.sort();
  console.log('\n=== Omnira isolation inventory (PR-0 measurement) ===\n');
  console.log(report.join('\n'));
  console.log(`\nTenant tables RED: ${tenantRed}`);
  console.log(STRICT
    ? '(strict mode) exiting non-zero if any tenant is RED'
    : '(reporting mode) exit 0 — flip to --strict in a later PR once green\n');

  process.exit(STRICT && tenantRed > 0 ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
