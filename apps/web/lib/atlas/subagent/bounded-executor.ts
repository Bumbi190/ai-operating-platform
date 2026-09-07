import 'server-only'

import { randomUUID } from 'node:crypto'

import { assertProjectAllowed } from '@/lib/atlas/isolation'
import {
  READ_ONLY_ANALYSIS_CAPABILITIES,
  type AcceptanceVerdict,
  type BoundedSubagentExecutionResult,
  type BoundedSubagentReceipt,
  type ReadOnlyAcceptanceCriterion,
  type ReadOnlyAnalysisTask,
  type ReadOnlySubagentDriver,
  type ReadOnlySubagentTool,
  type SubagentAuthoritySnapshot,
  type SubagentErrorClassification,
  type SubagentExecutionBounds,
  type SubagentIdentityContext,
  type SubagentTerminalStatus,
  type SubagentTurnResult,
} from './types'

const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CAPABILITY_PATTERN = /^[a-z][a-z0-9._:-]{0,79}$/
const POLICY_CAPABILITIES = new Set<string>(READ_ONLY_ANALYSIS_CAPABILITIES)
const PROTECTED_TASK_KEYS = new Set([
  'principalId', 'principal_id', 'userId', 'user_id', 'projectId', 'project_id',
  'roleId', 'role_id', 'missionId', 'mission_id', 'delegationId', 'delegation_id',
  'workPackageId', 'work_package_id', 'parentRunId', 'parent_run_id',
  'childRunId', 'child_run_id', 'traceId', 'trace_id', 'identity', 'authority',
])

const LIMITS = {
  maxTurns: 20,
  maxExecutionMs: 300_000,
  maxInputTokens: 1_000_000,
  maxOutputTokens: 200_000,
  maxToolCalls: 100,
  maxSummaryChars: 10_000,
  maxReceiptBytes: 32_768,
} as const

export class BoundedSubagentCapacity {
  private running = 0

  constructor(readonly maxRunning = 1) {
    if (!Number.isInteger(maxRunning) || maxRunning < 1 || maxRunning > 64) {
      throw new Error('maxRunning must be an integer between 1 and 64')
    }
  }

  tryAcquire(): boolean {
    if (this.running >= this.maxRunning) return false
    this.running += 1
    return true
  }

  release(): void {
    if (this.running > 0) this.running -= 1
  }

  get active(): number {
    return this.running
  }
}

const processCapacity = new BoundedSubagentCapacity(1)

export interface BoundedSubagentExecutorDependencies {
  readonly tools: readonly ReadOnlySubagentTool[]
  readonly driver: ReadOnlySubagentDriver
  readonly capacity?: BoundedSubagentCapacity
  readonly createChildRunId?: () => string
  readonly now?: () => Date
}

export interface ExecuteReadOnlyAnalysisArgs {
  readonly authority: SubagentAuthoritySnapshot
  readonly task: ReadOnlyAnalysisTask
  readonly bounds: SubagentExecutionBounds
  readonly signal?: AbortSignal
  readonly dependencies: BoundedSubagentExecutorDependencies
}

interface ReceiptState {
  status: SubagentTerminalStatus
  summary: string
  error: SubagentErrorClassification | null
  acceptance: AcceptanceVerdict[]
  turns: number
  inputTokens: number
  outputTokens: number
  toolCalls: number
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && ID_PATTERN.test(value)
}

function validOptionalId(value: unknown): value is string | null | undefined {
  return value == null || validId(value)
}

function validCapabilityList(value: readonly string[]): boolean {
  return Array.isArray(value)
    && value.length <= 16
    && value.every((item) => typeof item === 'string' && CAPABILITY_PATTERN.test(item))
}

function validCriterion(value: ReadOnlyAcceptanceCriterion): boolean {
  if (!value || !validId(value.criterionId)) return false
  if (value.kind === 'SUMMARY_NON_EMPTY') return true
  return value.kind === 'SUMMARY_INCLUDES'
    && typeof value.value === 'string'
    && value.value.trim().length > 0
    && value.value.length <= 500
}

function validBounds(bounds: SubagentExecutionBounds): boolean {
  const entries = Object.entries(LIMITS) as Array<[keyof typeof LIMITS, number]>
  return entries.every(([key, ceiling]) => {
    const value = bounds?.[key]
    return Number.isInteger(value) && value > 0 && value <= ceiling
  }) && bounds.maxReceiptBytes >= 8_192
}

function hasIdentityOverride(task: ReadOnlyAnalysisTask): boolean {
  return Object.keys(task as unknown as Record<string, unknown>)
    .some((key) => PROTECTED_TASK_KEYS.has(key))
}

function validateAuthority(authority: SubagentAuthoritySnapshot): SubagentErrorClassification | null {
  if (!validId(authority?.principalId)
    || !UUID_PATTERN.test(authority?.projectId ?? '')
    || !validId(authority?.roleId)
    || !validOptionalId(authority?.missionId)
    || !validOptionalId(authority?.delegationId)
    || !validOptionalId(authority?.workPackageId)
    || !validId(authority?.parentRunId)
    || !validId(authority?.traceId)
    || !Array.isArray(authority?.allowedProjectIds)
    || !validCapabilityList(authority?.parentAuthorizedCapabilities ?? [])) {
    return 'INVALID_CONTEXT'
  }
  return assertProjectAllowed(authority.projectId, [...authority.allowedProjectIds])
    ? null
    : 'PROJECT_NOT_ALLOWED'
}

function validateTask(task: ReadOnlyAnalysisTask): SubagentErrorClassification | null {
  if (hasIdentityOverride(task)) return 'IDENTITY_OVERRIDE'
  if (!validId(task?.taskId)
    || task?.kind !== 'READ_ONLY_ANALYSIS'
    || typeof task?.instruction !== 'string'
    || task.instruction.trim().length === 0
    || task.instruction.length > 20_000
    || !validCapabilityList(task?.requestedCapabilities ?? [])
    || !Array.isArray(task?.acceptanceCriteria)
    || task.acceptanceCriteria.length < 1
    || task.acceptanceCriteria.length > 8
    || !task.acceptanceCriteria.every(validCriterion)) {
    return 'INVALID_CONTEXT'
  }
  return null
}

/** requested ∩ parent-authorized ∩ fixed READ_ONLY_ANALYSIS policy ∩ available tools. */
export function attenuateReadOnlyCapabilities(
  requested: readonly string[],
  parentAuthorized: readonly string[],
  tools: readonly ReadOnlySubagentTool[],
): string[] {
  const parent = new Set(parentAuthorized)
  const available = new Set(
    tools.filter((tool) => tool.effect === 'READ_ONLY').map((tool) => tool.capability),
  )
  return [...new Set(requested)]
    .filter((capability) => parent.has(capability))
    .filter((capability) => POLICY_CAPABILITIES.has(capability))
    .filter((capability) => available.has(capability))
    .sort()
}

function acceptanceVerdict(
  criteria: readonly ReadOnlyAcceptanceCriterion[],
  summary: string,
): AcceptanceVerdict[] {
  return criteria.map((criterion) => ({
    criterion_id: criterion.criterionId,
    satisfied: criterion.kind === 'SUMMARY_NON_EMPTY'
      ? summary.trim().length > 0
      : summary.includes(criterion.value),
  }))
}

function frozenIdentity(authority: SubagentAuthoritySnapshot, childRunId: string): SubagentIdentityContext {
  return Object.freeze({
    principalId: authority.principalId,
    projectId: authority.projectId,
    roleId: authority.roleId,
    missionId: authority.missionId ?? null,
    delegationId: authority.delegationId ?? null,
    workPackageId: authority.workPackageId ?? null,
    parentRunId: authority.parentRunId,
    childRunId,
    traceId: authority.traceId,
  })
}

function safeTokenCount(value: number): number | null {
  return Number.isInteger(value) && value >= 0 ? value : null
}

function boundedText(value: unknown, maxChars: number): string {
  if (typeof value !== 'string') return ''
  return value.length <= maxChars ? value : value.slice(0, maxChars)
}

function buildReceipt(
  identity: SubagentIdentityContext,
  task: ReadOnlyAnalysisTask,
  effectiveCapabilities: readonly string[],
  bounds: SubagentExecutionBounds,
  startedAt: string,
  completedAt: string,
  state: ReceiptState,
): BoundedSubagentReceipt {
  const base = {
    child_run_id: identity.childRunId,
    parent_run_id: identity.parentRunId,
    principal_id: identity.principalId,
    role_id: identity.roleId,
    project_id: identity.projectId,
    mission_id: identity.missionId,
    delegation_id: identity.delegationId,
    work_package_id: identity.workPackageId,
    trace_id: identity.traceId,
    task: { task_id: task.taskId, kind: task.kind },
    effective_capabilities: Object.freeze([...effectiveCapabilities]),
    bounds_used: Object.freeze({ ...bounds }),
    started_at: startedAt,
    completed_at: completedAt,
    terminal_status: state.status,
    summarized_result: boundedText(state.summary, bounds.maxSummaryChars),
    error_classification: state.error,
    acceptance: Object.freeze(state.acceptance.map((item) => Object.freeze({ ...item }))),
    turns_used: state.turns,
    input_tokens_used: state.inputTokens,
    output_tokens_used: state.outputTokens,
    tool_calls_used: state.toolCalls,
  } satisfies BoundedSubagentReceipt

  let receipt = base
  while (new TextEncoder().encode(JSON.stringify(receipt)).length > bounds.maxReceiptBytes
    && receipt.summarized_result.length > 0) {
    receipt = { ...receipt, summarized_result: receipt.summarized_result.slice(0, Math.floor(receipt.summarized_result.length / 2)) }
  }
  return Object.freeze(receipt)
}

function rejected(
  identity: SubagentIdentityContext,
  task: ReadOnlyAnalysisTask,
  bounds: SubagentExecutionBounds,
  effectiveCapabilities: readonly string[],
  startedAt: string,
  completedAt: string,
  error: SubagentErrorClassification,
): BoundedSubagentExecutionResult {
  return {
    receipt: buildReceipt(identity, task, effectiveCapabilities, bounds, startedAt, completedAt, {
      status: 'REJECTED', summary: '', error, acceptance: [],
      turns: 0, inputTokens: 0, outputTokens: 0, toolCalls: 0,
    }),
  }
}

/** Execute one non-durable, non-fan-out READ_ONLY_ANALYSIS child. */
export async function executeReadOnlyAnalysisSubagent(
  args: ExecuteReadOnlyAnalysisArgs,
): Promise<BoundedSubagentExecutionResult> {
  const now = args.dependencies.now ?? (() => new Date())
  const childRunId = (args.dependencies.createChildRunId ?? randomUUID)()
  const startedAt = now().toISOString()
  const identity = frozenIdentity(args.authority, childRunId)
  const finishTime = () => now().toISOString()

  const authorityError = validateAuthority(args.authority)
  if (authorityError) {
    return rejected(identity, args.task, args.bounds, [], startedAt, finishTime(), authorityError)
  }
  const taskError = validateTask(args.task)
  if (taskError) {
    return rejected(identity, args.task, args.bounds, [], startedAt, finishTime(), taskError)
  }
  if (!validBounds(args.bounds) || !UUID_PATTERN.test(childRunId)) {
    return rejected(identity, args.task, args.bounds, [], startedAt, finishTime(), 'INVALID_CONTEXT')
  }

  const task = Object.freeze({
    ...args.task,
    requestedCapabilities: Object.freeze([...args.task.requestedCapabilities]),
    acceptanceCriteria: Object.freeze(
      args.task.acceptanceCriteria.map((criterion) => Object.freeze({ ...criterion })),
    ),
  })
  const bounds = Object.freeze({ ...args.bounds })
  const parentAuthorizedCapabilities = Object.freeze([
    ...args.authority.parentAuthorizedCapabilities,
  ])
  const tools = args.dependencies.tools
  const effectiveCapabilities = attenuateReadOnlyCapabilities(
    task.requestedCapabilities,
    parentAuthorizedCapabilities,
    tools,
  )
  if (effectiveCapabilities.length === 0) {
    return rejected(identity, task, bounds, [], startedAt, finishTime(), 'NO_EFFECTIVE_CAPABILITIES')
  }

  if (args.signal?.aborted) {
    return {
      receipt: buildReceipt(identity, task, effectiveCapabilities, bounds, startedAt, finishTime(), {
        status: 'CANCELLED', summary: '', error: 'CANCELLED', acceptance: [],
        turns: 0, inputTokens: 0, outputTokens: 0, toolCalls: 0,
      }),
    }
  }

  const capacity = args.dependencies.capacity ?? processCapacity
  if (!capacity.tryAcquire()) {
    return rejected(identity, task, bounds, effectiveCapabilities, startedAt, finishTime(), 'CAPACITY_EXCEEDED')
  }

  const controller = new AbortController()
  let timeoutFired = false
  let cancellationFired = false
  const onCancellation = () => {
    cancellationFired = true
    controller.abort()
  }
  args.signal?.addEventListener('abort', onCancellation, { once: true })
  const timer = setTimeout(() => {
    timeoutFired = true
    controller.abort()
  }, bounds.maxExecutionMs)

  let turns = 0
  let inputTokens = 0
  let outputTokens = 0
  let toolCalls = 0
  let escalationAttempted = false
  let toolLimitExceeded = false
  let latest: SubagentTurnResult | null = null
  const toolMap = new Map(tools.map((tool) => [tool.capability, tool]))
  const effective = new Set(effectiveCapabilities)

  const abortResult = new Promise<{ aborted: true }>((resolve) => {
    controller.signal.addEventListener('abort', () => resolve({ aborted: true }), { once: true })
  })

  try {
    for (let turn = 1; turn <= bounds.maxTurns; turn += 1) {
      turns = turn
      const turnPromise = args.dependencies.driver.runTurn(Object.freeze({
        identity,
        task,
        effectiveCapabilities: Object.freeze([...effectiveCapabilities]),
        turn,
        remainingInputTokens: bounds.maxInputTokens - inputTokens,
        remainingOutputTokens: bounds.maxOutputTokens - outputTokens,
        signal: controller.signal,
        invokeTool: async (capability: string, input: unknown) => {
          if (controller.signal.aborted) return { ok: false, error: 'CANCELLED' as const }
          const tool = toolMap.get(capability)
          if (!effective.has(capability) || !tool || tool.effect !== 'READ_ONLY') {
            escalationAttempted = true
            return { ok: false, error: 'TOOL_NOT_ALLOWED' as const }
          }
          if (toolCalls >= bounds.maxToolCalls) {
            toolLimitExceeded = true
            return { ok: false, error: 'TOOL_LIMIT_EXCEEDED' as const }
          }
          toolCalls += 1
          try {
            return { ok: true, value: await tool.execute(input, { identity, signal: controller.signal }) }
          } catch {
            return controller.signal.aborted
              ? { ok: false, error: 'CANCELLED' as const }
              : { ok: false, error: 'TOOL_FAILED' as const }
          }
        },
      }))

      const raced = await Promise.race([
        turnPromise.then((result) => ({ aborted: false as const, result })),
        abortResult,
      ])
      if (raced.aborted) break

      latest = raced.result
      const turnInput = safeTokenCount(latest.inputTokens)
      const turnOutput = safeTokenCount(latest.outputTokens)
      if (turnInput == null || turnOutput == null) {
        latest = { state: 'FAILED', summary: '', inputTokens: 0, outputTokens: 0, error: 'invalid usage' }
        break
      }
      inputTokens += turnInput
      outputTokens += turnOutput
      if (inputTokens > bounds.maxInputTokens || outputTokens > bounds.maxOutputTokens) break
      if (latest.state !== 'CONTINUE') break
    }
  } catch {
    latest = { state: 'FAILED', summary: '', inputTokens: 0, outputTokens: 0, error: 'driver failed' }
  } finally {
    clearTimeout(timer)
    args.signal?.removeEventListener('abort', onCancellation)
    capacity.release()
  }

  let status: SubagentTerminalStatus = 'FAILED'
  let error: SubagentErrorClassification | null = 'DRIVER_FAILED'
  let summary = boundedText(latest?.summary, bounds.maxSummaryChars)
  let acceptance: AcceptanceVerdict[] = []

  if (cancellationFired) {
    status = 'CANCELLED'; error = 'CANCELLED'; summary = ''
  } else if (timeoutFired) {
    status = 'TIMED_OUT'; error = 'TIMED_OUT'; summary = ''
  } else if (escalationAttempted) {
    status = 'REJECTED'; error = 'CAPABILITY_ESCALATION'; summary = ''
  } else if (toolLimitExceeded) {
    error = 'TOOL_LIMIT_EXCEEDED'
  } else if (inputTokens > bounds.maxInputTokens) {
    error = 'INPUT_TOKEN_LIMIT_EXCEEDED'
  } else if (outputTokens > bounds.maxOutputTokens) {
    error = 'OUTPUT_TOKEN_LIMIT_EXCEEDED'
  } else if (latest?.state === 'CONTINUE') {
    error = 'TURN_LIMIT_EXCEEDED'
  } else if (latest?.state === 'SUCCEEDED') {
    acceptance = acceptanceVerdict(task.acceptanceCriteria, summary)
    if (acceptance.every((criterion) => criterion.satisfied)) {
      status = 'SUCCEEDED'; error = null
    } else {
      error = 'ACCEPTANCE_NOT_MET'
    }
  }

  return {
    receipt: buildReceipt(identity, task, effectiveCapabilities, bounds, startedAt, finishTime(), {
      status, summary, error, acceptance, turns, inputTokens, outputTokens, toolCalls,
    }),
  }
}
