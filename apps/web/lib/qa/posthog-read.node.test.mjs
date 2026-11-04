import test from 'node:test'
import assert from 'node:assert/strict'
import { readPosthogDashboards } from '../atlas/capability/posthog-read.ts'

const config = { projectId: 245437, personalApiKey: 'TEST_ONLY', appHost: 'https://eu.posthog.com' }

test('GET only, fixed project and bounded result, no private fields', async () => {
  let called = false
  const fetcher = async (url, options) => {
    called = true
    assert.equal(url.origin, 'https://eu.posthog.com')
    assert.equal(url.pathname, '/api/projects/245437/dashboards/')
    assert.equal(url.searchParams.get('limit'), '10')
    assert.equal(options.method, 'GET')
    assert.equal(options.headers.Authorization, 'Bearer TEST_ONLY')
    assert.equal(options.cache, 'no-store')
    assert.equal(options.redirect, 'error')
    return Response.json({ results: Array.from({ length: 12 }, (_, i) => ({
      id: i + 1, name: 'Dashboard', sensitive_metadata: 'should not be returned',
    })) })
  }
  const result = await readPosthogDashboards(config, fetcher)
  assert.equal(called, true)
  assert.equal(result.dashboards.length, 10)
  assert.deepEqual(result.dashboards[0], { id: 1, name: 'Dashboard' })
})

test('no fetch with invalid project or missing credentials', async () => {
  const fetcher = async () => { throw new Error('fetch should not run') }
  await assert.rejects(readPosthogDashboards({ ...config, projectId: -1 }, fetcher), /posthog_invalid_project/)
  await assert.rejects(readPosthogDashboards({ ...config, personalApiKey: '' }, fetcher), /posthog_missing_private_key/)
  await assert.rejects(readPosthogDashboards({ ...config, appHost: 'https://attacker.test' }, fetcher), /posthog_invalid_host/)
})

test('sanitize upstream failures and reject bad response shape', async () => {
  await assert.rejects(readPosthogDashboards(config, async () =>
    new Response('SECRET', { status: 401 })
  ), error => error.message === 'posthog_read_failed' && !error.message.includes('SECRET'))
  await assert.rejects(readPosthogDashboards(config, async () =>
    Response.json({ results: [{ id: 'bad', name: 'x' }] })
  ), /posthog_invalid_response/)
})

test('network exceptions never expose private upstream details', async () => {
  await assert.rejects(readPosthogDashboards(config, async () => {
    throw new Error('TEST_ONLY https://eu.posthog.com/private-user')
  }), error => error.message === 'posthog_read_failed' && error.cause === undefined)
})
test('malformed JSON never exposes response text', async () => {
  await assert.rejects(readPosthogDashboards(config, async () =>
    new Response('PRIVATE_BODY malformed', { status: 200 })
  ), error => error.message === 'posthog_invalid_response' && error.cause === undefined)
})
test('unexpected successful HTTP statuses are refused', async () => {
  await assert.rejects(readPosthogDashboards(config, async () =>
    Response.json({ results: [] }, { status: 201 })
  ), /posthog_read_failed/)
})
test('declared oversized response is cancelled before reading', async () => {
  let cancelled = false
  const body = new ReadableStream({
    pull(controller) {
      controller.enqueue(new TextEncoder().encode('{"results":[]}'))
      controller.close()
    },
    cancel() { cancelled = true },
  }, { highWaterMark: 0 })
  await assert.rejects(readPosthogDashboards(config, async () =>
    new Response(body, { headers: { 'content-length': '1048577' } })
  ), /posthog_response_too_large/)
  assert.equal(cancelled, true)
})
test('streaming byte limit applies without content-length and cancels the body', async () => {
  let cancelled = false
  let reads = 0
  const body = new ReadableStream({
    pull(controller) { reads++; controller.enqueue(new Uint8Array(65536).fill(32)); if (reads === 20) controller.close() },
    cancel() { cancelled = true },
  })
  await assert.rejects(readPosthogDashboards(config, async () =>
    new Response(body)
  ), /posthog_response_too_large/)
  assert.equal(cancelled, true)
  assert.ok(reads < 25)
})
test('response stream failures are sanitized', async () => {
  await assert.rejects(readPosthogDashboards(config, async () =>
    new Response(new ReadableStream({
      start(controller) { controller.error(new Error('PRIVATE_BODY TEST_ONLY')) },
    }))
  ), error => error.message === 'posthog_read_failed' && error.cause === undefined)
})
test('non-positive dashboard IDs are rejected', async () => {
  await assert.rejects(readPosthogDashboards(config, async () =>
    Response.json({ results: [{ id: -1, name: 'bad' }] })
  ), /posthog_invalid_response/)
})

test('five-second timeout also cancels a stalled response body', async () => {
  let cancelled = false
  const body = new ReadableStream({ cancel() { cancelled = true } })
  // AbortSignal.timeout does not itself keep Node alive.
  const keepAlive = setInterval(() => {}, 1000)
  const started = Date.now()
  try {
    await assert.rejects(readPosthogDashboards(config, async () =>
      new Response(body)
    ), error => error.message === 'posthog_read_failed' && error.cause === undefined)
    assert.equal(cancelled, true)
    assert.ok(Date.now() - started < 7000)
  } finally {
    clearInterval(keepAlive)
  }
})
