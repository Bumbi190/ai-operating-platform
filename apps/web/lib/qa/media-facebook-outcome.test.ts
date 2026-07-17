/**
 * Behavioral tests for the Facebook provider-side-effect boundary in
 * postReelToFacebook (lib/media/facebook.ts).
 *
 * The POST to /{page}/videos IS the provider side effect. Everything before it
 * (env checks, page-token resolution) is read-only and must stay retryable.
 * After the POST is dispatched, any outcome where external success cannot be
 * ruled out must surface as FacebookAmbiguousOutcomeError so the publish
 * routes mark unknown_external_outcome instead of retryable_failed.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import {
  postReelToFacebook,
  isFacebookAmbiguousOutcomeError,
  FacebookAmbiguousOutcomeError,
} from '@/lib/media/facebook'

const realFetch = globalThis.fetch

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function brokenBodyResponse(status: number) {
  return new Response('{"id": "trunca', { status, headers: { 'Content-Type': 'application/json' } })
}

function mockFetchSequence(handlers: Array<(url: string) => Promise<Response> | Response>) {
  let call = 0
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const handler = handlers[Math.min(call, handlers.length - 1)]
    call += 1
    return handler(String(input))
  }) as typeof fetch
}

beforeEach(() => {
  process.env.FACEBOOK_PAGE_ID = 'page-1'
  process.env.FACEBOOK_PAGE_ACCESS_TOKEN = 'token-1'
})

afterEach(() => {
  globalThis.fetch = realFetch
})

const tokenResolution = () => jsonResponse({ data: [{ id: 'page-1', access_token: 'page-token' }] })

describe('Facebook publish outcome classification', () => {
  it('a token-resolution failure (before the side effect) is a plain retryable error', async () => {
    mockFetchSequence([
      () => { throw new TypeError('fetch failed') },
    ])
    await expect(postReelToFacebook('https://cdn.example/v.mp4', 'caption'))
      .rejects.toSatisfy((err: unknown) => !isFacebookAmbiguousOutcomeError(err))
  })

  it('a network failure after the video POST was dispatched is ambiguous (fail closed)', async () => {
    mockFetchSequence([
      tokenResolution,
      () => { throw new TypeError('socket hang up') },
    ])
    await expect(postReelToFacebook('https://cdn.example/v.mp4', 'caption'))
      .rejects.toSatisfy((err: unknown) =>
        isFacebookAmbiguousOutcomeError(err) && err instanceof FacebookAmbiguousOutcomeError)
  })

  it('a 200 response with a truncated/unparseable body is ambiguous (fail closed)', async () => {
    mockFetchSequence([
      tokenResolution,
      () => brokenBodyResponse(200),
    ])
    await expect(postReelToFacebook('https://cdn.example/v.mp4', 'caption'))
      .rejects.toSatisfy(isFacebookAmbiguousOutcomeError)
  })

  it('a 200 response without a post id is ambiguous (fail closed)', async () => {
    mockFetchSequence([
      tokenResolution,
      () => jsonResponse({}),
    ])
    await expect(postReelToFacebook('https://cdn.example/v.mp4', 'caption'))
      .rejects.toSatisfy(isFacebookAmbiguousOutcomeError)
  })

  it('a definitive provider error response stays retryable (NOT ambiguous)', async () => {
    mockFetchSequence([
      tokenResolution,
      () => jsonResponse({ error: { message: 'Invalid OAuth access token' } }, 400),
    ])
    await expect(postReelToFacebook('https://cdn.example/v.mp4', 'caption'))
      .rejects.toSatisfy((err: unknown) =>
        !isFacebookAmbiguousOutcomeError(err) && (err as Error).message.includes('Invalid OAuth access token'))
  })

  it('an error status with an unparseable body stays retryable (no post was created)', async () => {
    mockFetchSequence([
      tokenResolution,
      () => brokenBodyResponse(500),
    ])
    await expect(postReelToFacebook('https://cdn.example/v.mp4', 'caption'))
      .rejects.toSatisfy((err: unknown) => !isFacebookAmbiguousOutcomeError(err))
  })

  it('a successful post returns the post id', async () => {
    mockFetchSequence([
      tokenResolution,
      () => jsonResponse({ id: 'post-1' }),
    ])
    await expect(postReelToFacebook('https://cdn.example/v.mp4', 'caption'))
      .resolves.toMatchObject({ postId: 'post-1' })
  })
})
