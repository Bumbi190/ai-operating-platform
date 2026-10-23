import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('Atlas text model failover consumers remain routed and opt-in', () => {
  it('routes the cron briefing through the shared governed text client', () => {
    const content = source('app/api/media/cron/morning-briefing/route.ts')
    expect(content).toContain("import { getMediaTextClient }")
    expect(content).toContain('const claude = getMediaTextClient(')
    expect(content).toContain("agent: 'CFO Briefing', operation: 'Morning Briefing'")
    expect(content).not.toContain('const claude = getAnthropic(')
  })
  it('preserves per-project Dream stop authority and validates project billing at opt-in', () => {
    const content = source('lib/ai/dream.ts')
    expect(content).toContain('const ownedProject =')
    expect(content).toContain("process.env.ATLAS_TEXT_FAILOVER_ENABLED === 'true'")
    expect(content).toContain("execution.scope.project.projectId === project.id")
    expect(content).toContain('getMediaTextClient({')
    expect(content).toContain('project: ownedProject')
    expect(content).not.toContain('const response = await getAnthropic(')
  })
  it('passes news project identity only from the existing verified project-bound call', () => {
    const content = source('lib/media/news-hunter.ts')
    expect(content).toContain('verifiedProjectId')
    expect(content).toContain('getMediaTextClient({')
    expect(content).toContain('claudeEditorialPick(execution, scored, maxCandidates, trendingTopics, projectId, verifiedProjectSlug)')
    expect(content).toContain("data?.slug === 'ai-media-automation'")
  })
  it('does not introduce publishing, scheduling, paid retries or an API route', () => {
    const content = source('lib/media/text-client.ts')
    expect(content).toContain("...openAITextOptions('gpt-5.4-mini', input.max_tokens")
    expect(content).toContain('classifyAnthropicNoGeneration(error)')
    expect(content).not.toContain('fetch(\'https://api.openai.com')
    expect(content).not.toContain('maxRetries: 2')
  })
})
