import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const sql=readFileSync(resolve(__dirname,'../../../../docs/sql/handlarborsen_candidate_inbox_p0_proposed.sql'),'utf8')
describe('proposed recipient-specific inbox SQL (not applied)',()=>{
  it('stages only a proposal, not a new canonical migration',()=>{
    expect(sql).toContain('PROPOSAL ONLY')
    expect(sql).toContain('handlarborsen_candidate_inbox')
    expect(sql).toContain('FOREIGN KEY (project_id,candidate_host)')
    expect(sql).toContain('REFERENCES public.handlarborsen_competitor_candidates(project_id,host)')
    expect(sql).toContain("project_id = '8f673c09-1c8f-4d78-876e-4c14bf1c89b3'::uuid")
  })
  it('stores one recipient-specific event keyed to official evidence; never uses Atlas generic signal log',()=>{
    expect(sql).toContain('PRIMARY KEY (project_id,candidate_host,recipient_id)')
    expect(sql).toContain('evidence_digest')
    expect(sql).toContain('AFTER INSERT ON public.handlarborsen_competitor_candidates')
    expect(sql).toContain('ON CONFLICT (project_id,candidate_host,recipient_id) DO NOTHING')
    expect(sql).toContain('revoked_at IS NULL')
    expect(sql).not.toContain('atlas_signals')
    expect(sql).not.toMatch(/cron|http\s+request/i)
  })
  it('disallows all direct client reads/writes and full-row UPDATE/DELETE',()=>{
    expect(sql).toContain('FORCE ROW LEVEL SECURITY')
    expect(sql).toContain('REVOKE ALL ON TABLE public.handlarborsen_candidate_inbox')
    expect(sql).toContain('FROM PUBLIC, anon, authenticated, service_role')
    expect(sql).toContain('GRANT SELECT, INSERT, UPDATE(read_at)')
    expect(sql).not.toMatch(/GRANT\s+DELETE|CREATE POLICY|SECURITY DEFINER/i)
  })
  it('requires a fresh membership check before recipient acknowledgement',()=>{
    expect(sql).toContain('handlarborsen_set_candidate_inbox_read_v1')
    expect(sql).toContain('p_recipient_id uuid')
    expect(sql).toContain("project.slug='handlarborsen'")
    expect(sql).toContain('FOR UPDATE')
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.handlarborsen_set_candidate_inbox_read_v1')
    expect(sql).toContain('TO service_role')
  })
})
