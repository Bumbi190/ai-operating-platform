import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ anthropic: vi.fn(), openai: vi.fn() }))
vi.mock('@/lib/ai/anthropic', () => ({
  getAnthropic: () => ({ messages: { create: mocks.anthropic } }),
}))
vi.mock('@/lib/ai/openai-client', () => ({ openAIChatCompletion: mocks.openai }))

import { getMediaTextClient } from '@/lib/media/text-client'
import { projectScope } from '@/lib/governance/execution-stop'

const ctx = {
  project: { projectSlug: 'ai-media-automation' },
  execution: { context: 'AUTONOMOUS' as const, scope: projectScope({ projectSlug: 'ai-media-automation' }) },
  agent: 'Script Writer', operation: 'Generate Script',
}
const input = {
  model: 'claude-sonnet-4-6', max_tokens: 2000, system: 'Return the requested JSON only.',
  messages: [{ role: 'user' as const, content: 'Write a script grounded in this source.' }],
}
function creditError() {
  return Object.assign(new Error('400 Anthropic credit balance is too low'), {
    status: 400,
    error: { type: 'error', error: {
      type: 'invalid_request_error',
      message: 'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.',
    } },
  })
}
function invalidApiKeyError() {
  return Object.assign(new Error('Anthropic rejected API credentials'), {
    status: 401,
    error: { type: 'error', error: {
      type: 'authentication_error', message: 'invalid x-api-key',
    } },
  })
}
function completion(text = '{"hook":"A source-grounded hook"}', finish = 'stop', refusal: string | null = null) {
  return { choices: [{ finish_reason: finish, message: { content: text, refusal } }] }
}
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('OPENAI_API_KEY', 'test-key')
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  mocks.openai.mockResolvedValue(completion())
})
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe('media text credit recovery', () => {
  it('keeps successful Anthropic responses and never dispatches the reserve', async () => {
    const result = { content: [{ type: 'text', text: 'primary' }] }
    mocks.anthropic.mockResolvedValue(result)
    expect(await getMediaTextClient(ctx).messages.create(input)).toBe(result)
    expect(mocks.openai).not.toHaveBeenCalled()
  })

  it('recovers the explicit Anthropic billing refusal through the governed OpenAI boundary', async () => {
    mocks.anthropic.mockRejectedValue(creditError())
    const result = await getMediaTextClient(ctx).messages.create(input)
    expect(result.content).toEqual([{ type: 'text', text: '{"hook":"A source-grounded hook"}', citations: null }])
    expect(mocks.openai).toHaveBeenCalledTimes(1)
    expect(mocks.openai).toHaveBeenCalledWith(ctx, {
      model: 'gpt-5.4-mini', max_completion_tokens: 2000, reasoning_effort: 'none',
      messages: [{ role: 'system', content: input.system }, ...input.messages],
    })
  })

  it('keeps invalid Anthropic credentials as a hard failure unless The Prompt fallback is enabled', async () => {
    const failure = invalidApiKeyError()
    mocks.anthropic.mockRejectedValue(failure)
    await expect(getMediaTextClient({ ...ctx, agent: 'News Hunter', operation: 'Analyze News' }).messages.create(input)).rejects.toBe(failure)
    expect(mocks.openai).not.toHaveBeenCalled()
  })

  it('uses the governed OpenAI reserve once for a proven 401 in The Prompt news hunter when explicitly enabled', async () => {
    vi.stubEnv('MEDIA_NEWS_ANTHROPIC_AUTH_FALLBACK_ENABLED', 'true')
    mocks.anthropic.mockRejectedValue(invalidApiKeyError())
    const newsCtx = { ...ctx, agent: 'News Hunter', operation: 'Analyze News' }
    const value = await getMediaTextClient(newsCtx).messages.create(input)
    expect(value.content[0]).toMatchObject({ type: 'text', text: '{"hook":"A source-grounded hook"}' })
    expect(mocks.anthropic).toHaveBeenCalledTimes(1)
    expect(mocks.openai).toHaveBeenCalledTimes(1)
    expect(mocks.openai).toHaveBeenCalledWith(newsCtx, expect.objectContaining({ model: 'gpt-5.4-mini' }))
    expect(JSON.stringify((console.warn as ReturnType<typeof vi.fn>).mock?.calls ?? [])).not.toContain('x-api-key')
  })

  it.each([
    { name: 'other media agent', change: { agent: 'Script Writer', operation: 'Generate Script' } },
    { name: 'other project', change: { project: { projectSlug: 'familje-stunden' } } },
    { name: 'manual request', change: { execution: { context: 'USER' as const, scope: projectScope({ projectSlug: 'ai-media-automation' }) } } },
  ])('refuses an auth-key fallback for $name', async ({ change }) => {
    vi.stubEnv('MEDIA_NEWS_ANTHROPIC_AUTH_FALLBACK_ENABLED', 'true')
    const failure = invalidApiKeyError()
    mocks.anthropic.mockRejectedValue(failure)
    await expect(getMediaTextClient({ ...ctx, agent: 'News Hunter', operation: 'Analyze News', ...change } as typeof ctx).messages.create(input)).rejects.toBe(failure)
    expect(mocks.openai).not.toHaveBeenCalled()
  })

  it('never falls back on an ambiguous 401 even with the auth-reserve flag', async () => {
    vi.stubEnv('MEDIA_NEWS_ANTHROPIC_AUTH_FALLBACK_ENABLED', 'true')
    const error = Object.assign(new Error('unauthorized'), { status: 401 })
    mocks.anthropic.mockRejectedValue(error)
    await expect(getMediaTextClient({ ...ctx, agent: 'News Hunter', operation: 'Analyze News' }).messages.create(input)).rejects.toBe(error)
    expect(mocks.openai).not.toHaveBeenCalled()
  })

  it('requires the OpenAI reserve credential even with explicit fallback approval', async () => {
    vi.stubEnv('MEDIA_NEWS_ANTHROPIC_AUTH_FALLBACK_ENABLED', 'true')
    vi.stubEnv('OPENAI_API_KEY', '')
    const error = invalidApiKeyError()
    mocks.anthropic.mockRejectedValue(error)
    await expect(getMediaTextClient({ ...ctx, agent: 'News Hunter', operation: 'Analyze News' }).messages.create(input)).rejects.toBe(error)
    expect(mocks.openai).not.toHaveBeenCalled()
  })

  it('preserves OpenAI budget refusal on an opted-in invalid-key fallback', async () => {
    vi.stubEnv('MEDIA_NEWS_ANTHROPIC_AUTH_FALLBACK_ENABLED', 'true')
    const refusal = Object.assign(new Error('budget denied'), { name: 'SpendRefusedError', reason: 'budget_exceeded' })
    mocks.anthropic.mockRejectedValue(invalidApiKeyError())
    mocks.openai.mockRejectedValue(refusal)
    await expect(getMediaTextClient({ ...ctx, agent: 'News Hunter', operation: 'Analyze News' }).messages.create(input)).rejects.toBe(refusal)
    expect(mocks.openai).toHaveBeenCalledTimes(1)
  })

  it('does not discard the provider error when the reserve credential is absent', async () => {
    vi.stubEnv('OPENAI_API_KEY', '')
    const error = creditError()
    mocks.anthropic.mockRejectedValue(error)
    await expect(getMediaTextClient(ctx).messages.create(input)).rejects.toBe(error)
    expect(mocks.openai).not.toHaveBeenCalled()
  })

  it.each([
    Object.assign(new Error('budget refused'), { name: 'SpendRefusedError', reason: 'budget_exceeded' }),
    Object.assign(new Error('project paused'), { name: 'ExecutionStoppedError', reason: 'project_paused' }),
    Object.assign(new Error('authority unavailable'), { name: 'GovernanceDispatchUnknownError' }),
    Object.assign(new Error('timeout'), { status: 504 }),
    Object.assign(new Error('overloaded'), { status: 529 }),
    Object.assign(new Error('invalid prompt'), { status: 400, error: { error: { type: 'invalid_request_error', message: 'invalid prompt' } } }),
    Object.assign(new Error('Your credit balance is too low to access the Anthropic API.'), { status: 400 }),
    Object.assign(new Error('authentication failed'), { status: 401 }),
  ])('does not turn governance or unrelated failures into another provider call: %s', async error => {
    mocks.anthropic.mockRejectedValue(error)
    await expect(getMediaTextClient(ctx).messages.create(input)).rejects.toBe(error)
    expect(mocks.openai).not.toHaveBeenCalled()
  })

  it('allows text-only image planning without a system message', async () => {
    mocks.anthropic.mockRejectedValue(creditError())
    mocks.openai.mockResolvedValue(completion('A story-specific thumbnail prompt'))
    const { system: _, ...plain } = input
    const result = await getMediaTextClient(ctx).messages.create(plain)
    expect(result.content[0]).toMatchObject({ text: 'A story-specific thumbnail prompt' })
    expect(mocks.openai.mock.calls[0][1].messages).toEqual(plain.messages)
  })

  it.each([
    completion('partial JSON', 'length'),
    completion('', 'stop'),
    completion('blocked', 'content_filter'),
    completion('text', 'stop', 'cannot comply'),
    { choices: [] },
  ])('rejects incomplete or refused reserve output without another retry', async response => {
    mocks.anthropic.mockRejectedValue(creditError())
    mocks.openai.mockResolvedValue(response)
    await expect(getMediaTextClient(ctx).messages.create(input)).rejects.toThrow('MEDIA_TEXT_FALLBACK_INCOMPLETE')
    expect(mocks.openai).toHaveBeenCalledTimes(1)
  })

  it('preserves a budget or stop refusal from the reserve boundary', async () => {
    const refusal = Object.assign(new Error('OpenAI budget refused'), { name: 'SpendRefusedError' })
    mocks.anthropic.mockRejectedValue(creditError())
    mocks.openai.mockRejectedValue(refusal)
    await expect(getMediaTextClient(ctx).messages.create(input)).rejects.toBe(refusal)
    expect(mocks.anthropic).toHaveBeenCalledTimes(1)
    expect(mocks.openai).toHaveBeenCalledTimes(1)
  })
})
