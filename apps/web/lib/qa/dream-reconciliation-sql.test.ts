import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const FILE = resolve(process.cwd(), 'supabase/migrations/20260919120000_dream_issue_reconciliation.sql')
const SQL = readFileSync(FILE, 'utf8')
const EXEC = SQL.split('\n').filter(line => !line.trim().startsWith('--')).join('\n').toLowerCase()

describe('Dream reconciliation migration contract', () => {
  it('creates exactly one domain ledger with the complete event vocabulary', () => {
    expect(EXEC.match(/create table if not exists public\./g)).toHaveLength(1)
    for (const value of [
      'implementation_evidence_recorded', 'verification_evidence_recorded',
      'activated', 'resolved', 'superseded', 'invalidated', 'marked_unverified', 'reopened',
    ]) expect(EXEC).toContain(`'${value}'`)
  })

  it('is append-only including TRUNCATE and server-only under RLS', () => {
    expect(EXEC).toMatch(/before update or delete on public\.dream_issue_reconciliation_events/)
    expect(EXEC).toMatch(/before truncate on public\.dream_issue_reconciliation_events/)
    expect(EXEC).toMatch(/enable row level security/)
    expect(EXEC).toMatch(/revoke all on table public\.dream_issue_reconciliation_events from public, anon, authenticated, service_role/)
    expect(EXEC).toMatch(/revoke all on sequence public\.dream_issue_reconciliation_events_event_seq_seq from public, anon, authenticated, service_role/)
    expect(EXEC).toMatch(/grant select, insert on table public\.dream_issue_reconciliation_events to service_role/)
    expect(EXEC).toMatch(/grant usage, select on sequence public\.dream_issue_reconciliation_events_event_seq_seq to service_role/)
  })

  it('makes every writer idempotent within its project scope', () => {
    expect(EXEC).toMatch(/unique \(project_id, source_key\)/)
    expect(EXEC.match(/on conflict \(project_id, source_key\) do nothing/g)).toHaveLength(9)
  })

  it('binds finding and successor identities to the same project and refuses cycles', () => {
    expect(EXEC).toContain('di.id = new.finding_id and di.project_id = new.project_id')
    expect(EXEC).toContain('di.id = new.superseding_finding_id and di.project_id = new.project_id')
    expect(EXEC).toContain('supersession cycle refused')
  })

  it('requires implementation plus verification evidence before RESOLVED', () => {
    expect(EXEC).toContain('resolved requires fresh implementation and verification evidence')
    expect(EXEC).toContain("e.event_type = 'implementation_evidence_recorded'")
    expect(EXEC).toContain("e.event_type = 'verification_evidence_recorded'")
    expect(EXEC.match(/e\.event_seq > coalesce\(v_previous_seq, 0\)/g)?.length).toBeGreaterThanOrEqual(3)
  })

  it('prevents prose resurrection and requires a terminal predecessor plus evidence/operator for reopen', () => {
    expect(EXEC).toContain("v_previous_event not in ('resolved', 'superseded', 'invalidated')")
    expect(EXEC).toContain('reopened requires new regression evidence or explicit owner/operator action')
  })

  it('pins the approved Instagram resolution and leaves step logs/open_actions ACTIVE', () => {
    expect(SQL).toContain('8cc7d36b875b76b3afc5ef76138fdf70afb05ae0')
    expect(SQL).toContain('afd45acb034ea0f39b8453d10275abc475c37793')
    expect(SQL).toContain('adfda4c2dc50ef1caa6aee7685c960b7f263aa94890112a82534004941e9f4ff')
    expect(SQL).toMatch(/issue_id = 'ig_self_account_id'[\s\S]*?'resolved'/i)
    expect(SQL).toContain("issue_id = 'step_logs_missing'")
    expect(SQL).toContain("'phase-a:step-logs:active:v1'")
    expect(SQL).toContain("issue_id = 'open_actions'")
    expect(SQL).toContain("'phase-a:open-actions:active:v1'")
  })

  it('marks all legacy rows UNVERIFIED without free-text matching or deletion', () => {
    expect(EXEC).toContain("select di.project_id, di.id, di.issue_id, 'marked_unverified'")
    expect(EXEC).not.toMatch(/delete\s+from\s+public\.dream_issues/)
    expect(EXEC).not.toMatch(/latest_insight\s+(like|ilike)/)
  })
})
