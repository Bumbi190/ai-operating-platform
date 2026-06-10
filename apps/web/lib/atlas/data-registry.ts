/**
 * Atlas record-access data registry (Foundation 2).
 *
 * The single source of truth for what `get_records` may read. This file IS the
 * security boundary for record-level access: only the tables, columns, and
 * filters declared here are reachable, never `SELECT *`, and PII columns are
 * excluded unless the caller explicitly opts in.
 *
 * Every domain is project-native (`project_id`), so the executor can scope each
 * read through the shipped isolation boundary (`applyProjectScope`). Tables
 * without a `project_id` (run_logs, bugscan_runs) and secret tables
 * (platform_tokens, …) are intentionally absent.
 *
 * Columns/filters below are grounded in the live schema.
 */

export type RecordDomain = 'leads' | 'memories' | 'website_content' | 'runs'

export interface DomainSpec {
  /** Physical table. Must be project-native. */
  table: string
  /** Scope column — always 'project_id' for the registered domains. */
  projectColumn: 'project_id'
  /** The ONLY columns ever selected (no SELECT *). */
  columns: readonly string[]
  /** Extra columns returned ONLY when include_pii is true. */
  piiColumns?: readonly string[]
  /** Allowed filter keys → allowed values ('*' = any value for that key). */
  filters?: Record<string, readonly string[]>
  /** Columns truncated to N chars in the result (free-text safety). */
  truncate?: Record<string, number>
  defaultOrder: { column: string; ascending: boolean }
  /** Hard ceiling on rows per call. */
  maxLimit: number
}

export const DOMAIN_REGISTRY: Record<RecordDomain, DomainSpec> = {
  leads: {
    table: 'leads',
    projectColumn: 'project_id',
    columns: ['id', 'name', 'source', 'status', 'value_sek', 'created_at'],
    piiColumns: ['email', 'phone'],
    filters: { status: ['new', 'qualified', 'warm', 'contacted', 'won', 'lost', 'cold'] },
    defaultOrder: { column: 'created_at', ascending: false },
    maxLimit: 25,
  },
  memories: {
    table: 'memories',
    projectColumn: 'project_id',
    columns: ['id', 'key', 'source', 'updated_at', 'value'],
    filters: { source: ['*'] },
    truncate: { value: 240 },
    defaultOrder: { column: 'updated_at', ascending: false },
    maxLimit: 25,
  },
  website_content: {
    table: 'website_content',
    projectColumn: 'project_id',
    columns: [
      'id', 'content_type', 'title', 'slug', 'summary', 'status', 'status_reason',
      'model', 'cost_usd', 'destination_url', 'reviewed_at', 'reviewer_notes',
      'published_at', 'scheduled_at', 'created_at',
    ],
    filters: { status: ['*'], content_type: ['*'] },
    truncate: { summary: 280, reviewer_notes: 200 },
    defaultOrder: { column: 'created_at', ascending: false },
    maxLimit: 25,
  },
  runs: {
    table: 'runs',
    projectColumn: 'project_id',
    columns: ['id', 'workflow_id', 'status', 'last_error', 'started_at', 'finished_at', 'created_at', 'attempts', 'kind'],
    filters: { status: ['queued', 'running', 'done', 'failed', 'stalled'] },
    truncate: { last_error: 240 },
    defaultOrder: { column: 'created_at', ascending: false },
    maxLimit: 25,
  },
}

export const RECORD_DOMAINS = Object.keys(DOMAIN_REGISTRY) as RecordDomain[]

/** Tables that must NEVER be exposed through get_records (asserted in tests). */
export const FORBIDDEN_TABLES = ['platform_tokens'] as const
