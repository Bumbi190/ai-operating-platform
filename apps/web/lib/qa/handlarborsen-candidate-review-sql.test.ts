import { describe, expect, it } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const proposal = readFileSync(resolve(__dirname,
  '../../../../docs/sql/handlarborsen_competitor_review_p2_proposed.sql'), 'utf8')

describe('Candidate review P2 proposed schema requires an explicit new operator gate', () => {
  it('is not an applied canonical migration or a change to candidate evidence', () => {
    expect(proposal).toContain('NOT APPLIED')
    expect(existsSync(resolve(__dirname,'../../supabase/migrations/20261017170000_handlarborsen_candidate_review_p2.sql'))).toBe(false)
    expect(proposal).toContain('CREATE TABLE public.handlarborsen_competitor_review_decisions')
    expect(proposal).toContain('REFERENCES public.handlarborsen_competitor_candidates(project_id,host)')
  })
  it('is a serial, auditable, append-only decision history with no client writes', () => {
    expect(proposal).toContain('GENERATED ALWAYS AS IDENTITY')
    expect(proposal).toContain('request_id uuid NOT NULL UNIQUE')
    expect(proposal).toContain('pg_advisory_xact_lock')
    expect(proposal).toContain('p_expected_revision integer')
    expect(proposal).toContain('actual_revision <> p_expected_revision')
    expect(proposal).toContain('count(*)::integer INTO actual_revision')
    expect(proposal).toContain('already_applied')
    expect(proposal).toContain('unchanged')
    expect(proposal).toContain('CREATE FUNCTION public.handlarborsen_decide_candidate_review_v1')
    expect(proposal).toContain('SECURITY INVOKER')
    expect(proposal).toContain('FORCE ROW LEVEL SECURITY')
    expect(proposal).toContain('FROM PUBLIC, anon, authenticated')
    expect(proposal).toContain('GRANT SELECT, INSERT ON TABLE')
    expect(proposal).not.toMatch(/GRANT\s+UPDATE|GRANT\s+DELETE|CREATE\s+POLICY/i)
  })
  it('rejects unapproved review states and checks live org membership inside the same transaction', () => {
    expect(proposal).toContain("('interesting', 'reviewed', 'ignored', 'pending')")
    expect(proposal).toContain('public.omnira_organization_memberships actor')
    expect(proposal).toContain('actor.revoked_at IS NULL')
    expect(proposal).toContain("p.slug='handlarborsen'")
    expect(proposal).toContain('REFERENCES auth.users(id)')
  })
})
