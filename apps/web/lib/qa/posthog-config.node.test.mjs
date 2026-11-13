import test from 'node:test'
import assert from 'node:assert/strict'
import { loadPosthogBindings } from '../atlas/capability/posthog-config.ts'

const valid = {
  POSTHOG_OMNIRA_PROJECT_ID: '00000000-0000-4000-8000-000000000001',
  POSTHOG_PROJECT_ID: '245437',
  POSTHOG_PERSONAL_API_KEY: 'TEST_ONLY',
  POSTHOG_APP_HOST: 'https://eu.posthog.com',
}

test('empty config cannot imply a wildcard binding', () => {
  assert.deepEqual(loadPosthogBindings({}), [])
  assert.deepEqual(loadPosthogBindings({ ...valid, POSTHOG_PERSONAL_API_KEY: '' }), [])
})

test('valid server configuration maps exactly one Omnira project', () => {
  assert.deepEqual(loadPosthogBindings(valid), [{
    omniraProjectId: valid.POSTHOG_OMNIRA_PROJECT_ID,
    posthog: {
      projectId: 245437, personalApiKey: 'TEST_ONLY', appHost: 'https://eu.posthog.com',
    },
  }])
})

test('rejects non-UUID mappings, invalid IDs and wrong host', () => {
  assert.deepEqual(loadPosthogBindings({ ...valid, POSTHOG_OMNIRA_PROJECT_ID: 'handlarborsen' }), [])
  assert.deepEqual(loadPosthogBindings({ ...valid, POSTHOG_PROJECT_ID: '245437/other' }), [])
  assert.deepEqual(loadPosthogBindings({ ...valid, POSTHOG_PROJECT_ID: '9007199254740993' }), [])
  assert.deepEqual(loadPosthogBindings({ ...valid, POSTHOG_APP_HOST: 'https://evil.example' }), [])
})
