import { describe, it, expect } from 'vitest'
import { initializeWorkerDb, testSql, TEST_PROJECT } from './test-db'

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
