import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql = readFileSync(resolve(__dirname,
  '../../../../docs/sql/handlarborsen_competitor_candidates_p1_proposed.sql'), 'utf8')

describe('P1 competitor candidate DB proposal remains locked to one project', () => {
  it('stages schema outside canonical migrations and only grants service SELECT/INSERT', () => {
    expect(sql).toContain('NOT APPLIED')
    expect(sql).toContain('handlarborsen_competitor_candidates')
    expect(sql).toContain('PRIMARY KEY (project_id,host)')
    expect(sql).toContain("project_id = '8f673c09-1c8f-4d78-876e-4c14bf1c89b3'::uuid")
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/)
    expect(sql).toMatch(/FORCE ROW LEVEL SECURITY/)
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.handlarborsen_competitor_candidates FROM PUBLIC/)
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.handlarborsen_competitor_candidates FROM anon/)
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.handlarborsen_competitor_candidates FROM authenticated/)
    expect(sql).toMatch(/GRANT SELECT, INSERT ON TABLE public\.handlarborsen_competitor_candidates TO service_role/)
    expect(sql).not.toMatch(/CREATE POLICY|GRANT\s+UPDATE|GRANT\s+DELETE/i)
  })
  it('checks provenance, canonical official host, source digest and immutable server time', () => {
    expect(sql).toMatch(/independently_checked_official_website/)
    expect(sql).toContain("first_seen_at timestamptz NOT NULL DEFAULT now()")
    expect(sql).toContain('evidence_digest = encode(sha256')
    expect(sql).toContain('split_part(official_url')
    expect(sql).toContain("official_url ~ '^https:")
    expect(sql).toContain('host NOT LIKE')
  })
})
