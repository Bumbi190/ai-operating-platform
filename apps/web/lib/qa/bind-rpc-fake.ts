/**
 * lib/qa/bind-rpc-fake.ts — a test double for the Phase 3B1B atomic bind RPC.
 *
 * Since 3B1B a bound run is created ONLY by `bind_workflow_action_run`, which
 * writes the run AND its bind provenance in one transaction. Fakes that used to
 * record a `runs` insert now record BOTH writes, in that order, so a test that
 * asserts "only the run was written" has to say what is actually true: the run
 * and its bind provenance, and nothing else (no evidence, no transition).
 *
 * The RPC is licence-exempt by construction: it accepts only identity fields
 * and writes FIXED READ_ONLY run values and FIXED exempt provenance. The fake
 * mirrors exactly that, so no test can read a caller-supplied classification.
 */

export interface RecordedWrite { table: string; row: Record<string, unknown> }

export const BIND_RPC = 'bind_workflow_action_run'

/** The only parameters the RPC accepts. */
export const BIND_RPC_PARAMS = [
  'p_project_id', 'p_workflow_instance_id', 'p_workflow_def_hash', 'p_workflow_from_state',
  'p_action_kind', 'p_target_version_hash', 'p_idempotency_key', 'p_attempt_group',
] as const

/** Map the RPC's arguments onto the two rows it writes. */
export function rowsFromBindArgs(args: Record<string, unknown>): RecordedWrite[] {
  const run: Record<string, unknown> = {
    project_id: args.p_project_id,
    status: 'pending',
    kind: `workflow.action:${String(args.p_action_kind)}`,
    max_attempts: 5,
    policy_class: 'non_destructive',
    workflow_instance_id: args.p_workflow_instance_id,
    workflow_def_hash: args.p_workflow_def_hash,
    workflow_from_state: args.p_workflow_from_state,
    action_kind: args.p_action_kind,
    action_class: 'READ_ONLY',
    target_version_hash: args.p_target_version_hash,
    authorization_id: null,
    idempotency_key: args.p_idempotency_key,
    attempt_group: args.p_attempt_group,
  }
  const trace: Record<string, unknown> = {
    boundary: 'bind', claim_id: null,
    policy_mode: 'license_exempt_observation', policy_reason: 'canonical_read_only_observation',
    reason: 'exempt_observation', required_level: 'L0',
  }
  return [{ table: 'runs', row: run }, { table: 'run_autonomy_decisions', row: trace }]
}

/**
 * An `rpc` implementation for a chainable fake client. Records both writes into
 * `inserted` and answers with the RPC's `(bound_run_id, bind_event_id)` shape.
 * An argument the real function does not accept is a test failure, not a no-op.
 */
export function bindRpcFake(
  inserted: RecordedWrite[], runId = 'run-created-1',
): (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> {
  return async (name, args) => {
    if (name !== BIND_RPC) return { data: null, error: { message: `unexpected rpc ${name}` } }
    const extra = Object.keys(args).filter(k => !(BIND_RPC_PARAMS as readonly string[]).includes(k))
    if (extra.length > 0) return { data: null, error: { message: `bind RPC has no parameter ${extra.join(', ')}` } }
    inserted.push(...rowsFromBindArgs(args))
    return { data: [{ bound_run_id: runId, bind_event_id: 'bind-event-1' }], error: null }
  }
}
