import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { LOCAL_TEXT_UNRESOLVED_INCIDENT_RELEASE_HOLD, localTextDispatchEnabled } from '../activation-fence'

const source = (name: string) => readFileSync(resolve(process.cwd(), name), 'utf8')

describe('local-model emergency release hold until project-wide DB incident fence #533 is ready', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('fails closed when the ordinary Vercel pilot flag is false or absent', () => {
    vi.stubEnv('ATLAS_LOCAL_TEXT_ENABLED', 'false')
    expect(localTextDispatchEnabled()).toBe(false)
    vi.stubEnv('ATLAS_LOCAL_TEXT_ENABLED', '')
    expect(localTextDispatchEnabled()).toBe(false)
  })

  it('still fails closed even if someone accidentally enables the Vercel pilot flag', () => {
    vi.stubEnv('ATLAS_LOCAL_TEXT_ENABLED', 'true')
    expect(LOCAL_TEXT_UNRESOLVED_INCIDENT_RELEASE_HOLD).toBe(true)
    expect(localTextDispatchEnabled()).toBe(false)
  })

  it('cannot be released by another client-controlled environment variable', () => {
    vi.stubEnv('ATLAS_LOCAL_TEXT_ENABLED', 'true')
    vi.stubEnv('ATLAS_LOCAL_TEXT_PROJECT_FENCE_APPLIED', 'true')
    vi.stubEnv('LOCAL_TEXT_FORCE', 'true')
    expect(localTextDispatchEnabled()).toBe(false)
  })

  it.each([
    ['signed worker claim and task completion', 'app/api/local-text/worker/[operation]/route.ts'],
    ['operator device registration and approval', 'lib/local-text/owner-api.ts'],
    ['operator admission', 'lib/local-text/admission-api.ts'],
    ['direct pilot API', 'lib/local-text/pilot-api.ts'],
    ['Atlas tool advertisement/dispatch', 'lib/local-text/atlas-tools.ts'],
    ['paid cloud budget creation', 'lib/local-text/budget-api.ts'],
    ['pending cloud task physical dispatch', 'lib/local-text/cloud-runs.ts'],
  ])('keeps %s behind independent source-controlled hold', (_purpose, filename) => {
    const body = source(filename)
    expect(body).toContain('localTextDispatchEnabled')
    expect(body).toContain('activation-fence')
  })

  it('does not add provider calls, credential access or a resolver into the gate', () => {
    const text = source('lib/local-text/activation-fence.ts')
    expect(text).not.toMatch(/from\(|\.rpc\(|fetch\(|approve|revoke\(|generate\(/)
    expect(text).toContain('LOCAL_TEXT_UNRESOLVED_INCIDENT_RELEASE_HOLD')
    expect(text).not.toContain("process.env.ATLAS_LOCAL_TEXT_PROJECT_FENCE_APPLIED === 'true'")
  })
})
