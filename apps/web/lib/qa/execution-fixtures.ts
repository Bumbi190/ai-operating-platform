/**
 * lib/qa/execution-fixtures.ts — named execution contracts for tests ONLY.
 *
 * Production has no defaults and never will: an omitted context would be filled
 * in by whichever value compiles, and that is always the permissive one. Tests
 * are different — many of them assert how a provider REQUEST is built and do not
 * care why the work is running. For those, an inline literal is noise that
 * obscures the assertion.
 *
 * So these are named, explicit, and greppable. Each says what it models, so a
 * reader can tell "this test is about request shape" from "this test is about
 * an autonomous path" without decoding an object literal.
 *
 * NOT importable from production code — the structural guard asserts that.
 */

import { GLOBAL_ONLY, projectScope, type ExecutionContract } from '@/lib/governance/execution-stop'

/** Unattended platform-level work. The default *stance* for shape-only tests. */
export const TEST_AUTONOMOUS_GLOBAL: ExecutionContract =
  { context: 'AUTONOMOUS', scope: GLOBAL_ONLY }

/** Unattended work belonging to one project. */
export const testAutonomousProject = (projectId: string): ExecutionContract =>
  ({ context: 'AUTONOMOUS', scope: projectScope({ projectId }) })

/** A human asked for something with a side effect, in one project. */
export const testOperatorExecution = (projectId: string): ExecutionContract =>
  ({ context: 'OPERATOR_EXECUTION', scope: projectScope({ projectId }) })

/** A human asked for something with a side effect, platform-level. */
export const TEST_OPERATOR_EXECUTION_GLOBAL: ExecutionContract =
  { context: 'OPERATOR_EXECUTION', scope: GLOBAL_ONLY }

/** Ordinary assistance — the ONLY contract a stop does not refuse. */
export const TEST_OPERATOR_INTERACTIVE: ExecutionContract =
  { context: 'OPERATOR_INTERACTIVE', scope: GLOBAL_ONLY }
