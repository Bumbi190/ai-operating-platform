/**
 * P1 bounded subagent execution contract.
 *
 * This contract carries execution context, not authority. The caller must pass
 * a server-owned snapshot from an existing Omnira governance boundary. The
 * executor can only attenuate that snapshot and never creates a grant.
 */

export const READ_ONLY_ANALYSIS_CAPABILITIES = [
  'repository.read',
  'architecture.read',
  'project.records.read',
] as const

export type ReadOnlyAnalysisCapability = typeof READ_ONLY_ANALYSIS_CAPABILITIES[number]

export type SubagentTerminalStatus =
  | 'SUCCEEDED'
  | 'FAILED'
  | 'CANCELLED'
  | 'TIMED_OUT'
  | 'REJECTED'

export type SubagentErrorClassification =
  | 'INVALID_CONTEXT'
  | 'IDENTITY_OVERRIDE'
  | 'PROJECT_NOT_ALLOWED'
  | 'NO_EFFECTIVE_CAPABILITIES'
  | 'CAPACITY_EXCEEDED'
  | 'CAPABILITY_ESCALATION'
  | 'TOOL_LIMIT_EXCEEDED'
  | 'TURN_LIMIT_EXCEEDED'
  | 'INPUT_TOKEN_LIMIT_EXCEEDED'
  | 'OUTPUT_TOKEN_LIMIT_EXCEEDED'
  | 'ACCEPTANCE_NOT_MET'
  | 'DRIVER_FAILED'
  | 'CANCELLED'
  | 'TIMED_OUT'

/** Server-owned identity and parent authority. No model-owned task field overlaps it. */
export interface SubagentAuthoritySnapshot {
  readonly principalId: string
  readonly allowedProjectIds: readonly string[]
  readonly projectId: string
  readonly roleId: string
  readonly missionId?: string | null
  readonly delegationId?: string | null
  readonly workPackageId?: string | null
  readonly parentRunId: string
  readonly traceId: string
  readonly parentAuthorizedCapabilities: readonly string[]
}

export interface SubagentIdentityContext {
  readonly principalId: string
  readonly projectId: string
  readonly roleId: string
  readonly missionId: string | null
  readonly delegationId: string | null
  readonly workPackageId: string | null
  readonly parentRunId: string
  readonly childRunId: string
  readonly traceId: string
}

export type ReadOnlyAcceptanceCriterion =
  | {
      readonly criterionId: string
      readonly kind: 'SUMMARY_NON_EMPTY'
    }
  | {
      readonly criterionId: string
      readonly kind: 'SUMMARY_INCLUDES'
      readonly value: string
    }

export interface ReadOnlyAnalysisTask {
  readonly taskId: string
  readonly kind: 'READ_ONLY_ANALYSIS'
  readonly instruction: string
  readonly requestedCapabilities: readonly string[]
  readonly acceptanceCriteria: readonly ReadOnlyAcceptanceCriterion[]
}

export interface SubagentExecutionBounds {
  readonly maxTurns: number
  readonly maxExecutionMs: number
  readonly maxInputTokens: number
  readonly maxOutputTokens: number
  readonly maxToolCalls: number
  readonly maxSummaryChars: number
  readonly maxReceiptBytes: number
}

export interface ReadOnlySubagentToolContext {
  readonly identity: SubagentIdentityContext
  readonly signal: AbortSignal
}

/** P1 cannot register a side-effecting tool: READ_ONLY is the only valid effect. */
export interface ReadOnlySubagentTool {
  readonly capability: string
  readonly effect: 'READ_ONLY'
  execute(input: unknown, context: ReadOnlySubagentToolContext): Promise<unknown>
}

export interface SubagentToolResult {
  readonly ok: boolean
  readonly value?: unknown
  readonly error?: 'TOOL_NOT_ALLOWED' | 'TOOL_LIMIT_EXCEEDED' | 'TOOL_FAILED' | 'CANCELLED'
}

export interface SubagentTurnContext {
  readonly identity: SubagentIdentityContext
  readonly task: ReadOnlyAnalysisTask
  readonly effectiveCapabilities: readonly string[]
  readonly turn: number
  readonly remainingInputTokens: number
  readonly remainingOutputTokens: number
  readonly signal: AbortSignal
  invokeTool(capability: string, input: unknown): Promise<SubagentToolResult>
}

export interface SubagentTurnResult {
  readonly state: 'CONTINUE' | 'SUCCEEDED' | 'FAILED'
  readonly summary: string
  readonly inputTokens: number
  readonly outputTokens: number
  readonly error?: string | null
}

/** Adapter seam for an existing Omnira model/runtime implementation. */
export interface ReadOnlySubagentDriver {
  runTurn(context: SubagentTurnContext): Promise<SubagentTurnResult>
}

export interface AcceptanceVerdict {
  readonly criterion_id: string
  readonly satisfied: boolean
}

export interface BoundedSubagentReceipt {
  readonly child_run_id: string
  readonly parent_run_id: string
  readonly principal_id: string
  readonly role_id: string
  readonly project_id: string
  readonly mission_id: string | null
  readonly delegation_id: string | null
  readonly work_package_id: string | null
  readonly trace_id: string
  readonly task: {
    readonly task_id: string
    readonly kind: 'READ_ONLY_ANALYSIS'
  }
  readonly effective_capabilities: readonly string[]
  readonly bounds_used: SubagentExecutionBounds
  readonly started_at: string
  readonly completed_at: string
  readonly terminal_status: SubagentTerminalStatus
  readonly summarized_result: string
  readonly error_classification: SubagentErrorClassification | null
  readonly acceptance: readonly AcceptanceVerdict[]
  readonly turns_used: number
  readonly input_tokens_used: number
  readonly output_tokens_used: number
  readonly tool_calls_used: number
}

export interface BoundedSubagentExecutionResult {
  readonly receipt: BoundedSubagentReceipt
}
