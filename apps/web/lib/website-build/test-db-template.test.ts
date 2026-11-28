import { afterEach, describe, expect, it, vi } from 'vitest'
const boundary = vi.hoisted(() => ({ execute: vi.fn() }))
vi.mock('node:child_process', () => ({ spawnSync: boundary.execute }))
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); boundary.execute.mockReset() })
describe('WebsiteBuild template transport validation', () => {
  it.each(['postgres', 'website_test_1;drop database postgres'])('rejects invalid template %s before falling back to an existing database', async template => {
    vi.stubEnv('WEBSITE_BUILD_TEST_TEMPLATE_DATABASE_NAME', template)
    vi.stubEnv('WEBSITE_BUILD_TEST_DATABASE_NAME', 'website_test_123')
    boundary.execute.mockImplementation(() => { throw Error('Unexpected external Docker call') })
    const { initializeWorkerDb } = await import('./test-db')
    expect(() => initializeWorkerDb()).toThrow(/invalid fixture template/i)
    expect(boundary.execute).not.toHaveBeenCalled()
  })
  it('rejects a remote Docker context before creating a clone', async () => {
    vi.stubEnv('WEBSITE_BUILD_TEST_TEMPLATE_DATABASE_NAME', 'website_test_123')
    vi.stubEnv('WEBSITE_BUILD_TEST_DATABASE_NAME', 'website_test_456')
    boundary.execute.mockImplementation((_command, args: string[]) => {
      if (args[0] === 'context') return { status: 0, stdout: 'tcp://remote.invalid:2375', stderr: '' }
      throw Error('Unexpected external Docker call')
    })
    const { initializeWorkerDb } = await import('./test-db')
    expect(() => initializeWorkerDb()).toThrow(/remote Docker context refused/i)
    expect(boundary.execute.mock.calls.every(call => call[1][0] === 'context')).toBe(true)
  })
  it.each(['DOCKER_HOST', 'DOCKER_CONTEXT'])('rejects %s before using a template', async key => {
    vi.stubEnv('WEBSITE_BUILD_TEST_TEMPLATE_DATABASE_NAME', 'website_test_123')
    vi.stubEnv(key, key === 'DOCKER_HOST' ? 'tcp://remote.invalid:2375' : 'remote')
    boundary.execute.mockImplementation(() => { throw Error('Unexpected external Docker call') })
    const { initializeWorkerDb } = await import('./test-db')
    expect(() => initializeWorkerDb()).toThrow(/Docker.*override/i)
    expect(boundary.execute).not.toHaveBeenCalled()
  })
})
