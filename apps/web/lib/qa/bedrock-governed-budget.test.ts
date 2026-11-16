/**
 * No real AWS or Postgres requests: the REAL withGovernedSpend boundary is used
 * with simulated budget, STOP and transport seams. Tests dispatch ordering,
 * fail-closed denial, and gross metering into the shared settlement rows.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({
  events: [] as string[],
  settlements: [] as any[],
  reservationAllowed: true,
  paused: false,
  credentialsUsed: null as null | Record<string, string>,
  response: {usage:{inputTokens:15,outputTokens:3},output:{message:{content:[{text:'Hej'}]}},stopReason:'end_turn'} as any,
  modelError: null as Error | null,
}))

vi.mock('@/lib/auth/platform-operator', () => ({
  resolvePlatformOperator: async () => {
    state.events.push('operator')
    return { ok: true, userId: 'operator-user', actor: 'user:operator-user' }
  },
}))
vi.mock('@/lib/auth/project-access', () => ({
  resolveProjectAccess: async () => {
    state.events.push('ownership')
    return { ok: true, userId: 'operator-user', allowedProjectIds: [PID] }
  },
}))
vi.mock('@/lib/cost/rates', () => ({
  getRates: async () => ({ usd_sek: 10.5 }),
}))
vi.mock('@/lib/cost/advisory-override', () => ({
  recordAdvisoryOverride: async () => {},
}))
vi.mock('@/lib/cost/budget-gate', () => ({
  reserveSpend: async () => {
    state.events.push('reserve')
    return state.reservationAllowed
      ? { allowed: true, wouldAllow: true, advisoryOverride: false, reason: 'ok',
          reservationId: 'res-1', headroomSek: 100, bindingScope: null }
      : { allowed: false, wouldAllow: false, advisoryOverride: false, reason: 'budget_exceeded',
          reservationId: 'res-1', headroomSek: 0, bindingScope: null }
  },
  markSpendDispatchIntent: async () => { state.events.push('intent'); return true },
  openOverrideReservation: async () => { throw Error('should never override enforced budget') },
  settleSpend: async (_id: string, payload: any) => {
    state.events.push('settle')
    state.settlements.push(payload)
    return { settled: true, result: 'settled' }
  },
  releaseSpend: async () => { state.events.push('release') },
}))
vi.mock('@/lib/governance/execution-stop', async original => {
  const actual = await original<typeof import('@/lib/governance/execution-stop')>()
  return {
    ...actual,
    resolveExecutionStopForContract: async () => {
      state.events.push('stop')
      return { allowed: !state.paused, reason: state.paused ? 'global_automation_paused' : null,
        context: 'OPERATOR_EXECUTION', resolution: 'RESOLVED',
        scopesEvaluated: ['PLATFORM_AUTOMATION','PROJECT_EXECUTION'],
        globalPaused: state.paused, projectPaused: null, observed: null }
    },
  }
})
vi.mock('@/lib/governance/execution-signal', async original => {
  const actual = await original<typeof import('@/lib/governance/execution-signal')>()
  return {
    ...actual,
    admitPhysicalRequest: async () => { state.events.push('admit') },
    watchExecutionAuthority: () => {
      state.events.push('watch')
      const ctrl = new AbortController()
      return { signal: ctrl.signal, abortReason: null,
        authorityUnavailable: false, dispose() {} }
    },
  }
})
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({ from: () => { throw Error('Unexpected DB row access') } }),
}))
vi.mock('@aws-sdk/client-bedrock-runtime', () => ({
  ConverseCommand: class { input: any; constructor(input: any) { this.input = input } },
  BedrockRuntimeClient: class {
    constructor(options: any) {
      state.credentialsUsed = options.credentials
      expect(options.maxAttempts).toBe(1)
      expect(options.region).toBe('us-east-1')
    }
    async send(command: any, _options: any) {
      state.events.push('model')
      expect(command.input.modelId).toBe('amazon.nova-micro-v1:0')
      expect(command.input.inferenceConfig.maxTokens).toBe(64)
      if (state.modelError) throw state.modelError
      return state.response
    }
    destroy() {}
  },
}))

const PID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
const originalFetch = globalThis.fetch
const envKeys = ['VERCEL_ENV','VERCEL_GIT_COMMIT_REF','H1_SPEND_GATE',
  'BEDROCK_GOVERNED_PILOT_ENABLED','AWS_BEDROCK_REGION','AWS_BEDROCK_ROLE_ARN']
const originalEnv = Object.fromEntries(envKeys.map(key => [key, process.env[key]]))

beforeEach(() => {
  vi.resetModules()
  state.events.length = 0
  state.settlements.length = 0
  state.reservationAllowed = true
  state.paused = false
  state.credentialsUsed = null
  state.modelError = null
  state.response = {usage:{inputTokens:15,outputTokens:3},
    output:{message:{content:[{text:'Hej'}]}},stopReason:'end_turn'}
  process.env.VERCEL_ENV = 'preview'
  process.env.VERCEL_GIT_COMMIT_REF = 'feat/omnira-bedrock-pilot-20261116'
  process.env.H1_SPEND_GATE = '1'
  process.env.BEDROCK_GOVERNED_PILOT_ENABLED = 'true'
  process.env.AWS_BEDROCK_REGION = 'us-east-1'
  process.env.AWS_BEDROCK_ROLE_ARN = 'arn:aws:iam::793854110735:role/Omnira-Bedrock-Test'
  globalThis.fetch = vi.fn(async () => {
    state.events.push('sts')
    return new Response('<AssumedRoleUser><Arn>dummy</Arn></AssumedRoleUser>'
      + '<Credentials><AccessKeyId>FAKEKEY</AccessKeyId>'
      + '<SecretAccessKey>FAKESECRET</SecretAccessKey><SessionToken>FAKETOKEN</SessionToken></Credentials>', {status:200})
  }) as typeof fetch
})

async function run(inputOverrides: Record<string, unknown> = {}) {
  const { resolveManualBedrockOperatorGrant } = await import('@/lib/ai/bedrock-pilot/operator-grant')
  const grantResult = await resolveManualBedrockOperatorGrant(PID)
  if (!grantResult.ok) throw Error('unexpected denial for mocked owner')
  const { runGovernedBedrockManualReview } = await import('@/lib/ai/bedrock-pilot/governed-client')
  return runGovernedBedrockManualReview({
    ctx: { projectId: PID, operatorGrant: grantResult.grant, agent: 'Editorial QA',
      execution: { context: 'OPERATOR_EXECUTION', scope: { kind:'PROJECT', project: { projectId: PID } } },
    },
    request: {
      projectId: PID, script:'Review this short test report.',
      sources: [
        { url:'https://example.org/source-one', excerpt:'Source one content.' },
        { url:'https://example.org/source-two', excerpt:'Source two content.' },
      ], maxOutputTokens:64,
      ...inputOverrides,
    },
    vercelOidcToken:'fake-vercel-oidc',
  })
}

describe('Nova governed adapter + actual Omnira spend boundary, simulated AWS and DB',()=>{
  it('successful request reserves, checks stop, invokes once and settles metered tokens', async()=>{
    const r=await run()
    expect(r.text).toBe('Hej')
    expect(r.editorialOnly).toBe(true)
    expect(state.credentialsUsed).toEqual({accessKeyId:'FAKEKEY',secretAccessKey:'FAKESECRET',sessionToken:'FAKETOKEN'})
    const order=['sts','reserve','intent','stop','admit','watch','model','settle']
    expect(order.map(x=>state.events.indexOf(x))).toEqual([...order].map(x=>state.events.indexOf(x)).sort((a,b)=>a-b))
    expect(state.events.filter(x=>x==='model')).toHaveLength(1)
    expect(state.settlements).toHaveLength(1)
    const settled=state.settlements[0]
    expect(settled.kind).toBe('metered')
    expect(settled.rows).toHaveLength(1)
    expect(settled.rows[0]).toMatchObject({provider:'aws-bedrock',model:'amazon.nova-micro-v1:0',tokens_in:15,tokens_out:3})
    expect(state.events).not.toContain('release')
  })

  it('operator fake or missing grant cannot reach STS', async()=>{
    const { runGovernedBedrockManualReview }=await import('@/lib/ai/bedrock-pilot/governed-client')
    await expect(runGovernedBedrockManualReview({
      ctx:{ projectId:PID,operatorGrant:{kind:'MANUAL_BEDROCK_OPERATOR_GRANT',projectId:PID,actor:'forged'} as never,
        agent:'Editorial QA', execution:{context:'OPERATOR_EXECUTION',scope:{kind:'PROJECT',project:{projectId:PID}}}},
      request:{ projectId:PID,script:'x',sources:[
        {url:'https://example.org/a',excerpt:'a'},{url:'https://example.org/b',excerpt:'b'}],maxOutputTokens:64},
      vercelOidcToken:'fake',
    })).rejects.toThrow('BEDROCK_PILOT_OPERATOR_GRANT_REQUIRED')
    expect(state.events).not.toContain('sts')
    expect(state.events).not.toContain('reserve')
    expect(state.events).not.toContain('model')
  })

  it('hard budget refusal releases and prevents model execution', async()=>{
    state.reservationAllowed=false
    await expect(run()).rejects.toThrow(/budget_exceeded/)
    expect(state.events).toContain('reserve')
    expect(state.events).toContain('release')
    expect(state.events).not.toContain('model')
    expect(state.events).not.toContain('settle')
  })

  it('global stop refusal releases reservation and never sends a model call', async()=>{
    state.paused=true
    await expect(run()).rejects.toThrow(/global_automation_paused/)
    expect(state.events).toContain('reserve')
    expect(state.events).toContain('stop')
    expect(state.events).toContain('release')
    expect(state.events).not.toContain('model')
    expect(state.events).not.toContain('settle')
  })

  it('ambiguous provider error retains ceiling instead of releasing budget', async()=>{
    state.modelError=new Error('network timeout after dispatch')
    await expect(run()).rejects.toThrow('network timeout')
    expect(state.events).toContain('model')
    expect(state.events).toContain('settle')
    expect(state.events).not.toContain('release')
    expect(state.settlements[0].kind).toBe('estimate_ambiguous')
  })

  it('missing token usage is not reported as zero cost', async()=>{
    state.response={...state.response, usage:undefined}
    await expect(run()).rejects.toThrow('BEDROCK_PILOT_REFUSED')
    expect(state.settlements[0].kind).toBe('estimate_ambiguous')
    expect(state.events).not.toContain('release')
  })
})
