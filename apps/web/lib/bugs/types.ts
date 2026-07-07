/**
 * lib/bugs/types.ts
 *
 * Delade typer för buggövervakningen (push + daglig scan).
 * Speglar tabellerna i 20260606_bug_monitoring_foundation.sql.
 */

export type BugSeverity = 'critical' | 'warning' | 'info'
export type BugSource = 'system' | 'user' | 'scan'
export type BugStatus = 'open' | 'resolved' | 'ignored'
export type FindingStatus = 'ok' | 'warning' | 'error'

export interface BugReport {
  id: string
  project_id: string | null
  source: BugSource
  severity: BugSeverity
  title: string
  detail: string | null
  area: string | null
  repro: string | null
  fix_prompt: string | null
  status: BugStatus
  dedupe_key: string | null
  emailed_at: string | null
  created_at: string
  resolved_at: string | null
}

export interface ProjectScanner {
  id: string
  project_id: string
  label: string
  scanner_url: string
  secret_env_key: string | null
  enabled: boolean
  expected_check_count: number | null
  created_at: string
  updated_at: string
}

export interface BugscanRun {
  id: string
  started_at: string
  finished_at: string | null
  ok: number
  warnings: number
  errors: number
  summary: Record<string, { ok: number; warning: number; error: number }>
  created_at: string
}

export interface BugscanFinding {
  id: string
  run_id: string
  project_id: string | null
  project_name: string | null
  check_name: string
  status: FindingStatus
  message: string | null
  is_new: boolean
  fix_prompt: string | null
  created_at: string
}

/** Det `reportBug()` tar emot. */
export interface ReportBugInput {
  projectId?: string | null
  projectName?: string | null
  domain?: string | null
  source: BugSource
  severity?: BugSeverity        // utelämnad → härleds från source/signaler
  title: string
  detail?: string | null
  area?: string | null
  repro?: string | null
  /** Egen dedupe-nyckel; annars härleds en från projekt+titel. */
  dedupeKey?: string | null
  /** Antal relaterade fel i fönstret (t.ex. misslyckade körningar 24h). ≥3 → akut. */
  occurrences?: number
}
