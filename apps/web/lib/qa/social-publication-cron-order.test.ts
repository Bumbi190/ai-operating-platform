import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('social publication Insights cron integration guards', () => {
  const cron = readFileSync(resolve(process.cwd(), 'app/api/media/cron/insights/route.ts'), 'utf8')

  it('runs existing insights and Atlas opportunities BEFORE the optional reader', () => {
    const oldInsights = cron.indexOf('await refreshAllInsights(')
    const opportunities = cron.indexOf('await detectAndStoreOpportunities(')
    const optional = cron.indexOf('await refreshSocialPublicationInstagramInsights(')
    expect(oldInsights).toBeGreaterThan(0)
    expect(opportunities).toBeGreaterThan(oldInsights)
    expect(optional).toBeGreaterThan(opportunities)
  })

  it('is feature-flagged OFF by default and keeps the original endpoint auth gate', () => {
    expect(cron).toContain("process.env.OMNIRA_SOCIAL_PUBLICATION_INSIGHTS_ENABLED !== 'true'")
    const authorization = cron.indexOf("authHeader !== `Bearer ${cronSecret}`")
    const firstRead = cron.indexOf('await refreshAllInsights(')
    expect(authorization).toBeGreaterThan(0)
    expect(firstRead).toBeGreaterThan(authorization)
    expect(cron).toContain("status: 'disabled' as const")
  })

  it('does not affect the existing cron success condition', () => {
    expect(cron).toContain('const ok = result.complete && opportunitiesRan')
    expect(cron).not.toContain('ok = result.complete && socialPublicationInsights')
  })
})
