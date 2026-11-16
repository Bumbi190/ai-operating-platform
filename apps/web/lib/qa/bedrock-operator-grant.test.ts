import { beforeEach, describe, expect, it, vi } from 'vitest'

const deps = vi.hoisted(() => ({
  operator: vi.fn(),
  access: vi.fn(),
}))
vi.mock('@/lib/auth/platform-operator', () => ({
  resolvePlatformOperator: deps.operator,
}))
vi.mock('@/lib/auth/project-access', () => ({
  resolveProjectAccess: deps.access,
}))

const projectId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const otherProject = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeef'

async function load() {
  return import('@/lib/ai/bedrock-pilot/operator-grant')
}

beforeEach(() => {
  vi.resetModules()
  vi.clearAllMocks()
  deps.operator.mockResolvedValue({ ok: true, userId: 'user-one', actor: 'user:user-one', email: 'hidden@example.test' })
  deps.access.mockResolvedValue({ ok: true, userId: 'user-one', allowedProjectIds: [projectId] })
})

describe('Bedrock operator grant: real, non-forgeable session/ownership gate', () => {
  it('mints only for platform operator who owns the exact requested project', async () => {
    const { resolveManualBedrockOperatorGrant, isManualBedrockOperatorGrant } = await load()
    const granted = await resolveManualBedrockOperatorGrant(projectId)
    expect(granted.ok).toBe(true)
    if (!granted.ok) throw Error('must mint')
    expect(isManualBedrockOperatorGrant(granted.grant, projectId)).toBe(true)
    expect(isManualBedrockOperatorGrant(granted.grant, otherProject)).toBe(false)
    expect(deps.operator).toHaveBeenCalledTimes(1)
    expect(deps.access).toHaveBeenCalledTimes(1)
  })

  it('JSON copies and structural clones cannot authorize', async () => {
    const { resolveManualBedrockOperatorGrant, assertManualBedrockOperatorGrant } = await load()
    const result = await resolveManualBedrockOperatorGrant(projectId)
    if (!result.ok) throw Error('must mint')
    expect(() => assertManualBedrockOperatorGrant({ ...result.grant }, projectId)).toThrow('BEDROCK_PILOT_OPERATOR_GRANT_REQUIRED')
    expect(() => assertManualBedrockOperatorGrant(JSON.parse(JSON.stringify(result.grant)), projectId)).toThrow()
    expect(() => assertManualBedrockOperatorGrant({ kind: result.grant.kind, projectId, actor: result.grant.actor }, projectId)).toThrow()
    expect(() => assertManualBedrockOperatorGrant(result.grant, projectId)).not.toThrow()
  })

  it('anonymous or unconfigured operator is refused before project enumeration', async () => {
    const { resolveManualBedrockOperatorGrant } = await load()
    deps.operator.mockResolvedValue({ ok: false, reason: 'unauthenticated' })
    expect(await resolveManualBedrockOperatorGrant(projectId)).toEqual({ ok: false, reason: 'operator_required' })
    expect(deps.access).not.toHaveBeenCalled()
  })

  it('ownership and cross-session checks fail closed', async () => {
    const { resolveManualBedrockOperatorGrant } = await load()
    deps.access.mockResolvedValueOnce({ ok: true, userId: 'user-two', allowedProjectIds: [projectId] })
    expect(await resolveManualBedrockOperatorGrant(projectId)).toEqual({ ok: false, reason: 'identity_mismatch' })
    deps.access.mockResolvedValueOnce({ ok: true, userId: 'user-one', allowedProjectIds: [] })
    expect(await resolveManualBedrockOperatorGrant(projectId)).toEqual({ ok: false, reason: 'project_not_owned' })
  })

  it('database/session exception and missing project access never mint', async () => {
    const { resolveManualBedrockOperatorGrant } = await load()
    deps.access.mockRejectedValueOnce(new Error('provider session details should never leak'))
    expect(await resolveManualBedrockOperatorGrant(projectId)).toEqual({ ok: false, reason: 'authority_unavailable' })
    deps.access.mockResolvedValueOnce({ ok: false })
    expect(await resolveManualBedrockOperatorGrant(projectId)).toEqual({ ok: false, reason: 'project_access_unavailable' })
  })
})
