/**
 * lib/governance/execution-preflight.ts — EARLY eligibility, not the guarantee.
 *
 * ── WHAT THIS IS FOR ───────────────────────────────────────────────────────
 * Some paths do expensive work before they reach a paid provider: claiming a
 * row, running a second paid model to build a brief, assembling a prompt. Doing
 * all of that while execution is already stopped wastes money and time and ends
 * in a refusal anyway.
 *
 * So this answers the same question, earlier, with the SAME contract and through
 * the SAME canonical resolver. It is an optimisation.
 *
 * ── WHAT THIS IS NOT ───────────────────────────────────────────────────────
 * It is NOT the enforcement point, and its answer must never be carried forward.
 * `withGovernedSpend` resolves a FRESH decision immediately before dispatch,
 * because a pause can commit in the gap — which is precisely the stale-read
 * window G3B closed in SQL. An early "allowed" means "do not bother stopping
 * yet", never "you are cleared to spend".
 *
 * It lives in its own module rather than in the authority itself because it
 * needs the billing module's project resolver, and `governed-spend` imports the
 * authority: putting this there would make that a cycle.
 */

import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveGovernedProjectId } from '@/lib/cost/governed-spend'
import {
  resolveExecutionStopForContract,
  type ExecutionContract,
  type StopDecision,
} from './execution-stop'

/**
 * Ask the canonical authority whether this work is currently eligible.
 *
 * Callers use it to skip preparation. They must NOT treat a `true` as
 * authorisation to dispatch — the boundary re-decides.
 */
export async function resolveExecutionEligibility(
  contract: ExecutionContract,
): Promise<StopDecision> {
  return resolveExecutionStopForContract(
    createAdminClient(),
    contract,
    async ref => {
      const r = await resolveGovernedProjectId(ref)
      return r.ok ? r.projectId : null
    },
  )
}
