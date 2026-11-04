import test from 'node:test'
import assert from 'node:assert/strict'
import { resolveScopedPosthogConfig, readScopedPosthogDashboards } from '../atlas/capability/posthog-scoped.ts'

const bindings = [
  { omniraProjectId: 'project-a', posthog: { projectId: 100, personalApiKey: 'KEY_A', appHost: 'https://eu.posthog.com' } },
  { omniraProjectId: 'project-b', posthog: { projectId: 200, personalApiKey: 'KEY_B', appHost: 'https://eu.posthog.com' } },
]
const request = (projectId, allowed = ['project-a'], otherBindings = bindings) => ({
  requestedOmniraProjectId: projectId, allowedOmniraProjectIds: allowed, bindings: otherBindings,
})

test('owned project resolves its own server binding', () => {
  assert.equal(resolveScopedPosthogConfig(request('project-a')).projectId, 100)
})

test('cross-project access is denied before any fetch', async () => {
  let calls = 0
  await assert.rejects(readScopedPosthogDashboards(request('project-b'), async () => { calls++; throw Error('unexpected fetch') }),
    /posthog_project_forbidden/)
  assert.equal(calls, 0)
})

test('empty ownership list and unknown project fail closed', () => {
  assert.throws(() => resolveScopedPosthogConfig(request('project-a', [])), /posthog_project_forbidden/)
  assert.throws(() => resolveScopedPosthogConfig(request('unknown', ['unknown'])), /posthog_binding_unavailable/)
})

test('duplicate bindings are rejected rather than arbitrarily selected', () => {
  assert.throws(() => resolveScopedPosthogConfig(request('project-a', ['project-a'], [bindings[0], bindings[0]])),
    /posthog_binding_unavailable/)
})

test('authorized request calls only the mapped PostHog project', async () => {
  let calls = 0
  const result = await readScopedPosthogDashboards(request('project-a'), async (url, init) => {
    calls++
    assert.equal(url.pathname, '/api/projects/100/dashboards/')
    assert.equal(init.headers.Authorization, 'Bearer KEY_A')
    return Response.json({ results: [{ id: 123, name: 'Pilot' }] })
  })
  assert.equal(calls, 1)
  assert.deepEqual(result, { dashboards: [{ id: 123, name: 'Pilot' }] })
})
