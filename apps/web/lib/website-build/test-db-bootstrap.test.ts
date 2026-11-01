import { describe, it, expect } from 'vitest'
import { initializeWorkerDb, testSql, TEST_PROJECT, TEST_PRINCIPAL } from './test-db'
import {ensureStudioWorkspace} from './studio/store'
import {ATLAS_WEB_BUILDER_PRESET} from './studio/preset'

describe('canonical website SQL fixture bootstrap', () => {
  it('prepares plan and Studio prerequisites before mockup review', () => {
    initializeWorkerDb()
    const names = ['website_build_plans', 'website_build_plan_revisions',
      'website_build_studio_intents', 'project_lifecycle', 'website_build_mockups']
    for (const name of names)
      expect(testSql("select to_regclass('public." + name + "') is not null;"), name).toBe('t')
    expect(testSql("select bool_and(relrowsecurity) from pg_class where relname in ('website_build_plans','website_build_plan_revisions','website_build_studio_intents','website_build_mockups');")).toBe('t')
    expect(testSql("select has_function_privilege('authenticated','website_build_plan_start(jsonb,jsonb)','execute') or has_function_privilege('anon','website_build_plan_approve(jsonb,jsonb)','execute');")).toBe('f')
  })

  it('supports the current factory preset in a fresh Studio without public RPC access', async () => {
    const db=initializeWorkerDb()
    const created=await ensureStudioWorkspace(db,TEST_PRINCIPAL,{kind:'new',name:'Current Studio preset',idempotencyKey:crypto.randomUUID()})
    const builder=JSON.parse(testSql("select jsonb_build_object('preset',a.config->'atlas_builder_preset'->>'version','maxTokens',a.config->'max_tokens') from agents a join website_build_project_settings s on s.builder_agent_id=a.id where s.project_id='"+created.projectId+"';"))
    expect(builder).toEqual({preset:ATLAS_WEB_BUILDER_PRESET.version,maxTokens:ATLAS_WEB_BUILDER_PRESET.maxTokens})
    expect(testSql("select has_function_privilege('authenticated','website_build_studio_ensure(jsonb,jsonb,jsonb)','execute') or has_function_privilege('anon','website_build_studio_ensure(jsonb,jsonb,jsonb)','execute');")).toBe('f')
  },30000)

  it('does not overwrite a deliberate fixture budget when initialized again', () => {
    initializeWorkerDb()
    testSql("update project_budgets set monthly_sek=37 where project_id='" + TEST_PROJECT + "';")
    try {
      initializeWorkerDb()
      expect(testSql("select monthly_sek from project_budgets where project_id='" + TEST_PROJECT + "';")).toBe('37')
    } finally {
      testSql("update project_budgets set monthly_sek=100 where project_id='" + TEST_PROJECT + "';")
    }
  })
})
