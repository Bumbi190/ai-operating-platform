/**
 * lib/qa/bind-rpc-fake.ts — a test double for the Phase 3B1B atomic bind RPC.
 *
 * Since 3B1B a bound run is created ONLY by `bind_workflow_action_run`, which
 * writes the run AND its bind provenance in one transaction. Fakes that used to
 * record a `runs` insert now record BOTH writes, in that order, so a test that
 * asserts "only the run was written" has to say what is actually true: the run
 * and its bind provenance, and nothing else (no evidence, no transition).
 *
 * The recorded run row uses the column names the RPC inserts, mapped from its
 * `p_*` arguments, so existing assertions on `attempt_group`, `action_class`
 * and friends keep reading real values rather than a mock's.
 */

export interface RecordedWrite { table: string; row: Record<string, unknown> }

export const BIND_RPC = 'bind_workflow_action_run'

/** Map the RPC's arguments onto the two rows it writes. */
export function rowsFromBindArgs(args: Record<string, unknown>): RecordedWrite[] {
  const run: Record<string, unknown> = {
    project_id: args.p_project_id,
    status: 'pending',
    kind: `workflow.action:${String(args.p_action_kind)}`,
    max_attempts: args.p_max_attempts,
    policy_class: args.p_policy_class,
    workflow_instance_id: args.p_workflow_instance_id,
    workflow_def_hash: args.p_workflow_def_hash,
    workflow_from_state: args.p_workflow_from_state,
    action_kind: args.p_action_kind,
    action_class: args.p_action_class,
    target_version_hash: args.p_target_version_hash,
    authorization_id: args.p_authorization_id,
    idempotency_key: args.p_idempotency_key,
    attempt_group: args.p_attempt_group,
  }
  const trace: Record<string, unknown> = { boundary: 'bind', claim_id: null }
  for (const [k, v] of Object.entries(args)) {
    if (k.startsWith('p_') && ['p_policy_mode', 'p_policy_reason', 'p_reason', 'p_license_id',
      'p_license_generation', 'p_license_reason', 'p_required_level', 'p_effective_level',
      'p_survival_state', 'p_survival_ceiling', 'p_survival_reason', 'p_bounded_by',
      'p_license_resolved_at', 'p_survival_as_of'].includes(k)) {
      trace[k.slice(2)] = v
    }
  }
  return [{ table: 'runs', row: run }, { table: 'run_autonomy_decisions', row: trace }]
}

/**
 * An `rpc` implementation for a chainable fake client. Records both writes into
 * `inserted` and answers with the RPC's `(bound_run_id, bind_event_id)` shape.
 */
export function bindRpcFake(
  inserted: RecordedWrite[], runId = 'run-created-1',
): (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> {
  return async (name, args) => {
    if (name !== BIND_RPC) return { data: null, error: { message: `unexpected rpc ${name}` } }
    inserted.push(...rowsFromBindArgs(args))
    return { data: [{ bound_run_id: runId, bind_event_id: 'bind-event-1' }], error: null }
  }
}
