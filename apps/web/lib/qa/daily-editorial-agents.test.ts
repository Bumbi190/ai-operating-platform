import { describe, it, expect } from 'vitest'
import { buildEditorialHandoff, DAILY_EDITORIAL_ROLE_BLUEPRINT } from '@/lib/article/daily/agent-blueprint'
import type { DailyPlan } from '@/lib/article/daily/editorial-plan'

const PID='a8a1b1f6-c222-4893-9399-b1fb3bc2fa52'
const plan: DailyPlan = {
  projectId:PID,generatedAt:'2026-11-17T07:55:00Z',
  mode:'prepare_only',canDispatch:false,canPublish:false,
  counts:{usableNews:2,socialWithReceipt:1,candidatesChosen:2},
  candidates:[],
}

describe('The Prompt future Bedrock role blueprint is deliberately dormant',()=>{
  it('five project-scoped roles with no model or publishing permission today',()=>{
    expect(DAILY_EDITORIAL_ROLE_BLUEPRINT.map(r=>r.role)).toEqual([
      'news_scout','corroboration_researcher','longform_writer',
      'independent_fact_checker','publication_controller',
    ])
    for(const r of DAILY_EDITORIAL_ROLE_BLUEPRINT){
      expect(r.canInvokeModel).toBe(false)
      expect(r.canPublish).toBe(false)
      expect(r.status).toBe('waiting_for_release')
    }
  })
  it('only Nova Micro is marked as previously tested; longform model needs separate verification',()=>{
    expect(DAILY_EDITORIAL_ROLE_BLUEPRINT[0].modelId).toBe('amazon.nova-micro-v1:0')
    expect(DAILY_EDITORIAL_ROLE_BLUEPRINT[2].modelId).toBe(null)
    expect(DAILY_EDITORIAL_ROLE_BLUEPRINT[2].modelAccessVerified).toBe(false)
  })
  it('independent source evidence, editorial QA and signed publication authority required',()=>{
    const writer=DAILY_EDITORIAL_ROLE_BLUEPRINT[2]
    const checker=DAILY_EDITORIAL_ROLE_BLUEPRINT[3]
    const publisher=DAILY_EDITORIAL_ROLE_BLUEPRINT[4]
    expect(writer.requiredInputs).toContain('two_independent_verified_sources')
    expect(checker.requiredInputs).toContain('no_unresolved_unsupported_facts')
    expect(publisher.requiredInputs).toContain('signed_human_approval_or_valid_scoped_autonomy_license')
    expect(publisher.requiredInputs).toContain('canonical_STOP')
    expect(publisher.requiredInputs).toContain('hard_budget_reservation')
    expect(publisher.requiredInputs).toContain('idempotent_external_id')
  })
  it('no rollout decision can be inferred from a candidate list',()=>{
    expect(buildEditorialHandoff(plan)).toMatchObject({
      status:'prepare_only',publicationDecision:'NO_GO',taskCount:5,
      reason:'aws_production_credentials_and_editorial_authority_not_released',
    })
  })
  it('tampered plan claiming dispatch permission must fail closed',()=>{
    // Cast an intentionally malformed runtime payload only inside the negative test.
    expect(()=>buildEditorialHandoff({...plan,canDispatch:true} as unknown as DailyPlan)).toThrow()
    expect(()=>buildEditorialHandoff({...plan,canPublish:true} as unknown as DailyPlan)).toThrow()
  })
})
