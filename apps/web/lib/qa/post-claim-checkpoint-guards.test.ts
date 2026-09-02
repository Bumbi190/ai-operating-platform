/**
 * G3C-3A — structural rot guard for the post-claim checkpoint.
 *
 * Narrow by design. It pins that the canonical checkpoint is still WIRED into
 * the boundaries this slice took ownership of, and nothing more.
 *
 * ── WHAT THIS DOES NOT CLAIM ────────────────────────────────────────────────
 * This is not G4-level discovery. It cannot find a run family invented next
 * month, and it does not try: a guard that pretends to prove all future
 * execution would be worse than one whose limits are written down. It protects
 * the four boundaries that exist today, plus the probe callback.
 */

import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const code = (p: string) =>
  readFileSync(join(process.cwd(), p), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').replace(/\s+/g, ' ')

/** The boundaries G3C-3A owns. Each must reach the canonical checkpoint. */
const WIRED = [
  ['app/api/runs/drain/route.ts',        'checkpointClaimedRun'],
  ['lib/ai/workflow-executor.ts',        'checkpointClaimedRun'],
  ['lib/ai/workflow-runner.ts',          'checkpointClaimedRun'],
  ['lib/workflows/action-run.ts',        'checkpointClaimedRun'],
  ['lib/workflows/action-executor.ts',   'assertWorkflowActionStillAuthorized'],
] as const

describe('G3C-3A · the checkpoint stays wired', () => {
  /**
   * Presence is not effect. A mutation that stubbed the call but left
   * `void checkpointClaimedRun` behind satisfied a `toContain(symbol)` guard
   * while the checkpoint no longer ran — the same flaw G3C-2B's symbol registry
   * had. So the pin requires an AWAITED CALL whose verdict is actually branched
   * on, and separately bans the dead-code forms that fake one.
   */
  it.each(WIRED)('%s really CALLS the canonical checkpoint', (file, symbol) => {
    const body = code(file)
    expect(body, 'an awaited call, not a mention')
      .toMatch(new RegExp(`await ${symbol}\\(`))
  })

  it.each(WIRED)('%s branches on the verdict', (file) => {
    const body = code(file)
    // Every wiring site must consume the answer. A call whose result is thrown
    // away is indistinguishable from no call at all.
    expect(body).toMatch(/if \(!(entry|gate|preDispatch)\.allowed\)|if \(!again\.allowed\)|if \(!gate\.allowed\)/)
  })

  it('no wiring site parks the checkpoint behind unreachable code', () => {
    const offenders: string[] = []
    for (const [file] of WIRED) {
      const body = code(file)
      if (/(if \(\s*false\s*\)|&&\s*false|false\s*&&)[^;]{0,160}(checkpointClaimedRun|assertWorkflowActionStillAuthorized|isRunCheckpointRefusal)/.test(body)
          || /void (checkpointClaimedRun|assertWorkflowActionStillAuthorized)/.test(body)) {
        offenders.push(file)
      }
    }
    expect(offenders, 'a disabled checkpoint is worse than none — it looks present')
      .toEqual([])
  })

  it('the pre-dispatch contract has a REAL runtime caller', () => {
    // It shipped with zero. The executor called readiness only, so the
    // documented third checkpoint was a comment rather than a behaviour.
    const exec = code('lib/workflows/action-executor.ts')
    expect(exec).toContain('assertWorkflowActionStillAuthorized(')
  })

  it('the pre-dispatch checkpoint precedes DISPATCH_STARTED', () => {
    const exec = code('lib/workflows/action-executor.ts')
    const check = exec.indexOf('assertWorkflowActionStillAuthorized(')
    const phase = exec.indexOf("action_phase: 'DISPATCH_STARTED'")
    expect(check).toBeGreaterThan(-1)
    expect(phase).toBeGreaterThan(-1)
    expect(check, 'authority is established BEFORE the packet-emitting phase write')
      .toBeLessThan(phase)
  })

  it('the pre-dispatch checkpoint sits AFTER readiness, not before it', () => {
    // Placing it earlier would leave exactly the window this slice exists to
    // close: readiness passes, two DB round-trips happen, and a stop or cancel
    // committing in between is never seen. "Immediately before dispatch" is the
    // requirement — not merely "somewhere before dispatch".
    const exec = code('lib/workflows/action-executor.ts')
    const readiness = exec.indexOf('assertWorkflowActionReady(db, run.id)')
    const check = exec.indexOf('assertWorkflowActionStillAuthorized(')
    const phase = exec.indexOf("action_phase: 'DISPATCH_STARTED'")
    expect(readiness).toBeGreaterThan(-1)
    expect(check, 'the fresh check comes after the stale readiness read')
      .toBeGreaterThan(readiness)
    expect(check, 'and immediately before the packet-emitting phase write')
      .toBeLessThan(phase)
    // Nothing that reads the world may sit between them.
    const between = exec.slice(check, phase)
    expect(between, 'no further DB reads may reopen the window')
      .not.toMatch(/await (readInstance|readDefinitionById)\(/)
  })

  it('the handler is only reached after the DISPATCH_STARTED fence', () => {
    const exec = code('lib/workflows/action-executor.ts')
    const phase = exec.indexOf("action_phase: 'DISPATCH_STARTED'")
    const handler = exec.indexOf('await handler({')
    expect(phase).toBeLessThan(handler)
    expect(exec, 'a lost claim at the phase write means no handler call')
      .toContain('if (started.fenced) return')
  })

  it('the checkpoint owns no stop truth table of its own', () => {
    // Raw flag reads here would be a second answer to "is it paused", which is
    // how two answers start disagreeing.
    const cp = code('lib/governance/run-execution-checkpoint.ts')
    expect(cp).toContain('resolveExecutionStop')
    expect(cp, 'never a raw global flag read').not.toContain('automation_paused')
    expect(cp, 'never a raw project flag read').not.toContain('execution_paused')
  })

  it('the checkpoint is not gated on any H1 rollout flag', () => {
    // Canonical governance whose guarantee evaporates when an unrelated rollout
    // flag is unset is not a guarantee.
    const cp = code('lib/governance/run-execution-checkpoint.ts')
    for (const flag of ['H1_CANCEL', 'H1_FENCING', 'H1_UNIFIED_EXECUTOR']) {
      expect(cp, `${flag} must not gate the canonical checkpoint`).not.toContain(flag)
    }
  })

  it('lifecycle writes are ownership-conditioned', () => {
    const cp = code('lib/governance/run-execution-checkpoint.ts')
    // Both writes carry id + status + claim_id, so a rotated claim hits zero rows.
    const conditioned = cp.match(/\.eq\('id', runId\)\.eq\('status', 'running'\)\.eq\('claim_id', claimId\)/g) ?? []
    expect(conditioned.length, 'release and terminalize are both conditioned')
      .toBeGreaterThanOrEqual(2)
  })

  it('a stop release records no failure', () => {
    const cp = code('lib/governance/run-execution-checkpoint.ts')
    const i = cp.indexOf('export async function releaseStoppedRun')
    const body = cp.slice(i, i + 700)
    expect(body).toContain("status: 'pending'")
    expect(body, 'a stop is not a provider failure').not.toContain('last_error')
  })

  it('the drain handles checkpoint refusals before generic failure accounting', () => {
    const drain = code('app/api/runs/drain/route.ts')
    // A live branch, not a mention: `if (false && isRunCheckpointRefusal(e))`
    // would otherwise satisfy an indexOf check while every refusal fell through
    // to the failure path.
    expect(drain, 'the refusal branch must be reachable')
      .toMatch(/if \(isRunCheckpointRefusal\(e\)\) \{/)
    const refusal = drain.indexOf('if (isRunCheckpointRefusal(e)) {')
    const failed = drain.indexOf("status: 'failed'")
    expect(refusal).toBeGreaterThan(-1)
    if (failed > -1) {
      expect(refusal, 'control flow is classified before failure').toBeLessThan(failed)
    }
  })

  it('the legacy context write is ownership-conditioned when a claim exists', () => {
    const legacy = code('lib/ai/workflow-runner.ts')
    expect(legacy, 'the unfenced authoritative write is gone')
      .toContain(".eq('id', runId).eq('status', 'running').eq('claim_id', claimId)")
  })

  it('the legacy path keeps its G3C-1 provider contract', () => {
    // G3C-3A adds ownership above the paid boundary; it never replaces it.
    const legacy = code('lib/ai/workflow-runner.ts')
    expect(legacy).toContain("context: 'AUTONOMOUS'")
    expect(legacy).toContain('projectScope({ projectId })')
  })

  it('the multi-request probe re-authorises between requests', () => {
    const adapter = code('lib/workflows/adapters/familje-stunden/index.ts')
    expect(adapter, 'the callback is invoked inside the request loop')
      .toContain('if (beforeAttempt) await beforeAttempt()')
    expect(adapter, 'governance logic stays above the adapter')
      .not.toContain('resolveExecutionStop')
  })
})
