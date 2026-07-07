/**
 * PR-0 / Isolation measurement layer — shared classification config.
 *
 * Single source of truth for HOW we classify tables for the inventory-drift check
 * and the table-level leak test. Measurement only — no fixes here.
 *
 * Definitions:
 *  - TENANT table        = has a `project_id` column OR is FK-indirectly scoped to a
 *                          tenant table. MUST end up: rls_enabled && policy_count>0 &&
 *                          project_id NOT NULL.
 *  - GLOBAL allowlist    = intentionally NOT project-scoped (e.g. single-row config).
 *  - UNSCOPED candidates = tables that SHOULD be tenant-scoped but currently are not
 *                          (isolation gaps). Reported as RED so later PRs can fix them.
 *  - SYSTEM              = internal/migration/cron bookkeeping; ignored by leak checks.
 */

/** Tables FK-indirectly scoped to a tenant table (no own project_id column). */
export const FK_INDIRECT_TENANT: Record<string, string> = {
  run_logs:              'via runs.project_id',
  evaluations:           'via approvals → runs.project_id',
  conversation_messages: 'via conversations.project_id',
};

/** Intentionally global (not project-scoped). Anything else without scope = RED. */
export const GLOBAL_ALLOWLIST: string[] = [
  'platform_config', // single-row (id=1) org-wide pause/limits
];

/**
 * Tables that are tenant-relevant but currently lack project scoping.
 * These are EXPECTED to show RED in PR-0 — they are the hardening targets, not bugs
 * in the measurement. (e.g. comment_replies has no project_id today — see route-manifest
 * webhooks/instagram P0 finding.)
 */
export const UNSCOPED_TENANT_CANDIDATES: string[] = [
  'comment_replies',
];

/** Internal/bookkeeping tables the leak checks ignore. Extend as needed. */
export const SYSTEM_TABLES: string[] = [
  'schema_migrations',
];

export type TableClass = 'tenant' | 'global' | 'unscoped-candidate' | 'system' | 'unclassified';

export function classifyTable(name: string, hasProjectId: boolean): TableClass {
  if (SYSTEM_TABLES.includes(name)) return 'system';
  if (GLOBAL_ALLOWLIST.includes(name)) return 'global';
  if (UNSCOPED_TENANT_CANDIDATES.includes(name)) return 'unscoped-candidate';
  if (hasProjectId || name in FK_INDIRECT_TENANT) return 'tenant';
  return 'unclassified';
}
