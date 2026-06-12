/**
 * get_records data-registry invariants (Foundation 2).
 *
 * The registry is the access-control boundary for record reads. These tests
 * lock the security-critical guarantees: project-native only, no SELECT *,
 * PII never in the default column set, and no secret tables/columns.
 */
import { describe, it, expect } from 'vitest'
import { DOMAIN_REGISTRY, RECORD_DOMAINS, FORBIDDEN_TABLES } from '@/lib/atlas/data-registry'

describe('data-registry invariants', () => {
  it('every domain is project-native with a non-empty column allow-list incl. id', () => {
    for (const d of RECORD_DOMAINS) {
      const s = DOMAIN_REGISTRY[d]
      expect(s.projectColumn).toBe('project_id')
      expect(s.columns.length).toBeGreaterThan(0)
      expect(s.columns).toContain('id')
      expect(s.maxLimit).toBeGreaterThan(0)
      expect(s.columns).toContain(s.defaultOrder.column)
    }
  })

  it('never uses SELECT *', () => {
    for (const d of RECORD_DOMAINS) expect(DOMAIN_REGISTRY[d].columns).not.toContain('*')
  })

  it('PII columns are never in the default column set', () => {
    for (const d of RECORD_DOMAINS) {
      const s = DOMAIN_REGISTRY[d]
      for (const pii of s.piiColumns ?? []) expect(s.columns).not.toContain(pii)
    }
  })

  it('exposes no forbidden tables and no secret-looking columns', () => {
    const secret = /token|secret|api[_-]?key|password|credential/i
    for (const d of RECORD_DOMAINS) {
      const s = DOMAIN_REGISTRY[d]
      expect(FORBIDDEN_TABLES as readonly string[]).not.toContain(s.table)
      for (const c of [...s.columns, ...(s.piiColumns ?? [])]) expect(secret.test(c)).toBe(false)
    }
  })

  it('leads gates email/phone as PII', () => {
    expect(DOMAIN_REGISTRY.leads.piiColumns).toEqual(['email', 'phone'])
    expect(DOMAIN_REGISTRY.leads.columns).not.toContain('email')
    expect(DOMAIN_REGISTRY.leads.columns).not.toContain('phone')
  })

  it('registers the Sprint-1 bridge domains', () => {
    for (const d of ['approvals', 'manager_tasks', 'opportunities', 'agents'] as const) {
      expect(RECORD_DOMAINS).toContain(d)
    }
  })

  it('agents never exposes system_prompt or config', () => {
    expect(DOMAIN_REGISTRY.agents.columns).not.toContain('system_prompt')
    expect(DOMAIN_REGISTRY.agents.columns).not.toContain('config')
  })

  it('approvals never exposes large/internal fields (content, fix_patch, draft_id)', () => {
    for (const c of ['content', 'fix_patch', 'draft_id', 'guard_report_id']) {
      expect(DOMAIN_REGISTRY.approvals.columns).not.toContain(c)
    }
  })
})
