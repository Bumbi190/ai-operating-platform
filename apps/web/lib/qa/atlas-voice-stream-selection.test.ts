import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
vi.mock('@/lib/atlas/runtime', () => ({ useOptionalAtlas: () => null }))
vi.mock('@/lib/supabase/client', () => ({ createClient: vi.fn() }))
vi.mock('next/link', () => ({ default: ({ children }: any) => children }))
vi.mock('@/lib/auth/platform-operator', () => ({ resolvePlatformOperator: async () => ({ ok: true }) }))
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('not_found') }, redirect: () => { throw new Error('login') } }))
import { AtlasVoiceTrial } from '@/app/(platform)/atlas/rosttest/voice-trial'
import Page from '@/app/(platform)/atlas/rosttest/page'
beforeEach(() => { vi.stubGlobal('React', React); vi.stubEnv('VERCEL_ENV', 'preview'); vi.stubEnv('ATLAS_VOICE_STREAM_MODE', 'probe') })
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })
it('hides pilot selection without server availability', () => {
  expect(renderToStaticMarkup(React.createElement(AtlasVoiceTrial))).not.toContain('Strömmande tal')
})
it('defaults to batch even when streaming is available', () => {
  const html = renderToStaticMarkup(React.createElement<{ streamingAvailable?: boolean }>(AtlasVoiceTrial, { streamingAvailable: true }))
  expect(html).toContain('Strömmande tal · test')
  expect(html).toMatch(/value="batch" selected=""/)
  expect(html).not.toMatch(/value="streaming" selected=""/)
})
it('defaults the thinking pause to 1.4 seconds and keeps every other choice', () => {
  const html = renderToStaticMarkup(React.createElement(AtlasVoiceTrial))
  expect(html).toMatch(/<option value="1400" selected="">1,4 sekunder/)
  for (const value of [1200, 2000, 3500, 5000]) expect(html).toMatch(new RegExp(`<option value="${value}"(?! selected)`))
})
it('server probe mode does not offer paid pilot selection', async () => {
  const view = await Page()
  expect(view.props.streamingAvailable).toBe(false)
})
it('server explicitly enables selection only in pilot preview mode', async () => {
  vi.stubEnv('ATLAS_VOICE_STREAM_MODE', 'pilot')
  expect((await Page()).props.streamingAvailable).toBe(true)
})
it('production does not expose the page even if mode is pilot', async () => {
  vi.stubEnv('VERCEL_ENV', 'production'); vi.stubEnv('NODE_ENV', 'production'); vi.stubEnv('ATLAS_VOICE_STREAM_MODE', 'pilot')
  await expect(Page()).rejects.toThrow('not_found')
})

it('provider verification mode keeps microphone streaming selection hidden', async () => {
  vi.stubEnv('ATLAS_VOICE_STREAM_MODE', 'verify')
  expect((await Page()).props.streamingAvailable).toBe(false)
})
