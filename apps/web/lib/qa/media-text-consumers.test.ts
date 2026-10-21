import { beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ anthropic: vi.fn(), openai: vi.fn(), image: vi.fn() }))
vi.mock('@/lib/ai/anthropic', () => ({ getAnthropic: () => ({ messages: { create: mocks.anthropic } }) }))
vi.mock('@/lib/ai/openai-client', () => ({ openAIChatCompletion: mocks.openai }))
vi.mock('@/lib/media/image-client', () => ({ generateIdeogramV3: mocks.image }))
import { claudeEditorialPick } from '@/lib/media/news-hunter'
import { scoreScript, shouldRegenerate } from '@/lib/media/quality'
import { generateSceneImages } from '@/lib/media/ideogram'
import { projectScope } from '@/lib/governance/execution-stop'

const execution = { context: 'AUTONOMOUS' as const, scope: projectScope({ projectSlug: 'ai-media-automation' }) }
const response = (value: unknown) => ({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(value) } }] })
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('OPENAI_API_KEY', 'test-key')
  mocks.anthropic.mockRejectedValue(Object.assign(new Error('insufficient credits'), {
    status: 400, error: { type: 'error', error: {
      type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API.',
    } },
  }))
  mocks.image.mockResolvedValue('https://example.test/scene.png')
})
import { afterEach } from 'vitest'
afterEach(() => vi.unstubAllEnvs())

describe('The Prompt media consumers with exhausted Anthropic credits', () => {
  it('keeps source URLs and editorial picks from the reserve response', async () => {
    mocks.openai.mockResolvedValue(response({ picks: [
      { rank: 1, storyIndex: 1, editorialNote: 'A reported event', suggestedAngle: 'practical', estimatedViralityScore: 85 },
    ], summary: 'A source-grounded selection' }))
    const story = {
      title: 'A real source story', url: 'https://example.test/source', summary: 'Only source facts',
      source: 'rss_openai', sourceLabel: 'OpenAI', publishedAt: new Date(),
      engagementScore: 100, authorityWeight: 1, viralityScore: 85,
    }
    const result = await claudeEditorialPick(execution, [story])
    expect(result.candidates[0].story.url).toBe(story.url)
    expect(result.candidates[0].editorialNote).toBe('A reported event')
    expect(mocks.openai.mock.calls[0][0]).toMatchObject({ execution, agent: 'News Hunter' })
  })

  it('keeps a failing factual-safety verdict as a required rewrite', async () => {
    mocks.openai.mockResolvedValue(response({
      hook_strength: 9, retention_score: 9, visual_relevance: 9, shareability: 9,
      discussion_potential: 9, hallucination_risk: 4, overall: 9, passed: false,
      verdict: 'Unsupported claim in script', weak_spots: ['Remove the unsupported figure'],
    }))
    const quality = await scoreScript(execution, 'A hook', 'An unsupported figure', 'Source without that figure')
    expect(quality.hallucination_risk).toBe(4)
    expect(quality.passed).toBe(false)
    expect(shouldRegenerate(quality)).toBe(true)
  })

  it('accepts the scene array and renders each planned scene through the existing image client', async () => {
    const scenes = Array.from({ length: 8 }, (_, i) => ({ scene: i + 1, prompt: 'Source-specific scene ' + (i + 1) }))
    mocks.openai.mockResolvedValue(response(scenes))
    const result = await generateSceneImages('A sourced script', 'A hook', execution)
    expect(result).toHaveLength(8)
    expect(mocks.image).toHaveBeenCalledTimes(8)
    expect(mocks.image.mock.calls[0][0]).toMatchObject({ execution, operation: 'Scene Image' })
    expect(mocks.image.mock.calls[0][1].prompt).toBe(scenes[0].prompt)
  })
})
